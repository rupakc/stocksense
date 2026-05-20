"""Admin-only user management endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin
from app.core.security import hash_password, validate_password_strength
from app.db.models import User

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str
    email: str | None = None
    is_admin: bool = False

    @field_validator('password')
    @classmethod
    def password_strength(cls, v):
        return validate_password_strength(v)

    @field_validator('email', mode='before')
    @classmethod
    def normalize_email(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v


class ResetPasswordRequest(BaseModel):
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v):
        return validate_password_strength(v)


class PatchUserRequest(BaseModel):
    is_admin: bool | None = None


def _safe(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "is_first_login": user.is_first_login,
        "preferred_exchange": user.preferred_exchange,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.post("/users", status_code=201)
async def admin_create_user(
    req: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.username == req.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    if req.email:
        result = await db.execute(select(User).where(User.email == req.email))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already in use")

    user = User(
        username=req.username,
        hashed_password=hash_password(req.password),
        email=req.email,
        is_admin=req.is_admin,
        is_active=True,
        is_first_login=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("Admin '%s' created user '%s'", _admin.username, user.username)
    return _safe(user)


@router.get("/users")
async def admin_list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return [_safe(u) for u in result.scalars().all()]


@router.delete("/users/{user_id}", status_code=204)
async def admin_deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    await db.commit()


@router.post("/users/{user_id}/reactivate", status_code=200)
async def admin_reactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    await db.commit()
    return {"status": "reactivated"}


@router.post("/users/{user_id}/reset-password", status_code=200)
async def admin_reset_password(
    user_id: int,
    req: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Cannot reset password for an inactive user")
    user.hashed_password = hash_password(req.new_password)
    user.is_first_login = True
    await db.commit()
    logger.info("Admin '%s' reset password for user '%s'", _admin.username, user.username)
    return {"status": "password_reset", "user_id": user_id}


@router.get("/training-status")
async def training_status(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Return per-symbol training diagnostics for the admin watchlist."""
    from app.api.routes.predictions import _training_symbols
    from app.db.models import PredictionResult, StockPrice, WatchedSymbol

    sym_result = await db.execute(
        select(WatchedSymbol.symbol).where(
            WatchedSymbol.user_id == admin.id,
            WatchedSymbol.is_active == True,  # noqa: E712
        )
    )
    symbols = [row[0] for row in sym_result.all()]

    per_symbol = []
    for sym in symbols:
        price_count = (
            await db.execute(select(func.count()).where(StockPrice.symbol == sym))
        ).scalar() or 0

        pred_row = (
            await db.execute(
                select(PredictionResult)
                .where(PredictionResult.symbol == sym)
                .order_by(PredictionResult.trained_at.desc())
                .limit(1)
            )
        ).scalars().first()

        per_symbol.append({
            "symbol": sym,
            "price_rows_in_db": price_count,
            "is_training_now": sym in _training_symbols,
            "last_trained_at": pred_row.trained_at.isoformat() if pred_row else None,
            "model_name": pred_row.model_name if pred_row else None,
            "mape": (pred_row.metrics or {}).get("mape") if pred_row else None,
            "has_prediction": pred_row is not None,
        })

    return {
        "currently_training": list(_training_symbols),
        "symbols": per_symbol,
    }


@router.patch("/users/{user_id}", status_code=200)
async def admin_patch_user(
    user_id: int,
    req: PatchUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if req.is_admin is not None:
        if user_id == admin.id and not req.is_admin:
            raise HTTPException(status_code=400, detail="Cannot remove admin from your own account")
        user.is_admin = req.is_admin
    await db.commit()
    await db.refresh(user)
    return _safe(user)
