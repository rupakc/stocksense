import asyncio
import logging
import math

import numpy as np
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import User, WatchedSymbol
from app.schemas.portfolio import StockAdvisory
from app.services.portfolio.advisor import advise_watchlist

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=list[StockAdvisory])
async def get_portfolio_advice(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await advise_watchlist(db, user_id=current_user.id)


@router.get("/risk")
async def get_risk_analysis(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Portfolio risk analysis: correlations, VaR, beta, sector concentration."""
    import yfinance as yf
    import pandas as pd

    result = await db.execute(
        select(WatchedSymbol).where(
            WatchedSymbol.is_active.is_(True),
            WatchedSymbol.user_id == current_user.id,
        )
    )
    watchlist = result.scalars().all()
    if not watchlist:
        return {"symbols": [], "correlation_matrix": {}, "risk_metrics": {}, "sector_weights": {}}

    symbols = [w.symbol for w in watchlist]
    sectors = {w.symbol: w.sector or "Unknown" for w in watchlist}

    loop = asyncio.get_event_loop()

    def _fetch_returns(sym):
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period="6mo", auto_adjust=True)
            if hist.empty:
                return sym, None
            return sym, hist["Close"].pct_change().dropna()
        except Exception:
            return sym, None

    results = await asyncio.gather(
        *(loop.run_in_executor(None, _fetch_returns, s) for s in symbols)
    )

    returns_dict = {}
    for sym, ret in results:
        if ret is not None and len(ret) > 10:
            returns_dict[sym] = ret

    if not returns_dict:
        return {
            "symbols": symbols,
            "correlation_matrix": {},
            "risk_metrics": {},
            "sector_weights": {},
        }

    df = pd.DataFrame(returns_dict)
    corr_df = df.corr().round(3)
    corr = {
        k: {k2: (None if pd.isna(v2) else v2) for k2, v2 in v.items()}
        for k, v in corr_df.to_dict().items()
    }

    benchmark_rets = {}
    for bench_ticker, bench_name in [("^NSEI", "nifty"), ("^GSPC", "sp500")]:
        try:
            bench = yf.Ticker(bench_ticker)
            bench_hist = bench.history(period="6mo", auto_adjust=True)
            if not bench_hist.empty:
                benchmark_rets[bench_name] = bench_hist["Close"].pct_change().dropna()
        except Exception:
            pass

    def _pick_benchmark(sym):
        if sym.endswith(".NS") or sym.endswith(".BO"):
            return benchmark_rets.get("nifty")
        return benchmark_rets.get("sp500")

    risk_metrics = {}
    for sym in df.columns:
        ret = df[sym].dropna()
        if len(ret) < 10:
            continue
        daily_vol = float(ret.std())
        ann_vol = daily_vol * np.sqrt(252)
        var_95 = float(np.percentile(ret, 5))
        var_99 = float(np.percentile(ret, 1))
        mean_ret = float(ret.mean())
        _RISK_FREE_ANNUAL = 0.07  # ~7% Indian T-bill rate
        sharpe = ((mean_ret * 252) - _RISK_FREE_ANNUAL) / ann_vol if ann_vol > 0 else 0

        beta = None
        bench_ret = _pick_benchmark(sym)
        if bench_ret is not None:
            aligned = pd.DataFrame({"stock": ret, "nifty": bench_ret}).dropna()
            if len(aligned) > 10:
                cov = aligned["stock"].cov(aligned["nifty"])
                var_m = aligned["nifty"].var()
                beta = round(cov / var_m, 3) if var_m > 0 else None

        def _safe_round(v, decimals=3):
            f = float(v)
            if math.isnan(f) or math.isinf(f):
                return None
            return round(f, decimals)

        risk_metrics[sym] = {
            "daily_volatility": _safe_round(daily_vol * 100),
            "annualized_volatility": _safe_round(ann_vol * 100, 2),
            "var_95": _safe_round(var_95 * 100),
            "var_99": _safe_round(var_99 * 100),
            "sharpe_ratio": _safe_round(sharpe),
            "beta": beta,
            "max_daily_loss": _safe_round(float(ret.min()) * 100),
            "max_daily_gain": _safe_round(float(ret.max()) * 100),
        }

    sector_counts = {}
    for sym in symbols:
        s = sectors.get(sym, "Unknown")
        sector_counts[s] = sector_counts.get(s, 0) + 1
    total = sum(sector_counts.values())
    sector_weights = {s: round(c / total * 100, 1) for s, c in sector_counts.items()}

    return {
        "symbols": list(df.columns),
        "correlation_matrix": corr,
        "risk_metrics": risk_metrics,
        "sector_weights": sector_weights,
    }
