import logging
import math

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.database import get_db
from app.db.models import User
import yfinance as yf

from app.schemas.stock import AddSymbolRequest, StockPriceOut, StockQuote, WatchedSymbolOut
from app.services.market_data.nse_fetcher import NSEFetcher

router = APIRouter()
fetcher = NSEFetcher()


@router.get("/watchlist", response_model=list[WatchedSymbolOut])
async def get_watchlist(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all tracked symbols for the current user."""
    from sqlalchemy import select
    from app.db.models import WatchedSymbol
    result = await db.execute(
        select(WatchedSymbol).where(
            WatchedSymbol.is_active == True,  # noqa: E712
            WatchedSymbol.user_id == current_user.id,
        )
    )
    return result.scalars().all()


@router.post("/watchlist", response_model=WatchedSymbolOut, status_code=201)
async def add_to_watchlist(
    req: AddSymbolRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a symbol to the watchlist and trigger initial data fetch."""
    from sqlalchemy import select
    from app.db.models import WatchedSymbol

    from app.core.exchanges import get_suffix
    suffix = get_suffix(req.exchange)
    full_symbol = f"{req.symbol.upper()}{suffix}"

    existing = await db.execute(
        select(WatchedSymbol).where(WatchedSymbol.symbol == full_symbol)
    )
    row = existing.scalar_one_or_none()
    if row:
        if not row.is_active:
            row.is_active = True
            await db.commit()
            await db.refresh(row)
            return row
        raise HTTPException(status_code=409, detail=f"{full_symbol} is already in your watchlist")

    info = fetcher.get_stock_info(full_symbol)
    if not info:
        raise HTTPException(status_code=404, detail=f"Symbol {full_symbol} not found on Yahoo Finance")

    watched = WatchedSymbol(
        symbol=full_symbol,
        name=info.get("longName"),
        sector=info.get("sector"),
        exchange=req.exchange,
        user_id=current_user.id,
    )
    db.add(watched)
    await db.commit()
    await db.refresh(watched)

    await fetcher.fetch_and_store(full_symbol, period="2y", db=db, force=True)

    from app.api.routes.predictions import _train_symbol
    background_tasks.add_task(_train_symbol, full_symbol, 30)

    return watched


@router.delete("/watchlist/{symbol}", status_code=204)
async def remove_from_watchlist(
    symbol: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.db.models import WatchedSymbol
    result = await db.execute(
        select(WatchedSymbol).where(
            WatchedSymbol.symbol == symbol,
            WatchedSymbol.user_id == current_user.id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Symbol not found in your watchlist")
    row.is_active = False
    await db.commit()


@router.get("/quote/{symbol}", response_model=StockQuote)
async def get_quote(symbol: str):
    """Get real-time (15-min delayed) quote for a symbol."""
    import asyncio
    quote = await asyncio.to_thread(fetcher.get_live_quote, symbol)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Could not fetch quote for {symbol}")
    return quote


@router.get("/quotes")
async def get_quotes(symbols: str = Query(..., description="Comma-separated symbols")):
    """Batch-fetch quotes for multiple symbols in parallel."""
    import asyncio

    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        return {}

    if len(sym_list) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 symbols per request")

    sem = asyncio.Semaphore(10)
    loop = asyncio.get_event_loop()

    async def _limited_quote(sym: str):
        async with sem:
            return await loop.run_in_executor(None, fetcher.get_live_quote, sym)

    results = await asyncio.gather(*(_limited_quote(sym) for sym in sym_list))
    return {sym: quote for sym, quote in zip(sym_list, results) if quote}


@router.get("/history/{symbol}", response_model=list[StockPriceOut])
async def get_history(
    symbol: str,
    period: str = Query(default="1y", pattern="^(1mo|3mo|6mo|1y|2y|5y)$"),
    db: AsyncSession = Depends(get_db),
):
    """Fetch and return historical OHLCV data."""
    await fetcher.fetch_and_store(symbol, period=period, db=db)
    from sqlalchemy import select
    from app.db.models import StockPrice
    result = await db.execute(
        select(StockPrice)
        .where(StockPrice.symbol == symbol)
        .order_by(StockPrice.timestamp_utc)
    )
    return result.scalars().all()


@router.get("/symbols")
async def search_symbols(
    q: str = Query(default="", min_length=1, max_length=20),
    exchange: str = Query(default="NSE", description="NSE, BSE, or NASDAQ"),
):
    """Search equity symbols by ticker or company name."""
    from app.services.market_data.symbol_search import search_symbols
    return search_symbols(q, exchange=exchange.upper())


@router.get("/indices")
async def get_indices(exchange: str = Query(default="ALL", description="ALL, NSE, BSE, or NASDAQ")):
    """Return current values for indices, optionally filtered by exchange."""
    import asyncio
    from app.core.exchanges import get_indices_for_exchange

    all_indices = get_indices_for_exchange(exchange.upper())
    items = list(all_indices.items())
    sem = asyncio.Semaphore(10)

    async def _limited_quote(ticker: str):
        async with sem:
            return await asyncio.to_thread(fetcher.get_live_quote, ticker)

    results = await asyncio.gather(*(_limited_quote(ticker) for _, ticker in items))
    return {name: quote for (name, _), quote in zip(items, results) if quote}


@router.get("/earnings")
async def get_earnings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return upcoming earnings dates for watchlist symbols."""
    import asyncio
    from sqlalchemy import select
    from app.db.models import WatchedSymbol

    result = await db.execute(
        select(WatchedSymbol.symbol).where(
            WatchedSymbol.is_active == True,
            WatchedSymbol.user_id == current_user.id,
        )
    )
    symbols = [row[0] for row in result.all()]
    if not symbols:
        return []

    sem = asyncio.Semaphore(10)
    loop = asyncio.get_event_loop()

    async def _limited_earnings(s: str):
        async with sem:
            return await loop.run_in_executor(None, _get_earnings_info, s)

    results = await asyncio.gather(*(_limited_earnings(s) for s in symbols))
    earnings = [e for e in results if e]
    earnings.sort(key=lambda x: x.get("next_earnings_date") or "9999")
    return earnings


@router.get("/dividends")
async def get_dividends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return dividend info for watchlist symbols."""
    import asyncio
    from sqlalchemy import select
    from app.db.models import WatchedSymbol

    result = await db.execute(
        select(WatchedSymbol.symbol).where(
            WatchedSymbol.is_active == True,
            WatchedSymbol.user_id == current_user.id,
        )
    )
    symbols = [row[0] for row in result.all()]
    if not symbols:
        return []

    loop = asyncio.get_event_loop()
    _sem = asyncio.Semaphore(10)

    async def fetch_limited(s):
        async with _sem:
            return await loop.run_in_executor(None, _get_dividend_info, s)

    results = await asyncio.gather(*(fetch_limited(s) for s in symbols))
    dividends = [d for d in results if d]
    dividends.sort(key=lambda x: x.get("ex_date") or "9999")
    return dividends


def _get_dividend_info(symbol: str) -> dict | None:
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        divs = ticker.dividends
        result = {
            "symbol": symbol,
            "name": info.get("longName", symbol),
            "dividend_yield": info.get("dividendYield"),
            "dividend_rate": info.get("dividendRate"),
            "ex_date": info.get("exDividendDate"),
            "payout_ratio": info.get("payoutRatio"),
        }
        if divs is not None and len(divs) > 0:
            recent = divs.tail(5)
            result["recent_dividends"] = [
                {"date": idx.strftime("%Y-%m-%d"), "amount": round(float(val), 2)}
                for idx, val in recent.items()
            ]
        else:
            result["recent_dividends"] = []

        # Convert ex_date timestamp
        if result["ex_date"]:
            try:
                from datetime import datetime
                result["ex_date"] = datetime.fromtimestamp(result["ex_date"]).strftime("%Y-%m-%d")
            except Exception:
                result["ex_date"] = str(result["ex_date"])

        return result
    except Exception as e:
        logging.getLogger(__name__).warning(f"Dividend fetch failed for {symbol}: {e}")
        return None


@router.get("/options/{symbol}")
async def get_options_chain(symbol: str):
    """Return options chain data for a symbol."""
    import asyncio
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _fetch_options, symbol)
    if not result:
        raise HTTPException(status_code=404, detail=f"No options data for {symbol}")
    return result


def _safe_float(val):
    """Safely convert a value to float, returning None for NaN or invalid values."""
    try:
        f = float(val)
        return None if (f != f or math.isinf(f)) else round(f, 4)  # NaN/inf check
    except (ValueError, TypeError):
        return None


def _norm_cdf(x):
    """Approximate standard normal CDF using math.erf."""
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _norm_pdf(x):
    """Standard normal PDF."""
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)


def _black_scholes_greeks(S, K, T, r, sigma, option_type='call'):
    """Calculate option Greeks using Black-Scholes model (no scipy dependency)."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return {}
    d1 = (math.log(S / K) + (r + sigma**2 / 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)

    if option_type == 'call':
        delta = round(_norm_cdf(d1), 4)
        theta = round(
            (-S * _norm_pdf(d1) * sigma / (2 * math.sqrt(T))
             - r * K * math.exp(-r * T) * _norm_cdf(d2)) / 365, 4
        )
    else:
        delta = round(_norm_cdf(d1) - 1, 4)
        theta = round(
            (-S * _norm_pdf(d1) * sigma / (2 * math.sqrt(T))
             + r * K * math.exp(-r * T) * _norm_cdf(-d2)) / 365, 4
        )

    gamma = round(_norm_pdf(d1) / (S * sigma * math.sqrt(T)), 6)
    vega = round(S * _norm_pdf(d1) * math.sqrt(T) / 100, 4)

    return {"delta": delta, "gamma": gamma, "theta": theta, "vega": vega}


def _fetch_options(symbol: str) -> dict | None:
    import logging
    from datetime import datetime
    try:
        ticker = yf.Ticker(symbol)
        expirations = ticker.options
        if not expirations:
            return None

        # Get current stock price for Greeks calculation and ITM/OTM detection
        info = ticker.info
        current_price = info.get("currentPrice") or info.get("regularMarketPrice") or 0
        risk_free_rate = 0.07  # ~7% for India

        cols = ["strike", "lastPrice", "bid", "ask", "volume", "openInterest", "impliedVolatility"]
        all_chains = []

        for exp in expirations[:3]:
            opt = ticker.option_chain(exp)

            # Calculate days to expiry
            exp_date = datetime.strptime(exp, "%Y-%m-%d")
            days_to_expiry = max((exp_date - datetime.now()).days, 1)
            T = days_to_expiry / 365.0

            def _enrich_row(row, option_type):
                entry = {c: row.get(c) for c in cols}
                strike = row.get("strike", 0)
                iv = row.get("impliedVolatility", 0)
                # Add Greeks
                if current_price > 0 and strike > 0 and iv > 0:
                    greeks = _black_scholes_greeks(current_price, strike, T, risk_free_rate, iv, option_type)
                    entry.update(greeks)
                else:
                    entry.update({"delta": None, "gamma": None, "theta": None, "vega": None})
                # ITM flag
                if option_type == 'call':
                    entry["itm"] = current_price > strike if current_price > 0 else None
                else:
                    entry["itm"] = current_price < strike if current_price > 0 else None
                return entry

            calls = [_enrich_row(row, 'call') for _, row in opt.calls[cols].head(20).iterrows()]
            puts = [_enrich_row(row, 'put') for _, row in opt.puts[cols].head(20).iterrows()]

            total_call_oi = int(opt.calls["openInterest"].sum())
            total_put_oi = int(opt.puts["openInterest"].sum())
            pcr = round(total_put_oi / total_call_oi, 3) if total_call_oi > 0 else None

            all_chains.append({
                "expiration": exp,
                "calls": calls,
                "puts": puts,
                "total_call_oi": total_call_oi,
                "total_put_oi": total_put_oi,
                "put_call_ratio": pcr,
            })

        first = all_chains[0] if all_chains else {}
        return {
            "symbol": symbol,
            "current_price": current_price,
            "expiration": first.get("expiration"),
            "expirations": list(expirations[:5]),
            "calls": first.get("calls", []),
            "puts": first.get("puts", []),
            "total_call_oi": first.get("total_call_oi", 0),
            "total_put_oi": first.get("total_put_oi", 0),
            "put_call_ratio": first.get("put_call_ratio"),
            "chains": all_chains,
        }
    except Exception as e:
        logging.getLogger(__name__).warning(f"Options fetch failed for {symbol}: {e}")
        return None


@router.get("/momentum")
async def get_momentum_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return RSI and momentum data for all watchlist symbols."""
    import asyncio
    from sqlalchemy import select
    from app.db.models import WatchedSymbol

    result = await db.execute(
        select(WatchedSymbol.symbol, WatchedSymbol.name).where(
            WatchedSymbol.is_active == True,
            WatchedSymbol.user_id == current_user.id,
        )
    )
    symbols = result.all()
    if not symbols:
        return []

    loop = asyncio.get_event_loop()
    _sem = asyncio.Semaphore(10)

    async def fetch_limited(sym, name):
        async with _sem:
            return await loop.run_in_executor(None, _get_momentum, sym, name)

    results = await asyncio.gather(*(fetch_limited(s[0], s[1]) for s in symbols))
    return [r for r in results if r]


def _calc_rsi(prices, period=14):
    """Calculate RSI from a list of closing prices."""
    if len(prices) < period + 1:
        return None
    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def _get_momentum(symbol: str, name: str | None) -> dict | None:
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="3mo")
        if hist is None or len(hist) < 20:
            return None

        import math

        closes = [c for c in hist["Close"].tolist() if c is not None and not math.isnan(c) and not math.isinf(c)]
        if len(closes) < 20:
            return None
        current = closes[-1]

        rsi_14 = _calc_rsi(closes, 14)

        def _pct(a, b):
            if b is None or b == 0:
                return 0
            v = (a / b - 1) * 100
            return 0 if math.isnan(v) or math.isinf(v) else round(v, 2)

        pct_1d = _pct(closes[-1], closes[-2]) if len(closes) >= 2 else 0
        pct_1w = _pct(closes[-1], closes[-6]) if len(closes) >= 6 else 0
        pct_1m = _pct(closes[-1], closes[-22]) if len(closes) >= 22 else 0
        pct_3m = _pct(closes[-1], closes[0])

        sma_20 = sum(closes[-20:]) / 20 if len(closes) >= 20 else None
        sma_50 = sum(closes[-50:]) / 50 if len(closes) >= 50 else None

        above_sma20 = current > sma_20 if sma_20 else None
        above_sma50 = current > sma_50 if sma_50 else None

        # Momentum score (composite)
        score = 0
        if rsi_14:
            if 40 <= rsi_14 <= 60:
                score += 0
            elif rsi_14 > 60:
                score += min((rsi_14 - 60) / 20, 1)
            else:
                score -= min((40 - rsi_14) / 20, 1)
        if pct_1m > 0:
            score += 0.3
        if pct_1m < 0:
            score -= 0.3
        if above_sma20:
            score += 0.2
        if above_sma50:
            score += 0.2

        # Classify
        if score > 0.5:
            trend = "Strong Bullish"
        elif score > 0.1:
            trend = "Bullish"
        elif score > -0.1:
            trend = "Neutral"
        elif score > -0.5:
            trend = "Bearish"
        else:
            trend = "Strong Bearish"

        return {
            "symbol": symbol,
            "name": name or symbol.replace(".NS", ""),
            "price": round(current, 2),
            "rsi_14": rsi_14,
            "change_1d": pct_1d,
            "change_1w": pct_1w,
            "change_1m": pct_1m,
            "change_3m": pct_3m,
            "above_sma20": above_sma20,
            "above_sma50": above_sma50,
            "momentum_score": round(score, 2),
            "trend": trend,
        }
    except Exception as e:
        logging.getLogger(__name__).warning(f"Momentum fetch failed for {symbol}: {e}")
        return None


def _get_earnings_info(symbol: str) -> dict | None:
    import logging
    try:
        ticker = yf.Ticker(symbol)
        cal = ticker.calendar
        info = ticker.info
        result = {
            "symbol": symbol,
            "name": info.get("longName", symbol),
            "sector": info.get("sector"),
        }
        if isinstance(cal, dict):
            if cal.get("Earnings Date"):
                dates = cal["Earnings Date"]
                if dates:
                    result["next_earnings_date"] = str(dates[0])
                    if len(dates) > 1:
                        result["earnings_date_end"] = str(dates[1])
            if cal.get("Revenue Average") is not None:
                result["revenue_estimate"] = cal["Revenue Average"]
            elif cal.get("Revenue Estimate") is not None:
                result["revenue_estimate"] = cal["Revenue Estimate"]
            if cal.get("Earnings Average") is not None:
                result["earnings_estimate"] = cal["Earnings Average"]
            elif cal.get("Earnings Estimate") is not None:
                result["earnings_estimate"] = cal["Earnings Estimate"]
        elif hasattr(cal, "columns"):
            if "Earnings Date" in cal.columns:
                vals = cal["Earnings Date"].tolist()
                if vals:
                    result["next_earnings_date"] = str(vals[0])
        result.setdefault("next_earnings_date", None)

        # Fetch earnings history (surprise data)
        try:
            earnings_hist = ticker.earnings_dates
            if earnings_hist is not None and hasattr(earnings_hist, 'iterrows'):
                history = []
                for idx, row in earnings_hist.head(8).iterrows():
                    entry = {
                        "date": idx.strftime("%Y-%m-%d") if hasattr(idx, 'strftime') else str(idx)[:10],
                        "eps_estimate": _safe_float(row.get("EPS Estimate")),
                        "eps_actual": _safe_float(row.get("Reported EPS")),
                        "surprise_pct": _safe_float(row.get("Surprise(%)")),
                    }
                    history.append(entry)
                result["earnings_history"] = history

                # Calculate beat rate
                beats = sum(1 for h in history if h.get("surprise_pct") and h["surprise_pct"] > 0)
                total = sum(1 for h in history if h.get("surprise_pct") is not None)
                result["beat_rate"] = round(beats / total * 100) if total > 0 else None
        except Exception:
            pass

        result.setdefault("earnings_history", [])
        result.setdefault("beat_rate", None)

        return result
    except Exception as e:
        logging.getLogger(__name__).warning(f"Earnings fetch failed for {symbol}: {e}")
        return None
