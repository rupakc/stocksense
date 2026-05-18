"""Unit tests for portfolio advisor scoring logic."""

from app.services.portfolio.advisor import (
    _bollinger_position,
    _build_rationale,
    _confidence,
    _risk_level,
    _rsi,
)


def test_rsi_all_gains():
    closes = [100 + i for i in range(20)]
    rsi = _rsi(closes, 14)
    assert rsi == 100.0


def test_rsi_all_losses():
    closes = [100 - i for i in range(20)]
    rsi = _rsi(closes, 14)
    assert rsi == 0.0


def test_rsi_insufficient_data_returns_neutral():
    assert _rsi([100, 101], 14) == 50.0


def test_rsi_balanced():
    closes = [100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102]
    rsi = _rsi(closes, 14)
    assert 40 < rsi < 60


def test_bollinger_position_midpoint():
    closes = [100.0] * 20
    pos = _bollinger_position(closes, 20)
    assert pos == 0.5


def test_bollinger_position_insufficient_data():
    assert _bollinger_position([100, 101], 20) == 0.5


def test_bollinger_position_at_upper():
    closes = [100.0] * 19 + [120.0]
    pos = _bollinger_position(closes, 20)
    assert pos > 0.8


def test_confidence_signals_agree_strong():
    assert _confidence(0.5, 0.6, 0.5, 0.4) == "high"


def test_confidence_signals_agree_weak():
    assert _confidence(0.25, 0.3, 0.25, 0.2) == "medium"


def test_confidence_signals_disagree():
    assert _confidence(0.1, 0.5, -0.3, 0.2) == "low"


def test_confidence_near_zero_signals():
    assert _confidence(0.0, 0.01, -0.01, 0.02) == "low"


def test_risk_level_low():
    tech = {"rsi": 50, "ret_5d": 1.0, "bb_position": 0.5}
    assert _risk_level(tech, 0.1) == "low"


def test_risk_level_high():
    tech = {"rsi": 80, "ret_5d": 6.0, "bb_position": 0.95}
    assert _risk_level(tech, -0.3) == "high"


def test_risk_level_medium():
    tech = {"rsi": 80, "ret_5d": 2.0, "bb_position": 0.5}
    assert _risk_level(tech, 0.0) == "medium"


def test_build_rationale_full():
    tech = {"rsi": 25, "ret_5d": -3.5}
    pred = {"predicted_7d_return": 5.2, "mape": 4.1}
    sent = {"label": "bullish", "article_count_7d": 10}
    rationale = _build_rationale("BUY", tech, pred, sent)
    assert "oversold" in rationale.lower()
    assert "5.2%" in rationale
    assert "bullish" in rationale.lower()


def test_build_rationale_no_prediction():
    tech = {"rsi": 50, "ret_5d": 1.0}
    pred = {"note": "no prediction available"}
    sent = {"label": "neutral", "article_count_7d": 0}
    rationale = _build_rationale("HOLD", tech, pred, sent)
    assert "no prediction" in rationale.lower()


def test_build_rationale_empty():
    rationale = _build_rationale("HOLD", {}, {}, {})
    assert "news" in rationale.lower()
