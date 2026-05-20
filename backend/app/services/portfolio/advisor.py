"""
Portfolio Advisor Service

Synthesises three signal streams per symbol and produces a ranked list of
BUY / HOLD / SELL / WATCH recommendations.

Signal weights
--------------
  Technical signals  40%   (price momentum, RSI, Bollinger position, MACD)
  ML prediction      35%   (Prophet forward return + confidence)
  News sentiment     25%   (7-day average compound sentiment score)

Score range: -1.0 (strongly bearish) → +1.0 (strongly bullish)
Thresholds:  BUY  >= 0.30 | HOLD  0.10 – 0.29 | WATCH -0.09 – 0.09 | SELL <= -0.10
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as cfg
from app.db.models import NewsArticle, PredictionResult, StockPrice, WatchedSymbol

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Thresholds
# ──────────────────────────────────────────────────────────────────────────────
BUY_THRESHOLD = cfg.advisor_buy_threshold
HOLD_THRESHOLD = cfg.advisor_hold_threshold
WATCH_THRESHOLD = cfg.advisor_watch_threshold

WEIGHTS = {"technical": 0.40, "prediction": 0.35, "sentiment": 0.25}


# ──────────────────────────────────────────────────────────────────────────────
# Public entry point
# ──────────────────────────────────────────────────────────────────────────────


async def advise_watchlist(db: AsyncSession, user_id: int | None = None) -> list[dict]:
    """Return ranked advisory list for every active watched symbol."""
    filters = [WatchedSymbol.is_active.is_(True)]
    if user_id is not None:
        filters.append(WatchedSymbol.user_id == user_id)
    result = await db.execute(select(WatchedSymbol).where(*filters))
    symbols = result.scalars().all()
    if not symbols:
        return []

    advisories = []
    for sym in symbols:
        try:
            rec = await _advise_symbol(sym.symbol, db)
            advisories.append(rec)
        except Exception as e:
            logger.warning(f"[Advisor] Skipping {sym.symbol}: {e}")

    # Sort: BUY first, then HOLD, WATCH, SELL; within group by composite score desc
    order = {"BUY": 0, "HOLD": 1, "WATCH": 2, "SELL": 3}
    advisories.sort(key=lambda r: (order.get(r["signal"], 9), -r["composite_score"]))
    return advisories


# ──────────────────────────────────────────────────────────────────────────────
# Per-symbol logic
# ──────────────────────────────────────────────────────────────────────────────


async def _advise_symbol(symbol: str, db: AsyncSession) -> dict:
    tech_score, tech_detail = await _technical_score(symbol, db)
    pred_score, pred_detail = await _prediction_score(symbol, db)
    sent_score, sent_detail = await _sentiment_score(symbol, db)

    composite = (
        WEIGHTS["technical"] * tech_score
        + WEIGHTS["prediction"] * pred_score
        + WEIGHTS["sentiment"] * sent_score
    )
    composite = max(-1.0, min(1.0, composite))

    if composite >= BUY_THRESHOLD:
        signal = "BUY"
    elif composite >= HOLD_THRESHOLD:
        signal = "HOLD"
    elif composite >= WATCH_THRESHOLD:
        signal = "WATCH"
    else:
        signal = "SELL"

    confidence = _confidence(composite, tech_score, pred_score, sent_score)
    rationale = _build_rationale(signal, tech_detail, pred_detail, sent_detail)
    risk_level = _risk_level(tech_detail, sent_score)

    return {
        "symbol": symbol,
        "signal": signal,
        "confidence": confidence,
        "composite_score": round(composite, 4),
        "technical_score": round(tech_score, 4),
        "prediction_score": round(pred_score, 4),
        "sentiment_score": round(sent_score, 4),
        "rationale": rationale,
        "predicted_7d_return": pred_detail.get("predicted_7d_return"),
        "risk_level": risk_level,
        "last_close": tech_detail.get("last_close"),
        "rsi": tech_detail.get("rsi"),
        "sentiment_label": sent_detail.get("label"),
        "article_count_7d": sent_detail.get("article_count_7d", 0),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Signal: technical (price-based, no ML)
# ──────────────────────────────────────────────────────────────────────────────


async def _technical_score(symbol: str, db: AsyncSession) -> tuple[float, dict]:
    """Score from -1 to +1 based on recent price action and indicators."""
    result = await db.execute(
        select(StockPrice)
        .where(StockPrice.symbol == symbol)
        .order_by(StockPrice.timestamp_utc.desc())
        .limit(60)
    )
    rows = result.scalars().all()
    rows = list(reversed(rows))  # chronological

    if len(rows) < 10:
        return 0.0, {}

    closes = [r.close for r in rows]
    last = closes[-1]

    # 1-day and 5-day momentum
    ret_1d = (closes[-1] - closes[-2]) / closes[-2] if len(closes) >= 2 else 0.0
    ret_5d = (closes[-1] - closes[-6]) / closes[-6] if len(closes) >= 6 else 0.0
    ret_20d = (closes[-1] - closes[-21]) / closes[-21] if len(closes) >= 21 else 0.0

    # RSI (14)
    rsi = _rsi(closes, 14)

    # Bollinger position: 0=at lower, 1=at upper
    bb_pos = _bollinger_position(closes, 20)

    # --- Score components (each in [-1, +1]) ---
    # Momentum: scale ±5% daily → ±1
    mom_score = max(-1.0, min(1.0, ret_5d / 0.10))

    # RSI: >70 = overbought (-0.5), <30 = oversold (+0.5), 50 = neutral
    rsi_score = max(-1.0, min(1.0, (50 - rsi) / 40))  # inverted: low RSI → buy opportunity

    # BB position: <0.2 near lower band (buy), >0.8 near upper (sell)
    bb_score = 1.0 - 2.0 * bb_pos  # 0 → +1 (lower band), 1 → -1 (upper band)

    # 20-day trend
    trend_score = max(-1.0, min(1.0, ret_20d / 0.20))

    score = 0.35 * mom_score + 0.25 * rsi_score + 0.20 * bb_score + 0.20 * trend_score

    detail = {
        "last_close": round(last, 2),
        "ret_1d": round(ret_1d * 100, 2),
        "ret_5d": round(ret_5d * 100, 2),
        "ret_20d": round(ret_20d * 100, 2),
        "rsi": round(rsi, 1),
        "bb_position": round(bb_pos, 3),
    }
    return score, detail


def _rsi(closes: list[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i + 1] - closes[i] for i in range(len(closes) - 1)]
    gains = [max(d, 0) for d in deltas[-period:]]
    losses = [abs(min(d, 0)) for d in deltas[-period:]]
    avg_g = sum(gains) / period
    avg_l = sum(losses) / period
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return 100 - 100 / (1 + rs)


def _bollinger_position(closes: list[float], period: int = 20) -> float:
    if len(closes) < period:
        return 0.5
    window = closes[-period:]
    mean = sum(window) / period
    std = (sum((x - mean) ** 2 for x in window) / period) ** 0.5
    upper = mean + 2 * std
    lower = mean - 2 * std
    if upper == lower:
        return 0.5
    return max(0.0, min(1.0, (closes[-1] - lower) / (upper - lower)))


# ──────────────────────────────────────────────────────────────────────────────
# Signal: ML prediction (forward return)
# ──────────────────────────────────────────────────────────────────────────────


async def _prediction_score(symbol: str, db: AsyncSession) -> tuple[float, dict]:
    """Score derived from the stored Prophet prediction's 7-day forward return."""
    result = await db.execute(
        select(PredictionResult)
        .where(PredictionResult.symbol == symbol)
        .order_by(PredictionResult.trained_at.desc())
        .limit(1)
    )
    pred = result.scalars().first()

    if not pred or not pred.predictions:
        return 0.0, {"note": "no prediction available"}

    preds = pred.predictions
    if not preds:
        return 0.0, {"note": "empty prediction list"}

    # Use actual last close from DB as reference, not the first predicted value
    price_result = await db.execute(
        select(StockPrice.close)
        .where(StockPrice.symbol == symbol)
        .order_by(StockPrice.timestamp_utc.desc())
        .limit(1)
    )
    last_close_row = price_result.scalar_one_or_none()
    current = float(last_close_row) if last_close_row else preds[0].get("predicted_close", 0)
    target_7d = preds[min(6, len(preds) - 1)].get("predicted_close", current)

    if current == 0:
        return 0.0, {}

    predicted_7d_return = (target_7d - current) / current  # fractional

    # Scale: ±10% over 7 days maps to ±1.0
    score = max(-1.0, min(1.0, predicted_7d_return / 0.10))

    # Confidence modifier from metrics
    mape = (pred.metrics or {}).get("mape", 50.0)
    # Low MAPE = high reliability; shrink score toward 0 when MAPE > 10%
    reliability = max(0.3, min(1.0, 1.0 - (mape - 5) / 45))
    score *= reliability

    return score, {
        "predicted_7d_return": round(predicted_7d_return * 100, 2),
        "target_price": round(target_7d, 2),
        "mape": round(mape, 2),
        "model": pred.model_name,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Signal: news sentiment
# ──────────────────────────────────────────────────────────────────────────────


async def _sentiment_score(symbol: str, db: AsyncSession) -> tuple[float, dict]:
    """Score from avg VADER compound sentiment over last 7 days."""
    base = symbol.replace(".NS", "").replace(".BO", "").lower()
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    result = await db.execute(
        select(NewsArticle.sentiment_compound, NewsArticle.published_at)
        .where(
            NewsArticle.published_at >= now_naive - timedelta(days=7),
            NewsArticle.sentiment_compound.is_not(None),
            NewsArticle.title.ilike(f"%{base}%") | NewsArticle.summary.ilike(f"%{base}%"),
        )
        .order_by(NewsArticle.published_at.desc())
    )
    rows = result.all()

    if not rows:
        return 0.0, {"label": "neutral", "article_count_7d": 0, "avg_7d": 0.0}

    vals = [r.sentiment_compound for r in rows if r.sentiment_compound is not None]
    avg = sum(vals) / len(vals) if vals else 0.0

    # VADER compound already -1..+1; map directly to score
    # Dampen: single-article extremes are noisy
    n = len(vals)
    dampening = min(1.0, n / 5)  # full weight only when ≥5 articles
    score = avg * dampening

    label = "bullish" if avg > 0.05 else "bearish" if avg < -0.05 else "neutral"
    return score, {
        "label": label,
        "avg_7d": round(avg, 4),
        "article_count_7d": n,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────


def _confidence(composite: float, tech: float, pred: float, sent: float) -> str:
    """High if signals agree; medium if mixed; low if contradicting."""
    abs_scores = [abs(tech), abs(pred), abs(sent)]
    avg_strength = sum(abs_scores) / 3
    signs = [1 if s > 0 else -1 for s in [tech, pred, sent] if abs(s) > 0.05]
    if len(signs) >= 2 and len(set(signs)) == 1:
        agreement = "agree"
    elif len(set(signs)) > 1:
        agreement = "disagree"
    else:
        agreement = "agree"

    if avg_strength >= 0.4 and agreement == "agree":
        return "high"
    if avg_strength >= 0.2 and agreement == "agree":
        return "medium"
    return "low"


def _build_rationale(
    signal: str,
    tech: dict,
    pred: dict,
    sent: dict,
) -> str:
    parts = []

    # Technical part
    rsi = tech.get("rsi")
    ret_5d = tech.get("ret_5d")
    if rsi is not None:
        if rsi < 35:
            parts.append(f"RSI at {rsi} signals oversold conditions")
        elif rsi > 65:
            parts.append(f"RSI at {rsi} suggests overbought momentum")
        else:
            parts.append(f"RSI is neutral at {rsi}")
    if ret_5d is not None:
        direction = "gained" if ret_5d > 0 else "lost"
        parts.append(f"price has {direction} {abs(ret_5d):.1f}% over 5 days")

    # Prediction part
    ret_7d = pred.get("predicted_7d_return")
    mape = pred.get("mape")
    if ret_7d is not None:
        direction = "upside" if ret_7d > 0 else "downside"
        parts.append(
            f"ML model projects {abs(ret_7d):.1f}% {direction} in 7 days"
            + (f" (MAPE {mape:.1f}%)" if mape is not None else "")
        )
    elif pred.get("note"):
        parts.append(pred["note"])

    # Sentiment part
    label = sent.get("label", "neutral")
    n = sent.get("article_count_7d", 0)
    if n > 0:
        parts.append(f"news sentiment is {label} across {n} recent articles")
    else:
        parts.append("no recent news coverage found")

    if not parts:
        return f"{signal} signal based on composite analysis."

    return ". ".join(p.capitalize() for p in parts) + "."


def _risk_level(tech: dict, sent_score: float) -> str:
    rsi = tech.get("rsi", 50)
    ret_5d = abs(tech.get("ret_5d", 0))
    bb_pos = tech.get("bb_position", 0.5)

    high_vol = ret_5d > 5.0  # >5% weekly move
    extreme_rsi = rsi < 25 or rsi > 75
    near_bb_extreme = bb_pos < 0.10 or bb_pos > 0.90
    negative_sentiment = sent_score < -0.2

    risk_count = sum([high_vol, extreme_rsi, near_bb_extreme, negative_sentiment])
    if risk_count >= 2:
        return "high"
    if risk_count == 1:
        return "medium"
    return "low"
