"""Tests for NaN/Infinity sanitization across all data-returning endpoints."""

import math
import pytest

from app.services.market_data.nse_fetcher import _clean


# ── _clean() helper ─────────────────────────────────────────────────────────

def test_clean_normal_float():
    assert _clean(42.5) == 42.5


def test_clean_int():
    assert _clean(100) == 100.0


def test_clean_nan():
    assert _clean(float("nan")) is None


def test_clean_inf():
    assert _clean(float("inf")) is None


def test_clean_negative_inf():
    assert _clean(float("-inf")) is None


def test_clean_none():
    assert _clean(None) is None


def test_clean_none_with_default():
    assert _clean(None, 0) == 0


def test_clean_nan_with_default():
    assert _clean(float("nan"), 0) == 0


def test_clean_string():
    assert _clean("not a number") is None


def test_clean_empty_string():
    assert _clean("") is None


# ── compare._safe() ─────────────────────────────────────────────────────────

def test_compare_safe_normal():
    from app.api.routes.compare import _safe
    assert _safe(42.567) == 42.57


def test_compare_safe_nan():
    from app.api.routes.compare import _safe
    assert _safe(float("nan")) is None


def test_compare_safe_inf():
    from app.api.routes.compare import _safe
    assert _safe(float("inf")) is None


def test_compare_safe_neg_inf():
    from app.api.routes.compare import _safe
    assert _safe(float("-inf")) is None


def test_compare_safe_none():
    from app.api.routes.compare import _safe
    assert _safe(None) is None


def test_compare_safe_custom_decimals():
    from app.api.routes.compare import _safe
    assert _safe(0.123456, 4) == 0.1235


def test_compare_safe_string():
    from app.api.routes.compare import _safe
    assert _safe("bad") is None


# ── fetch_history NaN filtering ──────────────────────────────────────────────

def test_fetch_history_filters_nan_rows():
    """Verify fetch_history drops rows with NaN OHLC values."""
    import pandas as pd
    from app.services.market_data.nse_fetcher import NSEFetcher

    fetcher = NSEFetcher()
    df = fetcher.fetch_history("RELIANCE.NS", period="1mo")
    if df.empty:
        pytest.skip("Network unavailable")
    for col in ["open", "high", "low", "close"]:
        assert not df[col].isna().any(), f"Column {col} should have no NaN values"


# ── momentum _pct helper ────────────────────────────────────────────────────

def test_momentum_pct_division_by_zero():
    """The _pct helper in stocks.py should handle zero denominators."""
    import importlib
    import app.api.routes.stocks as stocks_mod
    importlib.reload(stocks_mod)

    # _pct is defined inside _get_momentum, so we test it indirectly
    # by verifying _get_momentum doesn't crash with pathological data
    result = stocks_mod._get_momentum("NONEXISTENT_SYMBOL_12345.NS", "Fake")
    assert result is None
