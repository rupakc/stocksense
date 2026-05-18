import logging
import math
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _clean(val, default=None):
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (ValueError, TypeError):
        return default


class NSEFetcher:
    """Fetches OHLCV data from Yahoo Finance for NSE/BSE stocks. No API key required."""

    def get_stock_info(self, symbol: str) -> dict | None:
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            return info if info.get("regularMarketPrice") else None
        except Exception as e:
            logger.warning(f"Failed to fetch info for {symbol}: {e}")
            return None

    def get_live_quote(self, symbol: str) -> dict | None:
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            price = info.get("regularMarketPrice") or info.get("currentPrice")
            if not price:
                return None
            prev = _clean(info.get("previousClose"), price)
            return {
                "symbol": symbol,
                "name": info.get("longName"),
                "current_price": price,
                "previous_close": prev,
                "change": round(price - prev, 2),
                "change_pct": _clean(info.get("regularMarketChangePercent"), 0),
                "day_high": _clean(info.get("dayHigh"), 0),
                "day_low": _clean(info.get("dayLow"), 0),
                "volume": int(_clean(info.get("regularMarketVolume"), 0)),
                "market_cap": _clean(info.get("marketCap")),
                "pe_ratio": _clean(info.get("trailingPE")),
                "week_52_high": _clean(info.get("fiftyTwoWeekHigh"), 0),
                "week_52_low": _clean(info.get("fiftyTwoWeekLow"), 0),
                "fetched_at": datetime.now(timezone.utc),
            }
        except Exception as e:
            logger.warning(f"Failed to fetch quote for {symbol}: {e}")
            return None

    def fetch_history(self, symbol: str, period: str = "1y") -> pd.DataFrame:
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period, auto_adjust=True)
            if df.empty:
                return pd.DataFrame()
            df.index = df.index.tz_convert("UTC")
            df.reset_index(inplace=True)
            df.rename(columns={"Date": "timestamp_utc", "Open": "open", "High": "high",
                                "Low": "low", "Close": "close", "Volume": "volume"}, inplace=True)
            df["symbol"] = symbol
            df = df[["symbol", "timestamp_utc", "open", "high", "low", "close", "volume"]]
            df = df.dropna(subset=["open", "high", "low", "close"])
            return df
        except Exception as e:
            logger.error(f"Error fetching history for {symbol}: {e}")
            return pd.DataFrame()

    async def fetch_and_store(
        self, symbol: str, period: str = "1y", db: AsyncSession = None, *, force: bool = False,
    ):
        if db is None:
            return

        if not force:
            from sqlalchemy import select, func
            from app.db.models import StockPrice
            from app.core.config import settings as cfg
            row = await db.execute(
                select(func.max(StockPrice.timestamp_utc)).where(StockPrice.symbol == symbol)
            )
            latest = row.scalar()
            if latest:
                age = (datetime.now(timezone.utc) - latest.replace(tzinfo=timezone.utc)).total_seconds()
                if age < cfg.history_freshness_ttl:
                    return

        df = self.fetch_history(symbol, period)
        if df.empty:
            return

        from app.db.models import StockPrice
        from app.db.upsert import insert_ignore_batch

        records = df.to_dict(orient="records")
        await insert_ignore_batch(db, StockPrice, records, ["symbol", "timestamp_utc"])
        await db.commit()
        logger.info(f"Stored {len(records)} price records for {symbol}")
