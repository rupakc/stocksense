"""Unit tests for FeatureBuilder normalization and edge cases."""

import numpy as np
import pandas as pd

from app.services.prediction.feature_builder import FeatureBuilder


def test_normalise_basic():
    builder = FeatureBuilder()
    df = pd.DataFrame({
        "ds": pd.date_range("2024-01-01", periods=10),
        "y": range(10),
        "feat_a": [1.0, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    })
    result = builder._normalise(df, ["feat_a"], fit=True)
    assert abs(result["feat_a"].mean()) < 1e-10
    assert abs(result["feat_a"].std(ddof=0) - 1.0) < 0.2


def test_normalise_stores_scaler_stats():
    builder = FeatureBuilder()
    df = pd.DataFrame({"feat": [10.0, 20.0, 30.0]})
    builder._normalise(df, ["feat"], fit=True)
    assert "feat" in builder._scaler_stats
    mean, std = builder._scaler_stats["feat"]
    assert abs(mean - 20.0) < 1e-6
    assert std > 0


def test_normalise_reuses_stats():
    builder = FeatureBuilder()
    train = pd.DataFrame({"feat": [10.0, 20.0, 30.0]})
    builder._normalise(train, ["feat"], fit=True)
    test = pd.DataFrame({"feat": [40.0]})
    result = builder._normalise(test, ["feat"], fit=False)
    mean, std = builder._scaler_stats["feat"]
    expected = (40.0 - mean) / std
    assert abs(result["feat"].iloc[0] - expected) < 1e-6


def test_normalise_handles_inf():
    builder = FeatureBuilder()
    df = pd.DataFrame({"feat": [1.0, np.inf, -np.inf, np.nan]})
    result = builder._normalise(df, ["feat"], fit=True)
    assert not np.any(np.isinf(result["feat"].values))
    assert not np.any(np.isnan(result["feat"].values))


def test_normalise_zero_std():
    builder = FeatureBuilder()
    df = pd.DataFrame({"feat": [5.0, 5.0, 5.0]})
    result = builder._normalise(df, ["feat"], fit=True)
    assert (result["feat"] == 0.0).all()


def test_feature_columns_excludes_reserved():
    builder = FeatureBuilder()
    df = pd.DataFrame({
        "ds": [1], "y": [2], "open": [3], "close": [4],
        "high": [5], "low": [6], "volume": [7],
        "rsi_14": [50], "custom_feat": [1.0],
    })
    cols = builder._feature_columns(df)
    assert "rsi_14" in cols
    assert "custom_feat" in cols
    assert "ds" not in cols
    assert "y" not in cols
    assert "close" not in cols


def test_get_future_features_shape():
    builder = FeatureBuilder()
    train = pd.DataFrame({
        "ds": pd.bdate_range("2024-01-01", periods=20),
        "feat_a": range(20),
        "feat_b": range(20),
        "sentiment_7d": [0.0] * 20,
    })
    future = builder.get_future_features(train, horizon_days=5)
    assert len(future) == 25
    assert "feat_a" in future.columns
    assert (future["sentiment_7d"].iloc[-5:] == 0.0).all()
