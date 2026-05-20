import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.deps import get_current_user
from app.db.models import User
import yfinance as yf

router = APIRouter()
logger = logging.getLogger(__name__)

# Cache for screener results (symbol -> {info dict, timestamp})
_screener_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 3600  # 1 hour


def _safe_round(val, decimals=2):
    try:
        f = float(val)
        return None if f != f else round(f, decimals)
    except (ValueError, TypeError):
        return None


def _get_stock_metrics(symbol: str) -> dict | None:
    """Fetch key metrics for a single stock."""
    now = time.monotonic()
    cached = _screener_cache.get(symbol)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1]

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        if not info or not info.get("regularMarketPrice"):
            return None

        result = {
            "symbol": symbol,
            "name": info.get("longName") or info.get("shortName") or symbol,
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "market_cap": info.get("marketCap"),
            "price": info.get("regularMarketPrice"),
            "change_pct": round((info.get("regularMarketChangePercent") or 0), 2),
            "pe_ratio": _safe_round(info.get("trailingPE")),
            "forward_pe": _safe_round(info.get("forwardPE")),
            "pb_ratio": _safe_round(info.get("priceToBook")),
            "dividend_yield": _safe_round(info.get("dividendYield"), 4),
            "roe": _safe_round(info.get("returnOnEquity"), 4),
            "debt_to_equity": _safe_round(info.get("debtToEquity")),
            "revenue_growth": _safe_round(info.get("revenueGrowth"), 4),
            "profit_margin": _safe_round(info.get("profitMargins"), 4),
            "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
            "avg_volume": info.get("averageVolume"),
            "beta": _safe_round(info.get("beta")),
            "eps": _safe_round(info.get("trailingEps")),
        }

        # Calculate distance from 52-week high/low
        if result["price"] and result["fifty_two_week_high"]:
            result["pct_from_52w_high"] = round(
                (result["price"] - result["fifty_two_week_high"])
                / result["fifty_two_week_high"]
                * 100,
                2,
            )
        if result["price"] and result["fifty_two_week_low"]:
            result["pct_from_52w_low"] = round(
                (result["price"] - result["fifty_two_week_low"])
                / result["fifty_two_week_low"]
                * 100,
                2,
            )

        _screener_cache[symbol] = (now, result)
        return result
    except Exception as e:
        logger.warning(f"Screener fetch failed for {symbol}: {e}")
        return None


# Top 100 NSE stocks by market cap (fallback list — must be defined before _build_scan_universe)
_TOP_NSE_SYMBOLS = [
    "RELIANCE",
    "TCS",
    "HDFCBANK",
    "INFY",
    "ICICIBANK",
    "HINDUNILVR",
    "ITC",
    "SBIN",
    "BHARTIARTL",
    "KOTAKBANK",
    "LT",
    "HCLTECH",
    "AXISBANK",
    "ASIANPAINT",
    "MARUTI",
    "SUNPHARMA",
    "TITAN",
    "BAJFINANCE",
    "DMART",
    "NESTLEIND",
    "ULTRACEMCO",
    "WIPRO",
    "ONGC",
    "NTPC",
    "POWERGRID",
    "M&M",
    "TATAMOTORS",
    "TATASTEEL",
    "JSWSTEEL",
    "ADANIENT",
    "ADANIPORTS",
    "TECHM",
    "HDFCLIFE",
    "SBILIFE",
    "BAJAJFINSV",
    "GRASIM",
    "DIVISLAB",
    "CIPLA",
    "DRREDDY",
    "EICHERMOT",
    "HEROMOTOCO",
    "BPCL",
    "COALINDIA",
    "IOC",
    "BRITANNIA",
    "APOLLOHOSP",
    "TATACONSUM",
    "HINDALCO",
    "INDUSINDBK",
    "UPL",
]

# Top NASDAQ stocks ordered by market cap — used as the screener universe.
# The full live symbol list (symbol_search.py) is used for search/add, where
# alphabetical order is fine since the user types a query to narrow it down.
_TOP_NASDAQ_SYMBOLS = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "META",
    "TSLA",
    "GOOGL",
    "GOOG",
    "AVGO",
    "COST",
    "NFLX",
    "AMD",
    "ADBE",
    "PEP",
    "CSCO",
    "INTC",
    "TMUS",
    "CMCSA",
    "INTU",
    "TXN",
    "QCOM",
    "AMGN",
    "ISRG",
    "AMAT",
    "BKNG",
    "LRCX",
    "VRTX",
    "PANW",
    "ADP",
    "REGN",
    "SBUX",
    "MU",
    "MDLZ",
    "KLAC",
    "SNPS",
    "CDNS",
    "MELI",
    "CRWD",
    "PYPL",
    "ORLY",
    "MAR",
    "ABNB",
    "FTNT",
    "CTAS",
    "DASH",
    "WDAY",
    "CEG",
    "MRVL",
    "TTD",
    "DXCM",
    "ODFL",
    "PCAR",
    "MNST",
    "IDXX",
    "FAST",
    "KDP",
    "EXC",
    "GEHC",
    "EA",
    "VRSK",
    "CTSH",
    "XEL",
    "ON",
    "DDOG",
    "ANSS",
    "ZS",
    "TEAM",
    "CDW",
    "BIIB",
    "ILMN",
    "SPLK",
    "SIRI",
    "JD",
    "PDD",
    "BIDU",
    "NTES",
    "MCHP",
    "LULU",
    "ROST",
    "PAYX",
    "KHC",
    "DLTR",
    "BKR",
    "FANG",
    "AEP",
    "WBA",
    "COIN",
    "RIVN",
    "PLTR",
    "SNOW",
    "NET",
    "ROKU",
    "ZM",
    "OKTA",
    "SHOP",
    "UBER",
    "SNAP",
    "SPOT",
]


