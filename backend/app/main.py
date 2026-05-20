import asyncio
import logging
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.api.deps import get_active_user
from app.api.routes import (
    auth,
    stocks,
    predictions,
    news,
    economic,
    portfolio,
    strategies,
    screener,
    compare,
    tax,
    corporate_actions,
    alerts,
    admin,
)
from app.api.routes.mf_overlap import router as mf_router
from app.core.config import settings
from app.db.database import AsyncSessionLocal, init_db
from app.services.gcs_sync import init_gcs_sync

logger = logging.getLogger(__name__)

if settings.jwt_secret_key == "CHANGE-ME-IN-ENV":
    warnings.warn(
        "⚠️  Using default JWT secret — set JWT_SECRET_KEY env var for production!",
        stacklevel=2,
    )

_RETRAIN_INTERVAL_SECONDS = 3600  # retrain every 1 hour


def _ensure_utc(dt: datetime) -> datetime:
    """Return a UTC-aware datetime, attaching UTC if the value is naive."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


_TRAIN_SEMAPHORE = asyncio.Semaphore(1)
_TRAIN_TIMEOUT = 30 * 60  # 30 minutes per symbol


async def _get_admin_symbols() -> list[str]:
    """Return all active watchlist symbols belonging to the admin user."""
    from sqlalchemy import select
    from app.db.models import User, WatchedSymbol

    async with AsyncSessionLocal() as db:
        admin_row = await db.execute(
            select(User).where(User.is_admin == True).limit(1)  # noqa: E712
        )
        admin = admin_row.scalar_one_or_none()
        if not admin:
            logger.warning("[scheduler] No admin user found — skipping training")
            return []

        sym_rows = await db.execute(
            select(WatchedSymbol.symbol).where(
                WatchedSymbol.user_id == admin.id,
                WatchedSymbol.is_active == True,  # noqa: E712
            )
        )
        return [r[0] for r in sym_rows.all()]


async def _train_admin_symbols() -> None:
    """Train (or retrain) every symbol in the admin watchlist, one at a time."""
    symbols = await _get_admin_symbols()
    if not symbols:
        logger.warning("[scheduler] Admin watchlist is empty — nothing to train")
        return

    logger.info(f"[scheduler] Training {len(symbols)} symbol(s): {symbols}")

    async def _train_one(symbol: str) -> None:
        async with _TRAIN_SEMAPHORE:
            try:
                logger.info(f"[scheduler] ▶ Starting {symbol}")
                await asyncio.wait_for(
                    predictions._train_symbol(symbol, 30),
                    timeout=_TRAIN_TIMEOUT,
                )
                logger.info(f"[scheduler] ✓ Finished {symbol}")
            except asyncio.TimeoutError:
                logger.error(f"[scheduler] ✗ Timeout {symbol} after {_TRAIN_TIMEOUT}s")
            except Exception as exc:
                logger.error(f"[scheduler] ✗ Failed {symbol}: {exc}", exc_info=True)

    await asyncio.gather(*[_train_one(s) for s in symbols])
    logger.info("[scheduler] Training round complete")


async def _training_loop() -> None:
    """On startup: train all admin symbols immediately.
    Then repeat every hour so predictions stay fresh.
    """
    # Allow DB init + admin seed to complete first
    await asyncio.sleep(15)

    while True:
        try:
            logger.info("[scheduler] === Training round started ===")
            await _train_admin_symbols()
        except Exception as exc:
            logger.error(f"[scheduler] Training round failed: {exc}", exc_info=True)
        logger.info(f"[scheduler] Next training round in {_RETRAIN_INTERVAL_SECONDS // 60} minutes")
        await asyncio.sleep(_RETRAIN_INTERVAL_SECONDS)


async def _periodic_db_backup(gcs, db_path: str) -> None:
    """Upload a consistent DB snapshot to GCS every gcs_backup_interval_seconds."""
    while True:
        await asyncio.sleep(settings.gcs_backup_interval_seconds)
        await asyncio.to_thread(gcs.backup_db, db_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    gcs = init_gcs_sync(settings.gcs_bucket)
    db_path = settings.db_file_path

    # 1. Restore DB from GCS before init_db() so existing tables/data are preserved
    if db_path:
        await asyncio.to_thread(gcs.download_db, db_path)

    # 2. Initialise schema (creates tables only if they don't already exist)
    await init_db()
    await _seed_admin_user()

    # 3. Restore trained models from GCS
    model_count = await asyncio.to_thread(gcs.download_models, settings.model_dir)
    if gcs.enabled and model_count == 0:
        logger.warning(
            "[startup] No model files restored from GCS — "
            "predictions will return 404 until the training loop completes"
        )
    elif model_count > 0:
        logger.info(f"[startup] {model_count} model file(s) ready in {settings.model_dir}")

    # 4. Start background tasks
    training_task = asyncio.create_task(_training_loop())
    # Only run DB backup loop when GCS is configured — avoids pointless no-op wakeups
    backup_task = (
        asyncio.create_task(_periodic_db_backup(gcs, db_path)) if db_path and gcs.enabled else None
    )

    yield

    # 5. Graceful shutdown: final DB backup before the container exits
    training_task.cancel()
    if backup_task:
        backup_task.cancel()
    if db_path:
        await asyncio.to_thread(gcs.backup_db, db_path)


async def _seed_admin_user() -> None:
    """Ensure the admin account exists, password matches DEFAULT_PASSWORD, and
    the admin's watchlist has the default symbols so training can start."""
    from sqlalchemy import select
    from app.db.models import User, WatchedSymbol
    from app.core.security import hash_password

    fresh_hash = hash_password(settings.default_password)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.is_admin == True).limit(1))  # noqa: E712
        admin = result.scalar_one_or_none()

        if admin:
            admin.hashed_password = fresh_hash
            admin.is_active = True
            await db.commit()
            logger.info(f"Admin '{admin.username}' password synced from DEFAULT_PASSWORD")
        else:
            existing = await db.execute(
                select(User).where(User.username == settings.default_username)
            )
            user = existing.scalar_one_or_none()
            if user:
                user.is_admin = True
                user.is_first_login = False
                user.is_active = True
                user.hashed_password = fresh_hash
                await db.commit()
                admin = user
                logger.info(f"Promoted '{settings.default_username}' to admin")
            else:
                admin = User(
                    username=settings.default_username,
                    hashed_password=fresh_hash,
                    is_admin=True,
                    is_first_login=False,
                    is_active=True,
                )
                db.add(admin)
                await db.commit()
                logger.info(f"Seeded admin user '{settings.default_username}'")

        # Ensure the admin watchlist has the default symbols so the training loop
        # has something to work with immediately on first deployment.
        await db.refresh(admin)
        ws_check = await db.execute(
            select(WatchedSymbol).where(WatchedSymbol.user_id == admin.id).limit(1)
        )
        if not ws_check.scalar_one_or_none():
            for sym in settings.default_symbols:
                exchange = "BSE" if sym.endswith(".BO") else "NSE"
                db.add(
                    WatchedSymbol(
                        symbol=sym,
                        exchange=exchange,
                        user_id=admin.id,
                        is_active=True,
                    )
                )
            await db.commit()
            logger.info(
                f"Seeded default watchlist ({len(settings.default_symbols)} symbols) for admin"
            )


