"""
Internet news search for company-specific articles.

Sources (all free, no API keys):
  1. yfinance ticker.news   — Yahoo Finance curated news per ticker
  2. Google News RSS         — company-specific query via public RSS
  3. DuckDuckGo news         — broad web coverage via ddgs library
  4. Bing News RSS           — additional coverage

Results are:
  - Deduplicated by URL
  - Scored for relevance to stock price prediction
  - Sentiment-analysed via VADER
  - Sorted by (relevance × recency)
"""
import hashlib
import logging
import re
from datetime import datetime, timezone
from urllib.parse import quote_plus

import feedparser
import requests

from app.services.news.sentiment import SentimentAnalyzer

logger = logging.getLogger(__name__)

# Keywords that indicate investment-relevant news (boost relevance score)
PRICE_RELEVANT_KEYWORDS = [
    "earnings", "profit", "revenue", "results", "quarterly", "annual",
    "acquisition", "merger", "takeover", "buyout", "deal", "contract",
    "upgrade", "downgrade", "target price", "analyst", "rating", "forecast",
    "guidance", "outlook", "dividend", "buyback", "share repurchase",
    "ipo", "fpo", "rights issue", "fundraise", "stake",
    "ceo", "managing director", "board", "leadership",
    "regulatory", "sebi", "rbi", "approval", "penalty", "fine",
    "capacity", "expansion", "launch", "product", "plant",
    "debt", "loan", "npa", "default", "credit",
    "market share", "order", "tender", "win",
    "q1", "q2", "q3", "q4", "fy", "ebitda", "pat", "eps",
]

# Sentinel for irrelevant noise
NOISE_KEYWORDS = [
    "astrology", "horoscope", "zodiac", "celebrity", "cricket",
    "bollywood", "film", "movie", "recipe",
]

# Company name lookup for search queries (all exchanges)
COMPANY_NAMES = {
    # ── Indian (NSE/BSE) ──
    "RELIANCE": "Reliance Industries",
    "TCS":      "Tata Consultancy Services TCS",
    "INFY":     "Infosys",
    "HDFCBANK": "HDFC Bank",
    "ICICIBANK": "ICICI Bank",
    "SBIN":     "State Bank of India SBI",
    "WIPRO":    "Wipro",
    "AXISBANK": "Axis Bank",
    "KOTAKBANK": "Kotak Mahindra Bank",
    "BAJFINANCE": "Bajaj Finance",
    "MARUTI":   "Maruti Suzuki",
    "TITAN":    "Titan Company",
    "SUNPHARMA": "Sun Pharma",
    "TATAMOTORS": "Tata Motors",
    "TATASTEEL": "Tata Steel",
    "HINDALCO": "Hindalco",
    "ONGC":     "ONGC Oil Natural Gas",
    "NTPC":     "NTPC Power",
    "POWERGRID": "Power Grid Corporation",
    "LTIM":     "LTIMindtree",
    "LT":       "Larsen Toubro L&T",
    "TECHM":    "Tech Mahindra",
    "ULTRACEMCO": "UltraTech Cement",
    "ASIANPAINT": "Asian Paints",
    "ITC":      "ITC Limited",
    "HINDUNILVR": "Hindustan Unilever HUL",
    "BHARTIARTL": "Bharti Airtel",
    "NH":       "Narayana Health NH",
    "ADANIENT": "Adani Enterprises",
    "ADANIPORTS": "Adani Ports",
    "ADANIGREEN": "Adani Green Energy",
    "DMART":    "Avenue Supermarts DMart",
    "BAJAJFINSV": "Bajaj Finserv",
    "NESTLEIND": "Nestle India",
    "HCLTECH":  "HCL Technologies",
    "INDUSINDBK": "IndusInd Bank",
    "M&M":      "Mahindra Mahindra",
    "DIVISLAB": "Divi's Laboratories",
    "CIPLA":    "Cipla",
    "DRREDDY":  "Dr Reddy's Laboratories",
    "BPCL":     "BPCL Bharat Petroleum",
    "IOC":      "Indian Oil Corporation",
    "GRASIM":   "Grasim Industries",
    "HDFCLIFE": "HDFC Life Insurance",
    "SBILIFE":  "SBI Life Insurance",
    "ICICIPRULI": "ICICI Prudential Life",
    # ── US (NASDAQ/NYSE) ──
    "AAPL":  "Apple",
    "MSFT":  "Microsoft",
    "GOOGL": "Alphabet Google",
    "GOOG":  "Alphabet Google",
    "AMZN":  "Amazon",
    "NVDA":  "NVIDIA",
    "META":  "Meta Platforms Facebook",
    "TSLA":  "Tesla",
    "BRK-B": "Berkshire Hathaway",
    "JPM":   "JPMorgan Chase",
    "V":     "Visa",
    "JNJ":   "Johnson Johnson",
    "UNH":   "UnitedHealth Group",
    "MA":    "Mastercard",
    "XOM":   "Exxon Mobil",
    "PG":    "Procter Gamble",
    "HD":    "Home Depot",
    "AVGO":  "Broadcom",
    "CVX":   "Chevron",
    "MRK":   "Merck",
    "ABBV":  "AbbVie",
    "LLY":   "Eli Lilly",
    "PEP":   "PepsiCo",
    "KO":    "Coca-Cola",
    "COST":  "Costco",
    "ADBE":  "Adobe",
    "CRM":   "Salesforce",
    "NFLX":  "Netflix",
    "AMD":   "AMD Advanced Micro Devices",
    "INTC":  "Intel",
    "CSCO":  "Cisco",
    "WMT":   "Walmart",
    "DIS":   "Walt Disney",
    "BA":    "Boeing",
    "NKE":   "Nike",
    "PYPL":  "PayPal",
    "QCOM":  "Qualcomm",
    "ORCL":  "Oracle",
    "IBM":   "IBM",
    "GS":    "Goldman Sachs",
    "MS":    "Morgan Stanley",
    "CAT":   "Caterpillar",
    "UBER":  "Uber",
    "SQ":    "Block Square",
    "SHOP":  "Shopify",
    "PLTR":  "Palantir",
    "COIN":  "Coinbase",
    "SNOW":  "Snowflake",
    "ZM":    "Zoom Video",
    "SPOT":  "Spotify",
    "ABNB":  "Airbnb",
    "RIVN":  "Rivian",
    "LCID":  "Lucid Motors",
    "SOFI":  "SoFi Technologies",
    "MARA":  "Marathon Digital",
}


