import asyncio
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
            import requests as _req
            _session = _req.Session()
            _session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"})
            ticker = yf.Ticker(symbol, session=_session)
            info = ticker.info
            return info if info.get("regularMarketPrice") else None
        except Exception as e:
            logger.warning(f"Failed to fetch info for {symbol}: {e}")
            return None

    def get_live_quote(self, symbol: str) -> dict | None:
        try:
            import requests as _req
            _session = _req.Session()
            _session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"})
            ticker = yf.Ticker(symbol, session=_session)
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
        import time
        import requests
        session = requests.Session()
        session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })
        session.verify = True
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                ticker = yf.Ticker(symbol, session=session)
                df = ticker.history(period=period, auto_adjust=True)
                if df.empty:
                    return pd.DataFrame()
                df.index = df.index.tz_convert("UTC")
                df.reset_index(inplace=True)
                df.rename(columns={
                    "Date": "timestamp_utc", "Open": "open", "High": "high",
                    "Low": "low", "Close": "close", "Volume": "volume",
                }, inplace=True)
                df["symbol"] = symbol
                df = df[["symbol", "timestamp_utc", "open", "high", "low", "close", "volume"]]
                return df.dropna(subset=["open", "high", "low", "close"])
            except Exception as exc:
                last_exc = exc
                if attempt < 2:
                    time.sleep(2 ** attempt)
        logger.error(f"Error fetching history for {symbol} after 3 attempts: {last_exc}")
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

        try:
            df = await asyncio.wait_for(
                asyncio.to_thread(self.fetch_history, symbol, period),
                timeout=45.0,
            )
        except asyncio.TimeoutError:
            logger.warning(f"Timeout fetching history for {symbol}; skipping store")
            return
        if df.empty:
            return

        from app.db.models import StockPrice
        from app.db.upsert import insert_ignore_batch

        records = df.to_dict(orient="records")
        await insert_ignore_batch(db, StockPrice, records, ["symbol", "timestamp_utc"])
        await db.commit()
        logger.info(f"Stored {len(records)} price records for {symbol}")
