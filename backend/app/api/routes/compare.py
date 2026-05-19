import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.deps import get_current_user
from app.db.models import User
import yfinance as yf

router = APIRouter()
logger = logging.getLogger(__name__)

_compare_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 900  # 15 min


def _safe(val, decimals=2):
    try:
        f = float(val)
        if f != f or f == float('inf') or f == float('-inf'):
            return None
        return round(f, decimals)
    except (ValueError, TypeError):
        return None


def _resolve_yf_symbol(symbol: str) -> list[str]:
    """Return ordered list of yfinance symbols to try for a given input.

    Bare symbols (no dot, no leading ^) are assumed to be NSE first.
    NASDAQ symbols are tried as bare if .NS lookup fails.
    """
    if '.' in symbol or symbol.startswith('^'):
        return [symbol]
    # NSE first (most users on this platform are trading Indian equities),
    # then BSE, then bare (NASDAQ / US stocks)
    return [symbol + '.NS', symbol + '.BO', symbol]


def _get_comparison_data(symbol: str) -> dict | None:
    candidates = _resolve_yf_symbol(symbol)
    # Use the first candidate as the primary cache key
    cache_key = candidates[0]

    now = time.monotonic()
    cached = _compare_cache.get(cache_key)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1]

    info = None
    yf_symbol = None
    for candidate in candidates:
        try:
            t = yf.Ticker(candidate)
            i = t.info
            if i and i.get("regularMarketPrice"):
                info = i
                yf_symbol = candidate
                break
        except Exception:
            continue

    if info is None or yf_symbol is None:
        return None

    try:
        hist = yf.Ticker(yf_symbol).history(period="1y")
        price_history = []
        if hist is not None and len(hist) > 0:
            first_close = hist["Close"].iloc[0]
            for idx, row in hist.iterrows():
                close = _safe(row["Close"])
                if close is None:
                    continue
                pct = _safe((close - first_close) / first_close * 100) if first_close else 0
                price_history.append({
                    "date": idx.strftime("%Y-%m-%d"),
                    "price": close,
                    "pct_change": pct or 0,
                })

        result = {
            "symbol": symbol,
            "name": info.get("longName") or symbol,
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "price": _safe(info.get("regularMarketPrice")),
            "market_cap": _safe(info.get("marketCap"), 0),
            "pe_ratio": _safe(info.get("trailingPE")),
            "forward_pe": _safe(info.get("forwardPE")),
            "pb_ratio": _safe(info.get("priceToBook")),
            "ps_ratio": _safe(info.get("priceToSalesTrailing12Months")),
            "ev_ebitda": _safe(info.get("enterpriseToEbitda")),
            "dividend_yield": _safe(info.get("dividendYield"), 4),
            "roe": _safe(info.get("returnOnEquity"), 4),
            "roa": _safe(info.get("returnOnAssets"), 4),
            "profit_margin": _safe(info.get("profitMargins"), 4),
            "operating_margin": _safe(info.get("operatingMargins"), 4),
            "revenue_growth": _safe(info.get("revenueGrowth"), 4),
            "earnings_growth": _safe(info.get("earningsGrowth"), 4),
            "debt_to_equity": _safe(info.get("debtToEquity")),
            "current_ratio": _safe(info.get("currentRatio")),
            "beta": _safe(info.get("beta")),
            "fifty_two_week_high": _safe(info.get("fiftyTwoWeekHigh")),
            "fifty_two_week_low": _safe(info.get("fiftyTwoWeekLow")),
            "avg_volume": _safe(info.get("averageVolume"), 0),
            "eps": _safe(info.get("trailingEps")),
            "book_value": _safe(info.get("bookValue")),
            "price_history": price_history,
        }
        _compare_cache[cache_key] = (now, result)
        return result
    except Exception as e:
        logger.warning(f"Compare fetch failed for {symbol} (tried {candidates}): {e}")
        return None


@router.get("/")
async def compare_stocks(
    symbols: str = Query(..., description="Comma-separated symbols (2-5)"),
    current_user: User = Depends(get_current_user),
):
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if len(sym_list) < 2:
        raise HTTPException(status_code=400, detail="At least 2 symbols required")
    if len(sym_list) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 symbols")

    sem = asyncio.Semaphore(5)

    async def fetch(s):
        async with sem:
            try:
                return await asyncio.wait_for(
                    asyncio.to_thread(_get_comparison_data, s),
                    timeout=30.0,
                )
            except asyncio.TimeoutError:
                logger.warning(f"[compare] Timeout fetching data for {s}")
                return None

    results = await asyncio.gather(*(fetch(s) for s in sym_list))
    stocks = [r for r in results if r]

    if len(stocks) < 2:
        raise HTTPException(status_code=404, detail="Could not fetch data for enough symbols")

    # Calculate relative scores for each metric
    metrics = ["pe_ratio", "pb_ratio", "roe", "profit_margin", "debt_to_equity", "dividend_yield", "revenue_growth"]
    rankings = {}
    for metric in metrics:
        values = [(s["symbol"], s.get(metric)) for s in stocks if s.get(metric) is not None]
        if not values:
            continue
        # Lower is better for PE, PB, D/E; higher is better for ROE, margins, yield, growth
        lower_better = metric in ["pe_ratio", "pb_ratio", "debt_to_equity"]
        values.sort(key=lambda x: x[1], reverse=not lower_better)
        rankings[metric] = {sym: rank + 1 for rank, (sym, _) in enumerate(values)}

    return {
        "stocks": stocks,
        "rankings": rankings,
    }
