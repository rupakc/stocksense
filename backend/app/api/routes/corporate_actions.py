import asyncio
import logging
import time
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import User, WatchedSymbol
import yfinance as yf

router = APIRouter()
logger = logging.getLogger(__name__)

_actions_cache: dict[str, tuple[float, list]] = {}
_CACHE_TTL = 3600

def _get_corporate_actions(symbol: str) -> list[dict]:
    now = time.monotonic()
    cached = _actions_cache.get(symbol)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1]

    results = []
    try:
        ticker = yf.Ticker(symbol)

        # Dividends
        divs = ticker.dividends
        if divs is not None and len(divs) > 0:
            for idx, val in divs.tail(10).items():
                results.append({
                    "symbol": symbol,
                    "type": "Dividend",
                    "date": idx.strftime("%Y-%m-%d"),
                    "details": f"₹{float(val):.2f} per share",
                    "value": round(float(val), 2),
                })

        # Splits
        splits = ticker.splits
        if splits is not None and len(splits) > 0:
            for idx, val in splits.items():
                ratio = float(val)
                results.append({
                    "symbol": symbol,
                    "type": "Stock Split",
                    "date": idx.strftime("%Y-%m-%d"),
                    "details": f"{ratio:.0f}:1 split" if ratio > 1 else f"1:{1/ratio:.0f} reverse split",
                    "value": ratio,
                })

        # Capital gains distributions (bonus shares indicator)
        try:
            actions = ticker.actions
            if actions is not None and len(actions) > 0:
                for idx, row in actions.tail(10).iterrows():
                    if row.get("Stock Splits", 0) == 0 and row.get("Dividends", 0) == 0:
                        # Other action
                        results.append({
                            "symbol": symbol,
                            "type": "Other Action",
                            "date": idx.strftime("%Y-%m-%d"),
                            "details": str(row.to_dict()),
                            "value": None,
                        })
        except Exception:
            pass

        results.sort(key=lambda x: x["date"], reverse=True)
        _actions_cache[symbol] = (now, results)
    except Exception as e:
        logger.warning(f"Corporate actions fetch failed for {symbol}: {e}")

    return results


@router.get("/")
async def get_watchlist_corporate_actions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    sem = asyncio.Semaphore(10)
    async def fetch(sym):
        async with sem:
            return await loop.run_in_executor(None, _get_corporate_actions, sym[0])

    all_results = await asyncio.gather(*(fetch(s) for s in symbols))

    # Flatten and sort by date
    actions = []
    for batch in all_results:
        actions.extend(batch)
    actions.sort(key=lambda x: x["date"], reverse=True)

    return actions[:100]


@router.get("/{symbol}")
async def get_symbol_corporate_actions(
    symbol: str,
    current_user: User = Depends(get_current_user),
):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _get_corporate_actions, symbol)
    return result
