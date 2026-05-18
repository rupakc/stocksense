"""API route integration tests using httpx + in-memory SQLite."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token
from app.db.database import Base, engine, init_db
from app.main import app


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    token = create_access_token(1, "admin")
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_watchlist_empty(client):
    resp = await client.get("/api/stocks/watchlist")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_add_invalid_symbol(client):
    resp = await client.post(
        "/api/stocks/watchlist",
        json={"symbol": "ZZZNOTREAL999", "exchange": "NSE"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_remove_nonexistent_symbol(client):
    resp = await client.delete("/api/stocks/watchlist/FAKE.NS")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_strategies_list(client):
    resp = await client.get("/api/strategies/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 8
    ids = {s["id"] for s in data}
    assert "golden_cross" in ids
    assert "supertrend" in ids


@pytest.mark.asyncio
async def test_unknown_strategy(client):
    resp = await client.get("/api/strategies/nonexistent/signals")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_portfolio_empty_watchlist(client):
    resp = await client.get("/api/portfolio/")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_prediction_nonexistent_symbol(client):
    resp = await client.get("/api/predictions/ZZZZZ.NS")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_retrain_empty_watchlist(client):
    resp = await client.post("/api/predictions/retrain-all")
    assert resp.status_code == 202
    assert resp.json()["count"] == 0


# ── Auth tests ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login(client):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/auth/login", json={"username": "admin", "password": "Change-Me-123!"})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["username"] == "admin"


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_register_and_login(client):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/auth/register", json={"username": "newuser", "password": "Strong@1234"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "newuser"
        assert "access_token" in data


@pytest.mark.asyncio
async def test_register_duplicate(client):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/auth/register", json={"username": "admin", "password": "Strong@1234"})
        assert resp.status_code == 409


@pytest.mark.asyncio
async def test_get_profile(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json()["username"] == "admin"


@pytest.mark.asyncio
async def test_change_password(client):
    resp = await client.put("/api/auth/password", json={
        "current_password": "Change-Me-123!",
        "new_password": "NewPassword@123",
    })
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_current(client):
    resp = await client.put("/api/auth/password", json={
        "current_password": "wrongpassword",
        "new_password": "NewPassword@123",
    })
    assert resp.status_code == 400


# ── Alerts ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_alerts_endpoint_returns_list(client):
    resp = await client.get("/api/alerts/")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ── Holdings removed ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_holdings_endpoint_removed(client):
    resp = await client.get("/api/portfolio/holdings")
    assert resp.status_code in (404, 405)


# ── Economic tests ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_economic_indicators(client):
    resp = await client.get("/api/economic/indicators")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_forex_rates(client):
    resp = await client.get("/api/economic/forex")
    assert resp.status_code == 200


# ── News tests ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_news_feed(client):
    resp = await client.get("/api/news/")
    assert resp.status_code == 200


# ── Risk analysis test ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_risk_empty_watchlist(client):
    resp = await client.get("/api/portfolio/risk")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbols"] == []
    assert data["correlation_matrix"] == {}


# ── Screener tests ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_screener_sectors(client):
    resp = await client.get("/api/screener/sectors")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ── Momentum test ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_momentum_empty_watchlist(client):
    resp = await client.get("/api/stocks/momentum")
    assert resp.status_code == 200
    assert resp.json() == []


# ── Earnings test ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_earnings_empty_watchlist(client):
    resp = await client.get("/api/stocks/earnings")
    assert resp.status_code == 200
    assert resp.json() == []
