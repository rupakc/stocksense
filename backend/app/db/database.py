import logging

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(settings.database_url, echo=settings.debug)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    async with engine.begin() as conn:
        from app.db import models  # noqa: F401 — register models
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("PRAGMA journal_mode=WAL"))

    await _migrate_user_id_column()
    await _migrate_users_columns()
    await _seed_default_user()


async def _migrate_user_id_column():
    """Add user_id column to watched_symbols if it doesn't exist."""
    async with engine.begin() as conn:
        try:
            result = await conn.execute(text("PRAGMA table_info(watched_symbols)"))
            cols = [row[1] for row in result.fetchall()]
            if "user_id" not in cols:
                await conn.execute(text(
                    "ALTER TABLE watched_symbols ADD COLUMN user_id INTEGER REFERENCES users(id)"
                ))
                logger.info("[init] Added user_id column to watched_symbols")
        except OperationalError:
            pass  # table doesn't exist yet — create_all handles it


async def _migrate_users_columns():
    """Add any missing columns to the users table — safe to call repeatedly.

    Each column is added in its own statement so one failure doesn't prevent others.
    SQLite does not support UNIQUE constraints in ALTER TABLE ADD COLUMN; the email
    uniqueness is enforced via a partial index created separately.
    """
    new_columns = [
        ("preferred_exchange", "VARCHAR(10) DEFAULT 'ALL'"),
        ("is_admin",       "BOOLEAN NOT NULL DEFAULT 0"),
        ("is_active",      "BOOLEAN NOT NULL DEFAULT 1"),
        ("email",          "VARCHAR(255)"),   # UNIQUE enforced below via partial index
        ("is_first_login", "BOOLEAN NOT NULL DEFAULT 1"),
    ]
    async with engine.begin() as conn:
        result = await conn.execute(text("PRAGMA table_info(users)"))
        existing = {row[1] for row in result.fetchall()}
        if not existing:
            return  # table not yet created — create_all handles it

        for col_name, col_def in new_columns:
            if col_name not in existing:
                try:
                    await conn.execute(text(
                        f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"
                    ))
                    logger.info(f"[init] Added column '{col_name}' to users")
                except OperationalError as exc:
                    logger.warning(f"[init] Could not add '{col_name}': {exc}")

        # Ensure the email unique index exists (partial — NULL emails are not unique)
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email "
            "ON users(email) WHERE email IS NOT NULL"
        ))


async def _seed_default_user():
    """Create the default user if it doesn't exist."""
    from sqlalchemy import select
    from app.core.security import hash_password
    from app.db.models import User, WatchedSymbol

    if settings.env == "production":
        logger.info("[init] Skipping default user seeding in production")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == settings.default_username))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                username=settings.default_username,
                hashed_password=hash_password(settings.default_password),
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            logger.info(f"[init] Created default user '{user.username}' (id={user.id})")
            logger.warning("[init] Default credentials active — change password in production!")

        orphans = await db.execute(
            select(WatchedSymbol).where(WatchedSymbol.user_id.is_(None))
        )
        for ws in orphans.scalars().all():
            ws.user_id = user.id
        await db.commit()


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