app = FastAPI(
    title="StockSense India API",
    description="Indian stock market monitoring and ML-based price prediction",
    version="0.1.0",
    lifespan=lifespan,
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "connect-src 'self' http://localhost:* ws://localhost:*; "
            "font-src 'self' data:; "
            "frame-ancestors 'none'"
        )
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        if settings.env == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


# SecurityHeadersMiddleware added BEFORE CORSMiddleware
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# Unprotected routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])

# Protected routes — require valid JWT + active account
protected = APIRouter(prefix="/api", dependencies=[Depends(get_active_user)])
protected.include_router(stocks.router, prefix="/stocks", tags=["stocks"])
protected.include_router(predictions.router, prefix="/predictions", tags=["predictions"])
protected.include_router(news.router, prefix="/news", tags=["news"])
protected.include_router(economic.router, prefix="/economic", tags=["economic"])
protected.include_router(portfolio.router, prefix="/portfolio", tags=["portfolio"])
protected.include_router(strategies.router, prefix="/strategies", tags=["strategies"])
protected.include_router(screener.router, prefix="/screener", tags=["screener"])
protected.include_router(compare.router, prefix="/compare", tags=["compare"])
protected.include_router(tax.router, prefix="/tax", tags=["tax"])
protected.include_router(
    corporate_actions.router, prefix="/corporate-actions", tags=["corporate-actions"]
)
protected.include_router(mf_router, prefix="/mf", tags=["mutual-funds"])
protected.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
protected.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(protected)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "stocksense-api"}


@app.get("/api/exchanges")
async def get_exchanges():
    from app.core.exchanges import get_client_registry

    return get_client_registry()
