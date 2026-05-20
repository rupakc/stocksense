import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import User, WatchedSymbol
from app.schemas.strategy import (
    BacktestRequest,
    BacktestResult,
    StrategyInfo,
    StrategySignal,
    StrategySignalsResponse,
)
from app.services.strategy.engine import (
    STRATEGIES,
    backtest_strategy,
    generate_signal,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/", response_model=list[StrategyInfo])
async def list_strategies():
    """Return metadata for all available trading strategies."""
    return [StrategyInfo(**s) for s in STRATEGIES.values()]


@router.get("/{strategy_id}/signals", response_model=StrategySignalsResponse)
async def get_signals(
    strategy_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate real-time trading signals for all watchlist stocks."""
    import asyncio

    if strategy_id not in STRATEGIES:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_id}' not found")

    result = await db.execute(
        select(WatchedSymbol.symbol).where(
            WatchedSymbol.is_active == True,
            WatchedSymbol.user_id == current_user.id,
        )
    )
    symbols = [row[0] for row in result.all()]

    if not symbols:
        raise HTTPException(status_code=404, detail="Watchlist is empty. Add stocks first.")

    loop = asyncio.get_event_loop()

    def _safe_signal(sym):
        try:
            return generate_signal(sym, strategy_id)
        except Exception as exc:
            logger.warning(f"Signal generation failed for {sym}: {exc}")
            return {
                "symbol": sym, "signal": "HOLD", "strength": 0.0,
                "rationale": f"Signal generation error: {exc}",
            }

    results = await asyncio.gather(
        *(loop.run_in_executor(None, _safe_signal, sym) for sym in symbols)
    )
    signals = [StrategySignal(**raw) for raw in results]

    order = {"BUY": 0, "HOLD": 1, "SELL": 2}
    signals.sort(key=lambda s: (order.get(s.signal, 1), -s.strength))

    return StrategySignalsResponse(
        strategy=StrategyInfo(**STRATEGIES[strategy_id]),
        signals=signals,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/{strategy_id}/backtest/{symbol}", response_model=BacktestResult)
async def run_backtest_get(
    strategy_id: str,
    symbol: str,
    lookback_days: int = 365,
    start_date: str | None = None,
    end_date: str | None = None,
    include_costs: bool = True,
):
    """Run a backtest for a given strategy + symbol (GET, no custom params)."""
    if strategy_id not in STRATEGIES:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_id}' not found")

    result = backtest_strategy(
        symbol.upper(), strategy_id, lookback_days,
        start_date=start_date, end_date=end_date,
        include_costs=include_costs,
    )
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])

    return BacktestResult(**result)


@router.post("/{strategy_id}/backtest/{symbol}", response_model=BacktestResult)
async def run_backtest_post(
    strategy_id: str,
    symbol: str,
    body: BacktestRequest | None = None,
):
    """Run a backtest with custom strategy parameters (POST with body)."""
    if strategy_id not in STRATEGIES:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_id}' not found")

    req = body or BacktestRequest()
    result = backtest_strategy(
        symbol.upper(), strategy_id, req.lookback_days,
        start_date=req.start_date, end_date=req.end_date,
        params=req.params, include_costs=req.include_costs,
    )
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])

    return BacktestResult(**result)


@router.get("/compare/{symbol}")
async def compare_strategies(symbol: str, lookback_days: int = 365):
    """Run all strategies on a single symbol and return comparison data.

    All 8 backtests run in parallel via a thread-pool executor.
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    strategy_ids = list(STRATEGIES.keys())

    def _safe_backtest(sid):
        try:
            result = backtest_strategy(symbol.upper(), sid, lookback_days)
            if "error" in result:
                return None
            return {
                "strategy_id": sid,
                "strategy_name": STRATEGIES[sid]["name"],
                "total_return_pct": result["total_return_pct"],
                "buy_and_hold_return_pct": result["buy_and_hold_return_pct"],
                "sharpe_ratio": result["sharpe_ratio"],
                "max_drawdown_pct": result["max_drawdown_pct"],
                "win_rate": result["win_rate"],
                "total_trades": result["total_trades"],
                "final_equity": result["final_equity"],
                "equity_curve": result["equity_curve"],
                "total_transaction_costs": result.get("total_transaction_costs", 0),
            }
        except Exception as exc:
            logger.warning(f"Compare backtest failed for {sid}/{symbol}: {exc}")
            return None

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=len(strategy_ids)) as pool:
        results = await asyncio.gather(
            *(loop.run_in_executor(pool, _safe_backtest, sid) for sid in strategy_ids)
        )

    comparisons = [r for r in results if r is not None]
    comparisons.sort(key=lambda x: x["total_return_pct"], reverse=True)
    return {"symbol": symbol, "lookback_days": lookback_days, "strategies": comparisons}
