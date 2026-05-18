"""Shared test fixtures — use an in-memory SQLite so tests never touch the production DB."""

import app.core.config as _cfg
import app.db.database as _db

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

_test_engine = create_async_engine("sqlite+aiosqlite://", echo=False)
_test_session = async_sessionmaker(_test_engine, expire_on_commit=False)

# Patch the module-level objects before any route/model import uses them
_db.engine = _test_engine
_db.AsyncSessionLocal = _test_session
