import hashlib
import logging
from datetime import datetime, timezone

import feedparser
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.news.sentiment import SentimentAnalyzer

logger = logging.getLogger(__name__)

RSS_FEEDS = {
    "Google News India": "https://news.google.com/rss/search?q=india+stock+market&hl=en-IN&gl=IN&ceid=IN:en",
    "Google News NSE": "https://news.google.com/rss/search?q=NSE+Nifty+BSE+Sensex&hl=en-IN&gl=IN&ceid=IN:en",
    "LiveMint Markets": "https://www.livemint.com/rss/markets",
    "NDTV Profit": "https://feeds.feedburner.com/ndtvprofit-latest",
    "Yahoo Finance": "https://finance.yahoo.com/rss/topstories",
    "Google News US Markets": "https://news.google.com/rss/search?q=US+stock+market+NASDAQ+S%26P+500&hl=en-US&gl=US&ceid=US:en",
    "Google News Wall Street": "https://news.google.com/rss/search?q=Wall+Street+earnings+stocks&hl=en-US&gl=US&ceid=US:en",
}


class NewsService:
    def __init__(self):
        self.sentiment = SentimentAnalyzer()

    def _hash_article(self, url: str, title: str) -> str:
        return hashlib.sha256(f"{url}{title}".encode()).hexdigest()[:64]

    def _parse_date(self, entry) -> datetime:
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            import time
            return datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        return datetime.now(timezone.utc)

    def fetch_articles(self) -> list[dict]:
        articles = []
        for source, url in RSS_FEEDS.items():
            try:
                feed = feedparser.parse(url)
                for entry in feed.entries[:20]:
                    title = getattr(entry, "title", "")
                    summary = getattr(entry, "summary", "")
                    link = getattr(entry, "link", "")
                    if not title or not link:
                        continue
                    text = f"{title}. {summary}"
                    scores = self.sentiment.analyze(text)
                    articles.append({
                        "article_hash": self._hash_article(link, title),
                        "title": title[:500],
                        "summary": summary[:2000] if summary else None,
                        "url": link[:1000],
                        "source": source,
                        "published_at": self._parse_date(entry),
                        "related_symbols": self.sentiment.extract_symbols(text),
                        **scores,
                    })
            except Exception as e:
                logger.warning(f"Failed to fetch RSS from {source}: {e}")
        return articles

    async def refresh(self, db: AsyncSession):
        articles = self.fetch_articles()
        from app.db.models import NewsArticle
        from app.db.upsert import insert_ignore_single
        for article in articles:
            await insert_ignore_single(db, NewsArticle, article, ["article_hash"])
        await db.commit()
        logger.info(f"Refreshed {len(articles)} news articles")

    async def get_sentiment_summary(self, symbol: str, db: AsyncSession) -> dict:
        from datetime import timedelta
        from sqlalchemy import select, func
        from app.db.models import NewsArticle

        now = datetime.now(timezone.utc)
        now_naive = now.replace(tzinfo=None)  # SQLite stores naive datetimes
        base = symbol.replace(".NS", "").replace(".BO", "")

        result = await db.execute(
            select(NewsArticle)
            .where(NewsArticle.published_at >= now_naive - timedelta(days=30))
            .order_by(NewsArticle.published_at.desc())
        )
        articles = result.scalars().all()
        relevant = [a for a in articles if base.lower() in a.title.lower()
                    or base.lower() in (a.summary or "").lower()
                    or symbol in (a.related_symbols or [])]

        def avg_sentiment(arts):
            vals = [a.sentiment_compound for a in arts if a.sentiment_compound is not None]
            return sum(vals) / len(vals) if vals else 0.0

        recent_7d = [a for a in relevant if a.published_at >= now_naive - timedelta(days=7)]
        avg_7d = avg_sentiment(recent_7d)
        avg_30d = avg_sentiment(relevant)
        label = "bullish" if avg_7d > 0.05 else "bearish" if avg_7d < -0.05 else "neutral"

        return {
            "symbol": symbol,
            "avg_sentiment_7d": round(avg_7d, 4),
            "avg_sentiment_30d": round(avg_30d, 4),
            "article_count_7d": len(recent_7d),
            "article_count_30d": len(relevant),
            "sentiment_label": label,
            "top_headlines": [a.title for a in recent_7d[:3]],
        }
