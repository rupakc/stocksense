import asyncio
import logging
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.api.deps import get_current_user
from app.api.routes import auth, stocks, predictions, news, economic, portfolio, strategies, screener, compare, tax, corporate_actions, alerts
from app.api.routes.mf_overlap import router as mf_router
from app.core.config import settings
from app.db.database import AsyncSessionLocal, init_db

logger = logging.getLogger(__name__)

if settings.jwt_secret_key == "CHANGE-ME-IN-ENV":
    warnings.warn(
        "⚠️  Using default JWT secret — set JWT_SECRET_KEY env var for production!",
        stacklevel=2,
    )

RETRAIN_INTERVAL = timedelta(hours=settings.prediction_max_age_hours)


async def _daily_training_loop() -> None:
    """Train models for watchlist symbols with stale or missing predictions."""
    await asyncio.sleep(10)  # let the app finish starting

    while True:
        try:
            await _retrain_stale_symbols()
        except Exception as exc:
            logger.error(f"[scheduler] Training loop error: {exc}", exc_info=True)
        await asyncio.sleep(RETRAIN_INTERVAL.total_seconds())


_TRAIN_SEMAPHORE = asyncio.Semaphore(3)
_TRAIN_TIMEOUT = 30 * 60  # 30 minutes


async def _retrain_stale_symbols() -> None:
    from sqlalchemy import select
    from app.db.models import PredictionResult, WatchedSymbol

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(WatchedSymbol.symbol).where(WatchedSymbol.is_active == True)  # noqa: E712
        )
        symbols = [row[0] for row in result.all()]

    if not symbols:
        return

    cutoff = datetime.now(timezone.utc) - RETRAIN_INTERVAL
    stale_symbols = []
    for symbol in symbols:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(PredictionResult.trained_at)
                    .where(PredictionResult.symbol == symbol)
                    .order_by(PredictionResult.trained_at.desc())
                    .limit(1)
                )
                last_trained = result.scalar_one_or_none()

            if last_trained:
                if last_trained.tzinfo is None:
                    from datetime import timezone as _tz
                    last_trained = last_trained.replace(tzinfo=_tz.utc)
                if last_trained >= cutoff:
                    continue

            stale_symbols.append(symbol)
        except Exception as exc:
            logger.error(f"[scheduler] Failed checking {symbol}: {exc}", exc_info=True)

    if not stale_symbols:
        return

    async def _train_limited(symbol: str) -> None:
        async with _TRAIN_SEMAPHORE:
            try:
                logger.info(f"[scheduler] Queuing training for {symbol}")
                await asyncio.wait_for(
                    predictions._train_symbol(symbol, 30),
                    timeout=_TRAIN_TIMEOUT,
                )
            except asyncio.TimeoutError:
                logger.error(f"[retrain] Timed out training {symbol} after {_TRAIN_TIMEOUT}s")
            except Exception as exc:
                logger.error(f"[retrain] Failed {symbol}: {exc}")

    await asyncio.gather(*[_train_limited(s) for s in stale_symbols])


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    task = asyncio.create_task(_daily_training_loop())
    yield
    task.cancel()


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

# Protected routes — require valid JWT
protected = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)])
protected.include_router(stocks.router, prefix="/stocks", tags=["stocks"])
protected.include_router(predictions.router, prefix="/predictions", tags=["predictions"])
protected.include_router(news.router, prefix="/news", tags=["news"])
protected.include_router(economic.router, prefix="/economic", tags=["economic"])
protected.include_router(portfolio.router, prefix="/portfolio", tags=["portfolio"])
protected.include_router(strategies.router, prefix="/strategies", tags=["strategies"])
protected.include_router(screener.router, prefix="/screener", tags=["screener"])
protected.include_router(compare.router, prefix="/compare", tags=["compare"])
protected.include_router(tax.router, prefix="/tax", tags=["tax"])
protected.include_router(corporate_actions.router, prefix="/corporate-actions", tags=["corporate-actions"])
protected.include_router(mf_router, prefix="/mf", tags=["mutual-funds"])
protected.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
app.include_router(protected)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "stocksense-api"}


@app.get("/api/exchanges")
async def get_exchanges():
    from app.core.exchanges import get_client_registry
    return get_client_registry()