def _build_scan_universe(exchange: str) -> list[str]:
    """Return the screener symbol universe for a given exchange.

    The NASDAQ universe uses a market-cap-ordered curated list so the screener
    surfaces large/mid-caps rather than obscure alphabetical small-caps.
    The full live NASDAQ list (symbol_search.py) is still used for search.

    NSE    → top 100 NSE equities with .NS suffix
    BSE    → top 100 NSE equities mapped to .BO suffix
    NASDAQ → top 100 NASDAQ large/mid-caps (no suffix)
    ALL    → 60 NSE + 40 NASDAQ for a balanced cross-market view
    """
    from app.services.market_data.nse_symbols import get_all_symbols

    nse_data = get_all_symbols()
    nse_syms = (
        [f"{d['symbol']}.NS" for d in nse_data]
        if nse_data
        else [f"{s}.NS" for s in _TOP_NSE_SYMBOLS]
    )

    if exchange == "NASDAQ":
        return list(_TOP_NASDAQ_SYMBOLS)
    if exchange == "BSE":
        return [s.replace(".NS", ".BO") for s in nse_syms[:100]]
    if exchange == "NSE":
        return nse_syms[:100]
    # ALL — balanced cross-market sample
    return nse_syms[:60] + list(_TOP_NASDAQ_SYMBOLS[:40])


@router.get("/scan")
async def screen_stocks(
    exchange: str = Query(default="ALL", description="Filter universe: ALL, NSE, BSE, or NASDAQ"),
    sector: str | None = Query(default=None),
    min_market_cap: float | None = Query(default=None),
    max_pe: float | None = Query(default=None),
    min_dividend_yield: float | None = Query(default=None),
    min_roe: float | None = Query(default=None),
    max_debt_to_equity: float | None = Query(default=None),
    near_52w_low_pct: float | None = Query(default=None, description="Within X% of 52-week low"),
    near_52w_high_pct: float | None = Query(default=None, description="Within X% of 52-week high"),
    sort_by: str = Query(default="market_cap"),
    limit: int = Query(default=30, le=100),
    current_user: User = Depends(get_current_user),
):
    """Screen stocks by fundamental criteria across NSE, BSE, and NASDAQ."""
    try:
        symbols_to_scan = _build_scan_universe(exchange.upper())
    except Exception as exc:
        logger.error(f"[screener] Failed to build universe for {exchange}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to build scan universe")

    # Fetch metrics in parallel with concurrency limit
    sem = asyncio.Semaphore(10)

    async def fetch_limited(sym):
        async with sem:
            try:
                return await asyncio.wait_for(
                    asyncio.to_thread(_get_stock_metrics, sym),
                    timeout=20.0,
                )
            except asyncio.TimeoutError:
                logger.warning(f"[screener] Timeout fetching metrics for {sym}")
                return None

    results = await asyncio.gather(*(fetch_limited(s) for s in symbols_to_scan))
    stocks = [r for r in results if r]

    # Apply filters
    if sector:
        stocks = [s for s in stocks if s.get("sector", "").lower() == sector.lower()]
    if min_market_cap:
        stocks = [s for s in stocks if (s.get("market_cap") or 0) >= min_market_cap]
    if max_pe:
        stocks = [s for s in stocks if s.get("pe_ratio") is not None and s["pe_ratio"] <= max_pe]
    if min_dividend_yield:
        stocks = [s for s in stocks if (s.get("dividend_yield") or 0) >= min_dividend_yield]
    if min_roe:
        stocks = [s for s in stocks if (s.get("roe") or 0) >= min_roe]
    if max_debt_to_equity:
        stocks = [
            s
            for s in stocks
            if s.get("debt_to_equity") is not None and s["debt_to_equity"] <= max_debt_to_equity
        ]
    if near_52w_low_pct:
        stocks = [
            s
            for s in stocks
            if s.get("pct_from_52w_low") is not None and s["pct_from_52w_low"] <= near_52w_low_pct
        ]
    if near_52w_high_pct:
        stocks = [
            s
            for s in stocks
            if s.get("pct_from_52w_high") is not None
            and abs(s["pct_from_52w_high"]) <= near_52w_high_pct
        ]

    # Sort
    reverse = sort_by not in ["pe_ratio", "debt_to_equity"]
    stocks.sort(key=lambda x: x.get(sort_by) or 0, reverse=reverse)

    return stocks[:limit]


@router.get("/sectors")
async def get_sectors(current_user: User = Depends(get_current_user)):
    """Return list of unique sectors from cached screener data."""
    sectors = set()
    for _, (_, data) in _screener_cache.items():
        if data.get("sector"):
            sectors.add(data["sector"])
    if not sectors:
        sectors = {
            "Technology",
            "Financial Services",
            "Healthcare",
            "Consumer Defensive",
            "Energy",
            "Basic Materials",
            "Industrials",
            "Communication Services",
            "Consumer Cyclical",
            "Utilities",
            "Real Estate",
        }
    return sorted(sectors)