def _company_name(symbol: str) -> str:
    base = symbol.replace(".NS", "").replace(".BO", "").upper()
    return COMPANY_NAMES.get(base, base)


def _clean_symbol(symbol: str) -> str:
    return symbol.replace(".NS", "").replace(".BO", "").upper()


def _is_us_symbol(symbol: str) -> bool:
    """Return True if the symbol has no Indian exchange suffix."""
    return not symbol.endswith((".NS", ".BO"))


def _relevance_score(title: str, summary: str, symbol: str, company_name: str) -> float:
    """0.0–1.0 relevance to stock price prediction."""
    text = f"{title} {summary}".lower()
    sym_base = _clean_symbol(symbol).lower()
    company_words = company_name.lower().split()

    # Noise filter
    if any(kw in text for kw in NOISE_KEYWORDS):
        return 0.1

    score = 0.0

    # Company mention in title (strong signal)
    title_lower = title.lower()
    if sym_base in title_lower:
        score += 0.40
    elif any(w in title_lower for w in company_words if len(w) > 3):
        score += 0.30

    # Company mention anywhere
    if sym_base in text or any(w in text for w in company_words if len(w) > 3):
        score += 0.20

    # Price-relevant keywords
    hit_count = sum(1 for kw in PRICE_RELEVANT_KEYWORDS if kw in text)
    score += min(0.30, hit_count * 0.06)

    return min(1.0, round(score, 3))


def _parse_dt(raw) -> datetime:
    """Parse various datetime formats → aware UTC datetime."""
    if isinstance(raw, datetime):
        return raw.replace(tzinfo=timezone.utc) if raw.tzinfo is None else raw
    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(raw, tz=timezone.utc)
    if isinstance(raw, str):
        for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S+00:00",
                    "%Y-%m-%dT%H:%M:%S%z", "%a, %d %b %Y %H:%M:%S %z",
                    "%a, %d %b %Y %H:%M:%S GMT"):
            try:
                dt = datetime.strptime(raw, fmt)
                return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
            except ValueError:
                continue
    return datetime.now(timezone.utc)


def _article_id(url: str, title: str) -> str:
    return hashlib.sha256(f"{url}{title}".encode()).hexdigest()[:16]


