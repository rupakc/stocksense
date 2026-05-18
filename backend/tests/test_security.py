"""Security-focused tests: auth, JWT, rate limiting, input validation."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.db.database import Base, engine, init_db
from app.main import app


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def unauth_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def client():
    token = create_access_token(1, "testuser")
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as ac:
        yield ac


# ── Password hashing ────────────────────────────────────────────────────────

def test_hash_password_produces_bcrypt():
    h = hash_password("Test@1234")
    assert h.startswith("$2b$")


def test_verify_password_correct():
    h = hash_password("Test@1234")
    assert verify_password("Test@1234", h) is True


def test_verify_password_wrong():
    h = hash_password("Test@1234")
    assert verify_password("Wrong@1234", h) is False


# ── JWT tokens ───────────────────────────────────────────────────────────────

def test_create_and_decode_token():
    token = create_access_token(42, "alice")
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "42"
    assert payload["username"] == "alice"


def test_decode_invalid_token():
    assert decode_access_token("not.a.valid.token") is None


def test_decode_tampered_token():
    token = create_access_token(1, "bob")
    tampered = token[:-5] + "XXXXX"
    assert decode_access_token(tampered) is None


# ── Unauthenticated access ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_protected_routes_reject_no_token(unauth_client):
    protected_routes = [
        ("GET", "/api/stocks/watchlist"),
        ("GET", "/api/portfolio/"),
        ("GET", "/api/stocks/momentum"),
        ("GET", "/api/compare/?symbols=RELIANCE,TCS"),
        ("GET", "/api/screener/scan"),
        ("GET", "/api/news/"),
        ("GET", "/api/portfolio/risk"),
    ]
    for method, path in protected_routes:
        resp = await unauth_client.request(method, path)
        assert resp.status_code in (401, 403), f"{method} {path} should require auth, got {resp.status_code}"


@pytest.mark.asyncio
async def test_protected_route_rejects_expired_token(unauth_client):
    from datetime import datetime, timedelta, timezone
    from jose import jwt as jose_jwt
    from app.core.config import settings

    expired_payload = {
        "sub": "1",
        "username": "alice",
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    token = jose_jwt.encode(expired_payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    resp = await unauth_client.get(
        "/api/stocks/watchlist",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401


# ── Registration validation ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_weak_password_no_uppercase(unauth_client):
    resp = await unauth_client.post("/api/auth/register", json={
        "username": "weakuser",
        "password": "nouppercas1!",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_weak_password_no_digit(unauth_client):
    resp = await unauth_client.post("/api/auth/register", json={
        "username": "weakuser",
        "password": "NoDigitHere!",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_weak_password_no_special(unauth_client):
    resp = await unauth_client.post("/api/auth/register", json={
        "username": "weakuser",
        "password": "NoSpecial1A",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_weak_password_too_short(unauth_client):
    resp = await unauth_client.post("/api/auth/register", json={
        "username": "weakuser",
        "password": "Sh1!",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_success(unauth_client):
    resp = await unauth_client.post("/api/auth/register", json={
        "username": "stronguser",
        "password": "Strong@1234",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["username"] == "stronguser"


@pytest.mark.asyncio
async def test_register_duplicate_username(unauth_client):
    await unauth_client.post("/api/auth/register", json={
        "username": "dupeuser",
        "password": "Strong@1234",
    })
    resp = await unauth_client.post("/api/auth/register", json={
        "username": "dupeuser",
        "password": "Strong@1234",
    })
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_username_too_short(unauth_client):
    resp = await unauth_client.post("/api/auth/register", json={
        "username": "ab",
        "password": "Strong@1234",
    })
    assert resp.status_code == 422


# ── Compare input validation ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_compare_too_few_symbols(client):
    resp = await client.get("/api/compare/?symbols=RELIANCE")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_compare_too_many_symbols(client):
    resp = await client.get("/api/compare/?symbols=A,B,C,D,E,F")
    assert resp.status_code == 400


# ── Change password validation ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_change_password_weak_new(unauth_client):
    reg = await unauth_client.post("/api/auth/register", json={
        "username": "pwchanger",
        "password": "Strong@1234",
    })
    token = reg.json()["access_token"]
    resp = await unauth_client.put(
        "/api/auth/password",
        json={"current_password": "Strong@1234", "new_password": "weak"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
