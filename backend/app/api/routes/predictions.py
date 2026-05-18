import asyncio
import logging
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.database import AsyncSessionLocal, get_db
from app.db.models import User
from app.schemas.prediction import PredictionOut, TrainRequest
from app.services.prediction.model import PredictionService

router = APIRouter()
predictor = PredictionService()
logger = logging.getLogger(__name__)

_training_lock = asyncio.Lock()
_training_symbols: set[str] = set()
_last_retrain_ts: dict[int, float] = {}  # keyed by user_id
_RETRAIN_COOLDOWN = 120  # seconds


@router.get("/{symbol}", response_model=PredictionOut)
async def get_prediction(
    symbol: str,
    horizon_days: int = 30,
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = None,
):
    """Return latest prediction for a symbol. Never blocks on training."""
    pred = await predictor.get_latest(symbol, horizon_days=horizon_days, db=db)
    if pred:
        return pred

    if background_tasks and symbol not in _training_symbols:
        background_tasks.add_task(_train_symbol, symbol, horizon_days)

    raise HTTPException(
        status_code=404,
        detail=f"No prediction available yet for {symbol}. Training has been queued.",
    )


@router.post("/train", status_code=202)
async def trigger_training(
    req: TrainRequest,
    background_tasks: BackgroundTasks,
):
    """Trigger async model training for a single symbol."""
    if req.symbol in _training_symbols:
        return {"message": f"Training already in progress for {req.symbol}", "symbol": req.symbol}
    background_tasks.add_task(_train_symbol, req.symbol, req.horizon_days)
    return {"message": f"Training started for {req.symbol}", "symbol": req.symbol}


@router.post("/retrain-all", status_code=202)
async def retrain_all(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Force-retrain predictions for every active watchlist symbol.
    Old prediction rows are deleted first so get_latest returns
    fresh results once training completes.
    """
    last_ts = _last_retrain_ts.get(current_user.id, 0.0)
    elapsed = time.monotonic() - last_ts
    if elapsed < _RETRAIN_COOLDOWN:
        remaining = int(_RETRAIN_COOLDOWN - elapsed)
        raise HTTPException(
            status_code=429,
            detail=f"Retrain cooldown active. Try again in {remaining}s.",
        )

    from sqlalchemy import delete, select
    from app.db.models import PredictionResult, WatchedSymbol

    result = await db.execute(
        select(WatchedSymbol.symbol).where(
            WatchedSymbol.is_active == True,  # noqa: E712
            WatchedSymbol.user_id == current_user.id,
        )
    )
    symbols = [row[0] for row in result.all()]

    if not symbols:
        return {"message": "Watchlist is empty", "count": 0, "symbols": []}

    await db.execute(
        delete(PredictionResult).where(PredictionResult.symbol.in_(symbols))
    )
    await db.commit()
    logger.info(f"[retrain-all] Cleared old predictions for {symbols}")

    _last_retrain_ts[current_user.id] = time.monotonic()

    for symbol in symbols:
        background_tasks.add_task(_train_symbol, symbol, 30)

    return {
        "message": f"Retraining queued for {len(symbols)} symbol(s)",
        "symbols": symbols,
        "count": len(symbols),
    }


# ---------------------------------------------------------------------------
# Background helper — owns its own DB session, per-symbol lock
# ---------------------------------------------------------------------------

async def _train_symbol(symbol: str, horizon_days: int = 30) -> None:
    """Train one symbol with a fresh async session (safe for background tasks)."""
    async with _training_lock:
        if symbol in _training_symbols:
            logger.info(f"[retrain] Skipping {symbol}, already training")
            return
        _training_symbols.add(symbol)

    try:
        async with AsyncSessionLocal() as db:
            from app.services.market_data.nse_fetcher import NSEFetcher
            fetcher = NSEFetcher()
            await fetcher.fetch_and_store(symbol, period="2y", db=db, force=True)

            await predictor.train(symbol, horizon_days, "prophet-multisignal", db)
            logger.info(f"[retrain] Finished {symbol}")
    except Exception as exc:
        logger.error(f"[retrain] Failed {symbol}: {exc}", exc_info=True)
    finally:
        _training_symbols.discard(symbol)
