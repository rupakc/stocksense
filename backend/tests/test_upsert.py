"""Tests for the dialect-aware upsert helper."""

from datetime import datetime

import pytest
from sqlalchemy import select

from app.db.database import Base, engine, init_db, AsyncSessionLocal
from app.db.models import NewsArticle
from app.db.upsert import insert_ignore_batch, insert_ignore_single


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_insert_ignore_single_no_conflict():
    async with AsyncSessionLocal() as db:
        await insert_ignore_single(db, NewsArticle, {
            "article_hash": "abc123",
            "title": "Test Article",
            "url": "http://example.com",
            "source": "test",
            "published_at": datetime(2024, 1, 1),
        }, ["article_hash"])
        await db.commit()

        result = await db.execute(select(NewsArticle))
        assert len(result.scalars().all()) == 1


@pytest.mark.asyncio
async def test_insert_ignore_single_with_conflict():
    async with AsyncSessionLocal() as db:
        for _ in range(2):
            await insert_ignore_single(db, NewsArticle, {
                "article_hash": "dup_hash",
                "title": "Duplicate",
                "url": "http://example.com",
                "source": "test",
                "published_at": datetime(2024, 1, 1),
            }, ["article_hash"])
        await db.commit()

        result = await db.execute(select(NewsArticle))
        assert len(result.scalars().all()) == 1


@pytest.mark.asyncio
async def test_insert_ignore_batch_empty():
    async with AsyncSessionLocal() as db:
        await insert_ignore_batch(db, NewsArticle, [], ["article_hash"])
        await db.commit()
