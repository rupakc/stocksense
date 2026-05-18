from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class NewsArticleOut(BaseModel):
    id: int
    title: str
    summary: str | None
    url: str
    source: str
    published_at: datetime
    sentiment_compound: float | None
    sentiment_positive: float | None
    sentiment_negative: float | None
    related_symbols: list[str]

    model_config = {"from_attributes": True}


class WebNewsArticle(BaseModel):
    """Article returned from internet search — not stored in DB."""
    id: str
    title: str
    summary: Optional[str] = None
    url: str
    source: str
    source_type: str          # yfinance | google_rss | ddg | bing_rss
    thumbnail: Optional[str] = None
    published_at: str         # ISO string
    sentiment_compound: Optional[float] = None
    sentiment_positive: Optional[float] = None
    sentiment_negative: Optional[float] = None
    relevance_score: float
    recency_score: float
    combined_score: float
    symbol: str


class SentimentSummary(BaseModel):
    symbol: str
    avg_sentiment_7d: float
    avg_sentiment_30d: float
    article_count_7d: int
    article_count_30d: int
    sentiment_label: str  # "bullish" | "bearish" | "neutral"
    top_headlines: list[str]
