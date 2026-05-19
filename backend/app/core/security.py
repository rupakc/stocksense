from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

_PASSWORD_SPECIAL_CHARS = set('!@#$%^&*()_+-=[]{}|;:,.<>?')


def validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError('Password must be at least 8 characters')
    if not any(c.isupper() for c in v):
        raise ValueError('Password must contain at least one uppercase letter')
    if not any(c.isdigit() for c in v):
        raise ValueError('Password must contain at least one digit')
    if not any(c in _PASSWORD_SPECIAL_CHARS for c in v):
        raise ValueError('Password must contain at least one special character')
    return v


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: int, username: str, is_admin: bool = False) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(user_id), "username": username, "is_admin": is_admin, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
