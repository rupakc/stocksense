"""Dialect-aware upsert helpers for SQLite and PostgreSQL."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings


def _is_sqlite() -> bool:
    return settings.database_url.startswith("sqlite")


async def insert_ignore_batch(
    db: AsyncSession, model, records: list[dict], conflict_cols: list[str]
):
    """Insert rows, silently skip conflicts on *conflict_cols*."""
    if not records:
        return
    if _is_sqlite():
        from sqlalchemy.dialects.sqlite import insert
    else:
        from sqlalchemy.dialects.postgresql import insert
    stmt = insert(model).values(records).on_conflict_do_nothing(index_elements=conflict_cols)
    await db.execute(stmt)


async def insert_ignore_single(db: AsyncSession, model, values: dict, conflict_cols: list[str]):
    """Insert a single row, silently skip if conflict on *conflict_cols*."""
    if _is_sqlite():
        from sqlalchemy.dialects.sqlite import insert
    else:
        from sqlalchemy.dialects.postgresql import insert
    stmt = insert(model).values(**values).on_conflict_do_nothing(index_elements=conflict_cols)
    await db.execute(stmt)
