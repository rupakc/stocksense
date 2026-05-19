import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, validate_password_strength, verify_password
from app.db.database import get_db
from app.db.models import User
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter()

_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_WINDOW = 900  # 15 minutes
_MAX_LOGIN_ATTEMPTS = 10


def _check_rate_limit(client_ip: str):
    now = time.monotonic()
    attempts = _login_attempts[client_ip]
    # Clean old entries
    _login_attempts[client_ip] = [t for t in attempts if now - t < _RATE_LIMIT_WINDOW]
    if len(_login_attempts[client_ip]) >= _MAX_LOGIN_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    _login_attempts[client_ip].append(now)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator('password')
    @classmethod
    def password_strength(cls, v):
        return validate_password_strength(v)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v):
        return validate_password_strength(v)


class UserProfile(BaseModel):
    id: int
    username: str
    preferred_exchange: str = "ALL"
    created_at: str

    model_config = {"from_attributes": True}


class PreferenceUpdate(BaseModel):
    preferred_exchange: str = Field(..., description="ALL, NSE, BSE, or NASDAQ")

    @field_validator('preferred_exchange')
    @classmethod
    def validate_exchange(cls, v):
        from app.core.exchanges import VALID_EXCHANGE_IDS
        if v.upper() not in VALID_EXCHANGE_IDS:
            raise ValueError(f"Exchange must be one of {VALID_EXCHANGE_IDS}")
        return v.upper()


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    _check_rate_limit(request.client.host)
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    token = create_access_token(user.id, user.username, is_admin=user.is_admin)
    return TokenResponse(
        access_token=token,
        username=user.username,
        is_admin=user.is_admin,
        requires_password_change=user.is_first_login,
    )


@router.post("/register", status_code=403)
async def register():
    raise HTTPException(status_code=403, detail="Self-registration is disabled. Contact an administrator.")


@router.get("/me", response_model=UserProfile)
async def get_profile(current_user: User = Depends(get_current_user)):
    return UserProfile(
        id=current_user.id,
        username=current_user.username,
        preferred_exchange=current_user.preferred_exchange or "ALL",
        created_at=current_user.created_at.isoformat(),
    )


@router.get("/preferences")
async def get_preferences(current_user: User = Depends(get_current_user)):
    return {"preferred_exchange": current_user.preferred_exchange or "ALL"}


@router.put("/preferences")
async def update_preferences(
    req: PreferenceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.preferred_exchange = req.preferred_exchange
    await db.commit()
    return {"preferred_exchange": current_user.preferred_exchange}


@router.put("/password")
async def change_password(
    req: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.hashed_password = hash_password(req.new_password)
    current_user.is_first_login = False
    await db.commit()
    return {"message": "Password updated successfully"}
