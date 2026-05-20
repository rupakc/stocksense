import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.news import NewsArticleOut, SentimentSummary, WebNewsArticle
from app.services.news.rss_fetcher import NewsService
from app.services.news.web_search import WebNewsSearcher

router = APIRouter()
logger = logging.getLogger(__name__)
news_service = NewsService()
web_searcher = WebNewsSearcher()


@router.get("/", response_model=list[NewsArticleOut])
async def get_news(
    symbol: str | None = Query(default=None),
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Return recent RSS/cached news articles, optionally filtered by symbol."""
    await news_service.refresh(db=db)
    from sqlalchemy import select, desc
    from app.db.models import NewsArticle

    q = select(NewsArticle).order_by(desc(NewsArticle.published_at)).limit(limit)
    if symbol:
        base = symbol.replace(".NS", "").replace(".BO", "").lower()
        q = q.where(NewsArticle.title.ilike(f"%{base}%") | NewsArticle.summary.ilike(f"%{base}%"))
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/web-search", response_model=list[WebNewsArticle])
async def web_search_news(
    symbol: str = Query(..., description="Stock symbol, e.g. RELIANCE or AAPL"),
    exchange: str = Query(default="NSE", description="Exchange: NSE, BSE, or NASDAQ"),
    limit: int = Query(default=25, le=50),
):
    """
    Search the internet for latest company-specific news.
    Aggregates Yahoo Finance, Google News, DuckDuckGo and Bing News.
    Results are relevance-scored for stock price prediction utility.
    """
    from app.core.exchanges import get_suffix

    bare = symbol.replace(".NS", "").replace(".BO", "").upper()
    suffix = get_suffix(exchange.upper())
    full_symbol = f"{bare}{suffix}"
    try:
        articles = web_searcher.search(full_symbol, limit=limit)
    except Exception as exc:
        logger.error(f"Web news search failed for {full_symbol}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Search temporarily unavailable")

    if not articles:
        raise HTTPException(status_code=404, detail=f"No relevant news found for {bare}.")

    return articles


@router.get("/sentiment/{symbol}", response_model=SentimentSummary)
async def get_sentiment(symbol: str, db: AsyncSession = Depends(get_db)):
    """Aggregate sentiment scores for a symbol over 7 and 30 days."""
    return await news_service.get_sentiment_summary(symbol, db=db)