class WebNewsSearcher:
    """Fetches company-specific news from multiple internet sources."""

    def __init__(self):
        self._sentiment = SentimentAnalyzer()

    # ─────────────────────────────────────────────────────────────────────────
    # Source 1: yfinance ticker.news
    # ─────────────────────────────────────────────────────────────────────────

    def _fetch_yfinance(self, symbol: str, is_us: bool = False) -> list[dict]:
        try:
            import yfinance as yf
            if is_us:
                ticker = symbol
            else:
                ticker = f"{symbol}.NS" if not symbol.endswith((".NS", ".BO")) else symbol
            t = yf.Ticker(ticker)
            news_raw = t.news or []
            articles = []
            for item in news_raw[:20]:
                # Handle both old and new yfinance news schema
                content = item.get("content", item)
                title   = content.get("title", "")
                summary = content.get("summary") or content.get("description", "")
                pub_raw = (content.get("pubDate") or content.get("providerPublishTime")
                           or item.get("providerPublishTime"))
                url_obj = content.get("canonicalUrl") or content.get("clickThroughUrl") or {}
                url     = (url_obj.get("url") if isinstance(url_obj, dict) else url_obj) or ""
                if not url:
                    url = content.get("link", "")
                provider = content.get("provider", {})
                source   = (provider.get("displayName") if isinstance(provider, dict)
                            else str(provider)) or "Yahoo Finance"
                thumb_obj = content.get("thumbnail", {})
                thumbnail = None
                if isinstance(thumb_obj, dict):
                    thumbnail = thumb_obj.get("originalUrl") or (
                        thumb_obj.get("resolutions", [{}])[0].get("url") if thumb_obj.get("resolutions") else None
                    )
                if title and url:
                    articles.append({
                        "id":         _article_id(url, title),
                        "title":      title[:500],
                        "summary":    summary[:2000] if summary else "",
                        "url":        url,
                        "source":     source,
                        "source_type": "yfinance",
                        "thumbnail":  thumbnail,
                        "published_at": _parse_dt(pub_raw).isoformat(),
                    })
            return articles
        except Exception as exc:
            logger.warning(f"yfinance news error for {symbol}: {exc}")
            return []

    # ─────────────────────────────────────────────────────────────────────────
    # Source 2: Google News RSS (company-specific query)
    # ─────────────────────────────────────────────────────────────────────────

    def _fetch_google_news(self, company_name: str, symbol: str,
                           is_us: bool = False) -> list[dict]:
        if is_us:
            queries = [
                f"{company_name} stock NASDAQ",
                f"{company_name} stock price earnings",
            ]
            locale_params = "hl=en-US&gl=US&ceid=US:en"
        else:
            queries = [
                f"{company_name} NSE stock",
                f"{company_name} share price earnings",
            ]
            locale_params = "hl=en-IN&gl=IN&ceid=IN:en"
        articles = []
        seen_urls: set[str] = set()
        for q in queries:
            try:
                url  = f"https://news.google.com/rss/search?q={quote_plus(q)}&{locale_params}"
                feed = feedparser.parse(url)
                for entry in feed.entries[:15]:
                    title = getattr(entry, "title", "")
                    link  = getattr(entry, "link",  "")
                    if not title or not link or link in seen_urls:
                        continue
                    seen_urls.add(link)
                    summary = getattr(entry, "summary", "")
                    articles.append({
                        "id":         _article_id(link, title),
                        "title":      title[:500],
                        "summary":    summary[:2000] if summary else "",
                        "url":        link,
                        "source":     "Google News",
                        "source_type": "google_rss",
                        "thumbnail":  None,
                        "published_at": _parse_dt(getattr(entry, "published", None)).isoformat(),
                    })
            except Exception as exc:
                logger.warning(f"Google News RSS error ({q}): {exc}")
        return articles

    # ─────────────────────────────────────────────────────────────────────────
    # Source 3: DuckDuckGo news
    # ─────────────────────────────────────────────────────────────────────────

    def _fetch_ddg(self, company_name: str, symbol: str,
                   is_us: bool = False) -> list[dict]:
        if is_us:
            queries = [
                f"{company_name} stock price NASDAQ",
                f"{company_name} stock earnings results analyst",
            ]
        else:
            queries = [
                f"{company_name} NSE share price India",
                f"{company_name} stock earnings results analyst",
            ]
        articles = []
        seen: set[str] = set()
        try:
            from duckduckgo_search import DDGS
            with DDGS() as ddg:
                for q in queries:
                    try:
                        for r in ddg.news(q, max_results=10):
                            url   = r.get("url", "")
                            title = r.get("title", "")
                            if not url or not title or url in seen:
                                continue
                            seen.add(url)
                            articles.append({
                                "id":         _article_id(url, title),
                                "title":      title[:500],
                                "summary":    r.get("body", "")[:2000],
                                "url":        url,
                                "source":     r.get("source", "Web"),
                                "source_type": "ddg",
                                "thumbnail":  r.get("image"),
                                "published_at": _parse_dt(r.get("date")).isoformat(),
                            })
                    except Exception as exc:
                        logger.warning(f"DDG query '{q}' error: {exc}")
        except ImportError:
            logger.warning("duckduckgo_search not installed; skipping DDG source")
        return articles

    # ─────────────────────────────────────────────────────────────────────────
    # Source 4: Moneycontrol / ET company-specific RSS (scraped)
    # ─────────────────────────────────────────────────────────────────────────

    def _fetch_bing_rss(self, company_name: str, is_us: bool = False) -> list[dict]:
        """Bing News RSS — no API key needed."""
        try:
            if is_us:
                q = quote_plus(f"{company_name} stock NASDAQ")
            else:
                q = quote_plus(f"{company_name} NSE stock India")
            url  = f"https://www.bing.com/news/search?q={q}&format=RSS"
            resp = requests.get(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; StockSense/1.0)"
            }, timeout=8)
            resp.raise_for_status()
            feed = feedparser.parse(resp.text)
            articles = []
            for entry in feed.entries[:12]:
                title = getattr(entry, "title", "")
                link  = getattr(entry, "link", "")
                if not title or not link:
                    continue
                articles.append({
                    "id":         _article_id(link, title),
                    "title":      title[:500],
                    "summary":    getattr(entry, "summary", "")[:2000],
                    "url":        link,
                    "source":     "Bing News",
                    "source_type": "bing_rss",
                    "thumbnail":  None,
                    "published_at": _parse_dt(getattr(entry, "published", None)).isoformat(),
                })
            return articles
        except Exception as exc:
            logger.warning(f"Bing RSS error: {exc}")
            return []

    # ─────────────────────────────────────────────────────────────────────────
    # Main: aggregate, deduplicate, score, return
    # ─────────────────────────────────────────────────────────────────────────

    def search(self, symbol: str, limit: int = 25) -> list[dict]:
        """
        Fetch company-specific news from all internet sources.
        Returns list of articles sorted by relevance × recency.
        """
        is_us    = _is_us_symbol(symbol)
        sym      = _clean_symbol(symbol)
        company  = _company_name(sym)

        all_articles: list[dict] = []
        all_articles.extend(self._fetch_yfinance(sym, is_us=is_us))
        all_articles.extend(self._fetch_google_news(company, sym, is_us=is_us))
        all_articles.extend(self._fetch_ddg(company, sym, is_us=is_us))
        all_articles.extend(self._fetch_bing_rss(company, is_us=is_us))

        # Deduplicate by URL (keep first occurrence = highest-quality source)
        seen_urls: set[str] = set()
        unique: list[dict] = []
        for a in all_articles:
            url_key = re.sub(r"[?#].*", "", a["url"])  # strip query params for dedup
            if url_key not in seen_urls:
                seen_urls.add(url_key)
                unique.append(a)

        # Score and enrich
        now = datetime.now(timezone.utc)
        enriched = []
        for a in unique:
            rel = _relevance_score(a["title"], a["summary"] or "", sym, company)
            if rel < 0.15:       # filter clearly off-topic articles
                continue

            # Recency factor: decay over 7 days
            try:
                pub_dt = datetime.fromisoformat(a["published_at"])
                if pub_dt.tzinfo is None:
                    pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                age_days = max(0, (now - pub_dt).total_seconds() / 86400)
            except Exception:
                age_days = 7
            recency = max(0.1, 1.0 - age_days / 14)  # 100% fresh → 10% after 2 weeks

            # Sentiment
            text    = f"{a['title']}. {a['summary'] or ''}"
            scores  = self._sentiment.analyze(text)

            enriched.append({
                **a,
                **scores,
                "relevance_score": round(rel, 3),
                "recency_score":   round(recency, 3),
                "combined_score":  round(rel * 0.65 + recency * 0.35, 3),
                "symbol":          sym,
            })

        # Sort by combined score
        enriched.sort(key=lambda x: x["combined_score"], reverse=True)
        return enriched[:limit]
