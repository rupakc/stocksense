import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Alert, User
from app.schemas.alert import ALERT_TYPES, AlertCreate, AlertOut, TriggeredAlert
from app.services.market_data.nse_fetcher import NSEFetcher

logger = logging.getLogger(__name__)
router = APIRouter()
fetcher = NSEFetcher()


@router.get("/", response_model=list[AlertOut])
async def list_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Alert).where(Alert.user_id == current_user.id).order_by(Alert.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=AlertOut, status_code=201)
async def create_alert(
    req: AlertCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if req.alert_type not in ALERT_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Invalid alert_type. Must be one of: {ALERT_TYPES}"
        )

    alert = Alert(
        user_id=current_user.id,
        symbol=req.symbol,
        alert_type=req.alert_type,
        threshold=req.threshold,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.put("/{alert_id}", response_model=AlertOut)
async def update_alert(
    alert_id: int,
    req: AlertCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Alert).where(Alert.id == alert_id, Alert.user_id == current_user.id)
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if req.alert_type not in ALERT_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Invalid alert_type. Must be one of: {ALERT_TYPES}"
        )
    alert.alert_type = req.alert_type
    alert.threshold = req.threshold
    alert.is_active = True
    alert.triggered_at = None
    await db.commit()
    await db.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=204)
async def delete_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Alert).where(Alert.id == alert_id, Alert.user_id == current_user.id)
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.delete(alert)
    await db.commit()


@router.get("/triggered", response_model=list[TriggeredAlert])
async def get_triggered_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Alert)
        .where(
            Alert.user_id == current_user.id,
            Alert.triggered_at.isnot(None),
        )
        .order_by(Alert.triggered_at.desc())
        .limit(50)
    )
    alerts = result.scalars().all()
    return [
        TriggeredAlert(
            id=a.id,
            symbol=a.symbol,
            alert_type=a.alert_type,
            threshold=a.threshold,
            current_value=a.triggered_value if a.triggered_value is not None else a.threshold,
            triggered_at=a.triggered_at,
        )
        for a in alerts
    ]


@router.post("/check", response_model=list[TriggeredAlert])
async def check_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Alert).where(Alert.user_id == current_user.id, Alert.is_active.is_(True))
    )
    active_alerts = result.scalars().all()
    if not active_alerts:
        return []

    symbols = list({a.symbol for a in active_alerts})
    loop = asyncio.get_event_loop()
    quotes = await asyncio.gather(
        *(loop.run_in_executor(None, fetcher.get_live_quote, s) for s in symbols)
    )
    quote_map = {s: q for s, q in zip(symbols, quotes) if q}

    triggered = []
    now = datetime.now(timezone.utc)

    for alert in active_alerts:
        q = quote_map.get(alert.symbol)
        if not q:
            continue

        current_val = None
        hit = False

        if alert.alert_type == "price_above":
            current_val = q["current_price"]
            hit = current_val >= alert.threshold
        elif alert.alert_type == "price_below":
            current_val = q["current_price"]
            hit = current_val <= alert.threshold
        elif alert.alert_type == "change_pct_above":
            current_val = q["change_pct"]
            hit = current_val >= alert.threshold
        elif alert.alert_type == "change_pct_below":
            current_val = q["change_pct"]
            hit = current_val <= alert.threshold
        elif alert.alert_type == "volume_above":
            current_val = q["volume"]
            hit = current_val >= alert.threshold

        if hit:
            alert.triggered_at = now
            alert.triggered_value = current_val
            alert.is_active = False
            triggered.append(
                TriggeredAlert(
                    id=alert.id,
                    symbol=alert.symbol,
                    alert_type=alert.alert_type,
                    threshold=alert.threshold,
                    current_value=current_val,
                    triggered_at=now,
                )
            )

    await db.commit()
    return triggered
