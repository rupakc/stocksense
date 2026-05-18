"""Unit tests for the trading strategy engine signals and backtest."""

import numpy as np
import pandas as pd
import pytest

from app.services.strategy.engine import (
    STRATEGIES,
    _compute_supertrend,
    _atr,
    _no_data,
)


def _make_df(n=250, base_price=100.0, trend=0.001, seed=42):
    """Generate synthetic OHLCV dataframe for testing."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range(end=pd.Timestamp.today(), periods=n)
    close = np.empty(n)
    close[0] = base_price
    for i in range(1, n):
        close[i] = close[i - 1] * (1 + trend + rng.normal(0, 0.015))
    high = close * (1 + rng.uniform(0.005, 0.02, n))
    low = close * (1 - rng.uniform(0.005, 0.02, n))
    opn = close * (1 + rng.uniform(-0.01, 0.01, n))
    volume = rng.integers(100_000, 5_000_000, n)
    return pd.DataFrame({
        "open": opn, "high": high, "low": low, "close": close, "volume": volume,
    }, index=dates)


def test_strategies_registry_complete():
    assert len(STRATEGIES) == 8
    for sid, meta in STRATEGIES.items():
        assert meta["id"] == sid
        assert "name" in meta
        assert "category" in meta


def test_no_data_returns_hold():
    result = _no_data("test reason")
    assert result["signal"] == "HOLD"
    assert result["strength"] == 0.0
    assert "test reason" in result["rationale"]


def test_atr_positive():
    df = _make_df(50)
    atr = _atr(df, 14)
    assert (atr.dropna() > 0).all()


def test_compute_supertrend_shapes():
    df = _make_df(100)
    st, direction = _compute_supertrend(df)
    assert len(st) == len(df)
    assert len(direction) == len(df)
    assert set(direction.dropna().unique()).issubset({-1, 1})


def test_compute_supertrend_directions_flip():
    df = _make_df(300, trend=0.0, seed=99)
    _, direction = _compute_supertrend(df)
    unique = direction.unique()
    assert 1 in unique and -1 in unique


def test_compute_supertrend_numpy_backed():
    df = _make_df(100)
    st, direction = _compute_supertrend(df)
    assert not np.isnan(st.iloc[-1])
    assert direction.iloc[-1] in (1, -1)
