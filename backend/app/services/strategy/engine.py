"""
Trading strategy engine — generates signals and backtests for stocks.

Strategies:
  1. golden_cross       — 50/200 SMA crossover (Golden / Death Cross)
  2. rsi_mean_reversion — RSI 14 overbought/oversold
  3. macd_momentum      — MACD 12/26/9 crossover
  4. bollinger_breakout — Bollinger Bands 20/2σ breakout + squeeze
  5. ema_ribbon         — EMA 9/21/55 alignment (trend ribbon)
  6. volume_breakout    — Volume surge (>2×) + price confirmation
  7. donchian_breakout  — Donchian Channel 20-day (Turtle Trading)
  8. supertrend         — ATR-based Supertrend 10/3
"""

import hashlib
import json
import logging
import threading
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import yfinance as yf

from app.core.exchanges import exchange_for_symbol

# ─────────────────────────────────────────────────────────────────────────────
# Transaction costs per exchange (delivery-based)
# ─────────────────────────────────────────────────────────────────────────────
INDIAN_TRANSACTION_COSTS = {
    "stt_buy": 0.001,  # 0.1% STT on buy (delivery)
    "stt_sell": 0.001,  # 0.1% STT on sell (delivery)
    "brokerage": 0.0003,  # 0.03% typical discount broker
    "exchange_txn": 0.0000345,  # NSE transaction charge
    "gst": 0.18,  # 18% GST on brokerage
    "sebi_fee": 0.000001,  # SEBI turnover fee
    "stamp_duty_buy": 0.00015,  # 0.015% stamp duty on buy
}

US_TRANSACTION_COSTS = {
    "brokerage": 0.0,  # zero commission (most US brokers)
    "sec_fee": 0.0000278,  # SEC transaction fee (~$27.80 per $1M)
    "taf_fee": 0.000119,  # FINRA TAF ($0.000119 per share, approximated as %)
}


def _yfinance_ticker(symbol: str) -> str:
    """Convert internal symbol to yfinance ticker.
    .NS/.BO symbols pass through; bare symbols (NASDAQ) pass through too.
    """
    if symbol.endswith((".NS", ".BO")):
        return symbol
    return symbol


def calculate_transaction_cost(
    price: float, quantity: int, side: str, exchange: str = "NSE"
) -> float:
    """Calculate realistic transaction costs based on exchange."""
    value = price * quantity
    if exchange == "NASDAQ":
        brokerage = value * US_TRANSACTION_COSTS["brokerage"]
        sec_fee = value * US_TRANSACTION_COSTS["sec_fee"] if side == "sell" else 0
        taf_fee = value * US_TRANSACTION_COSTS["taf_fee"] if side == "sell" else 0
        return brokerage + sec_fee + taf_fee

    # Indian markets (NSE / BSE)
    costs = INDIAN_TRANSACTION_COSTS
    brokerage = value * costs["brokerage"]
    gst = brokerage * costs["gst"]
    stt = value * (costs["stt_buy"] if side == "buy" else costs["stt_sell"])
    exchange_txn = value * costs["exchange_txn"]
    sebi = value * costs["sebi_fee"]
    stamp = value * costs["stamp_duty_buy"] if side == "buy" else 0
    return brokerage + gst + stt + exchange_txn + sebi + stamp


# ─────────────────────────────────────────────────────────────────────────────
# Backtest result cache (keyed by symbol+strategy+period+params, TTL 30min)
# ─────────────────────────────────────────────────────────────────────────────
_backtest_cache: dict[str, tuple[float, dict]] = {}
_BACKTEST_CACHE_TTL = 1800  # 30 minutes
_backtest_cache_lock = threading.Lock()


def _cache_key(
    symbol: str,
    strategy_id: str,
    lookback_days: int,
    start_date: str | None,
    end_date: str | None,
    params: dict | None,
    include_costs: bool,
) -> str:
    params_str = json.dumps(params, sort_keys=True) if params else ""
    raw = f"{symbol}:{strategy_id}:{lookback_days}:{start_date}:{end_date}:{params_str}:{include_costs}"
    return hashlib.md5(raw.encode(), usedforsecurity=False).hexdigest()  # noqa: S324


def _cache_get(key: str) -> dict | None:
    with _backtest_cache_lock:
        if key in _backtest_cache:
            ts, result = _backtest_cache[key]
            if time.monotonic() - ts < _BACKTEST_CACHE_TTL:
                return result
            del _backtest_cache[key]
    return None


def _cache_set(key: str, result: dict) -> None:
    with _backtest_cache_lock:
        _backtest_cache[key] = (time.monotonic(), result)


logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Strategy metadata registry
# ─────────────────────────────────────────────────────────────────────────────
STRATEGIES = {
    "golden_cross": {
        "id": "golden_cross",
        "name": "Golden / Death Cross",
        "description": (
            "Compares the 50-day and 200-day Simple Moving Averages. A Golden Cross "
            "(50 SMA crossing above 200 SMA) signals a long-term bullish trend; a Death Cross "
            "signals bearish. Widely followed by institutional traders."
        ),
        "category": "Trend Following",
        "parameters": {"fast_period": 50, "slow_period": 200},
        "risk_level": "Low",
        "time_horizon": "Long-term (weeks–months)",
        "best_for": "Identifying major bull/bear market cycles",
        "color": "indigo",
    },
    "rsi_mean_reversion": {
        "id": "rsi_mean_reversion",
        "name": "RSI Mean Reversion",
        "description": (
            "Uses the 14-day Relative Strength Index to identify overbought (>70) and oversold (<30) "
            "conditions. Buy when deeply oversold; sell when overbought. "
            "Works best in range-bound or consolidating markets."
        ),
        "category": "Mean Reversion",
        "parameters": {"rsi_period": 14, "oversold_threshold": 30, "overbought_threshold": 70},
        "risk_level": "Medium",
        "time_horizon": "Short-term (days–weeks)",
        "best_for": "Sideways, consolidating markets",
        "color": "violet",
    },
    "macd_momentum": {
        "id": "macd_momentum",
        "name": "MACD Momentum",
        "description": (
            "Uses MACD (12-period EMA minus 26-period EMA) crossover with a 9-period signal line. "
            "Bullish when MACD crosses above the signal line; bearish when it crosses below. "
            "Histogram expansion confirms momentum strength."
        ),
        "category": "Momentum",
        "parameters": {"fast": 12, "slow": 26, "signal_period": 9},
        "risk_level": "Medium",
        "time_horizon": "Medium-term (days–weeks)",
        "best_for": "Trending markets with clear momentum shifts",
        "color": "blue",
    },
    "bollinger_breakout": {
        "id": "bollinger_breakout",
        "name": "Bollinger Band Breakout",
        "description": (
            "Price breakouts from Bollinger Bands (20-day SMA ± 2 standard deviations). "
            "A close above the upper band signals bullish momentum; below the lower band signals "
            "a bearish breakdown. Bollinger Squeeze (narrow bands) often precedes explosive moves."
        ),
        "category": "Breakout",
        "parameters": {"period": 20, "std_dev": 2.0},
        "risk_level": "High",
        "time_horizon": "Short-term (days)",
        "best_for": "Catching breakouts after low-volatility compression",
        "color": "amber",
    },
    "ema_ribbon": {
        "id": "ema_ribbon",
        "name": "EMA Trend Ribbon",
        "description": (
            "Three Exponential Moving Averages (9, 21, 55 periods) form a 'ribbon'. "
            "A strong uptrend is confirmed when 9 EMA > 21 EMA > 55 EMA with widening spread. "
            "A compressed ribbon signals consolidation before the next move."
        ),
        "category": "Trend Following",
        "parameters": {"fast": 9, "mid": 21, "slow": 55},
        "risk_level": "Low",
        "time_horizon": "Medium-term (weeks)",
        "best_for": "Smooth trending markets; filtering whipsaws",
        "color": "emerald",
    },
    "volume_breakout": {
        "id": "volume_breakout",
        "name": "Volume Surge Breakout",
        "description": (
            "Detects unusual volume spikes (>2× 20-day average) combined with significant "
            "price movement (>2%). High volume confirms the direction of the breakout — "
            "volume + price up = institutional accumulation; volume + price down = distribution."
        ),
        "category": "Volume",
        "parameters": {"vol_multiple": 2.0, "price_change_pct": 2.0, "lookback": 20},
        "risk_level": "High",
        "time_horizon": "Short-term (days)",
        "best_for": "Catching breakouts with institutional participation",
        "color": "orange",
    },
    "donchian_breakout": {
        "id": "donchian_breakout",
        "name": "Donchian Channel (Turtle)",
        "description": (
            "Classic Turtle Trading system by Richard Dennis. Buy when price breaks above "
            "the 20-day highest high (channel breakout); sell when it breaks below the 20-day lowest low. "
            "Use the 10-day channel as the exit (stop-loss) level."
        ),
        "category": "Breakout",
        "parameters": {"entry_period": 20, "exit_period": 10},
        "risk_level": "Medium",
        "time_horizon": "Medium-term (weeks)",
        "best_for": "Trending markets; capturing sustained breakout moves",
        "color": "cyan",
    },
    "supertrend": {
        "id": "supertrend",
        "name": "Supertrend",
        "description": (
            "Combines ATR (Average True Range) with a 3× multiplier to create dynamic "
            "support/resistance levels. Price above the supertrend line = bullish; below = bearish. "
            "Trend flips generate fresh BUY/SELL signals with a built-in ATR stop-loss."
        ),
        "category": "Trend Following",
        "parameters": {"atr_period": 10, "multiplier": 3.0},
        "risk_level": "Medium",
        "time_horizon": "Medium-term (days–weeks)",
        "best_for": "Catching trend reversals with a dynamic trailing stop",
        "color": "rose",
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

_ohlcv_cache: dict[str, tuple[float, pd.DataFrame]] = {}
_OHLCV_CACHE_TTL = 300  # 5 minutes
_yf_lock = threading.Lock()


def _load_ohlcv(symbol: str, period: str = "2y") -> pd.DataFrame:
    import time

    cache_key = f"{symbol}:{period}"
    now = time.monotonic()
    if cache_key in _ohlcv_cache:
        ts, df = _ohlcv_cache[cache_key]
        if now - ts < _OHLCV_CACHE_TTL:
            return df.copy()

    ticker = _yfinance_ticker(symbol)
    try:
        with _yf_lock:
            df = yf.download(ticker, period=period, auto_adjust=True, progress=False)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.columns = [c.lower() for c in df.columns]
        df = df.dropna(subset=["close"])
        _ohlcv_cache[cache_key] = (now, df)
        return df.copy()
    except Exception as exc:
        logger.warning(f"yfinance error for {symbol}: {exc}")
        return pd.DataFrame()


def _atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    h, lo, c = df["high"], df["low"], df["close"]
    prev_c = c.shift(1)
    tr = pd.concat([h - lo, (h - prev_c).abs(), (lo - prev_c).abs()], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def _compute_supertrend(df: pd.DataFrame, atr_period: int = 10, multiplier: float = 3.0):
    """Return (supertrend Series, direction Series) computed vectorially with a single pass."""
    atr = _atr(df, atr_period)
    hl2 = (df["high"] + df["low"]) / 2
    ub_basic = (hl2 + multiplier * atr).values
    lb_basic = (hl2 - multiplier * atr).values
    close = df["close"].values.astype(float)
    n = len(df)

    final_ub = np.empty(n)
    final_lb = np.empty(n)
    direction = np.ones(n, dtype=int)
    supertrend = np.full(n, np.nan)

    final_ub[0] = ub_basic[0]
    final_lb[0] = lb_basic[0]

    for i in range(1, n):
        final_ub[i] = (
            ub_basic[i]
            if ub_basic[i] < final_ub[i - 1] or close[i - 1] > final_ub[i - 1]
            else final_ub[i - 1]
        )
        final_lb[i] = (
            lb_basic[i]
            if lb_basic[i] > final_lb[i - 1] or close[i - 1] < final_lb[i - 1]
            else final_lb[i - 1]
        )

        if np.isnan(supertrend[i - 1]):
            supertrend[i] = final_ub[i]
            direction[i] = -1
        elif supertrend[i - 1] == final_ub[i - 1]:
            if close[i] <= final_ub[i]:
                supertrend[i] = final_ub[i]
                direction[i] = -1
            else:
                supertrend[i] = final_lb[i]
                direction[i] = 1
        else:
            if close[i] >= final_lb[i]:
                supertrend[i] = final_lb[i]
                direction[i] = 1
            else:
                supertrend[i] = final_ub[i]
                direction[i] = -1

    return (
        pd.Series(supertrend, index=df.index),
        pd.Series(direction, index=df.index),
    )


def _no_data(reason: str = "Insufficient data") -> dict:
    return {
        "signal": "HOLD",
        "strength": 0.0,
        "rationale": reason,
        "entry_price": None,
        "stop_loss": None,
        "target_price": None,
        "key_metrics": {},
    }


def _stops(price: float, atr: float, signal: str):
    if signal == "BUY":
        return round(price - 2 * atr, 2), round(price + 3 * atr, 2)
    elif signal == "SELL":
        return round(price + 2 * atr, 2), round(price - 3 * atr, 2)
    return None, None


# ─────────────────────────────────────────────────────────────────────────────
# Signal generators
# ─────────────────────────────────────────────────────────────────────────────


def _signal_golden_cross(df: pd.DataFrame) -> dict:
    sma50 = df["close"].rolling(50).mean()
    sma200 = df["close"].rolling(200).mean()
    if len(df) < 201 or sma200.isna().all():
        return _no_data("Need 200+ days of data for Golden Cross")

    c50, c200 = float(sma50.iloc[-1]), float(sma200.iloc[-1])
    p50, p200 = float(sma50.iloc[-2]), float(sma200.iloc[-2])
    price = float(df["close"].iloc[-1])
    atr14 = float(_atr(df).iloc[-1])
    spread = (c50 - c200) / c200 * 100

    fresh_golden = p50 <= p200 and c50 > c200
    fresh_death = p50 >= p200 and c50 < c200

    if fresh_golden:
        sig, strength = "BUY", 0.92
        rationale = f"Fresh Golden Cross! 50 SMA ({c50:.1f}) just crossed above 200 SMA ({c200:.1f}). Major bullish reversal."
    elif fresh_death:
        sig, strength = "SELL", 0.92
        rationale = f"Fresh Death Cross! 50 SMA ({c50:.1f}) just crossed below 200 SMA ({c200:.1f}). Major bearish reversal."
    elif c50 > c200:
        strength = min(0.80, 0.40 + abs(spread) / 20)
        sig = "BUY"
        rationale = f"Golden Cross active: 50 SMA ({c50:.1f}) above 200 SMA ({c200:.1f}), spread {spread:+.2f}%."
    else:
        strength = min(0.80, 0.40 + abs(spread) / 20)
        sig = "SELL"
        rationale = f"Death Cross active: 50 SMA ({c50:.1f}) below 200 SMA ({c200:.1f}), spread {spread:+.2f}%."

    sl, tp = _stops(price, atr14, sig)
    return {
        "signal": sig,
        "strength": round(strength, 2),
        "rationale": rationale,
        "entry_price": round(price, 2),
        "stop_loss": sl,
        "target_price": tp,
        "key_metrics": {
            "sma_50": round(c50, 2),
            "sma_200": round(c200, 2),
            "spread_pct": round(spread, 2),
            "fresh_crossover": fresh_golden or fresh_death,
        },
    }


def _signal_rsi_mean_reversion(df: pd.DataFrame) -> dict:
    delta = df["close"].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - 100 / (1 + rs)
    if rsi.isna().all() or len(rsi.dropna()) < 2:
        return _no_data()

    curr = float(rsi.iloc[-1])
    prev = float(rsi.iloc[-2])
    price = float(df["close"].iloc[-1])
    atr14 = float(_atr(df).iloc[-1])

    if curr < 25:
        sig, strength = "BUY", 0.92
        rationale = f"Deeply oversold: RSI {curr:.1f} (< 25). High-conviction mean-reversion BUY."
    elif curr < 30:
        sig, strength = "BUY", 0.72
        rationale = f"Oversold: RSI {curr:.1f} (< 30). Potential bounce — look for reversal candle confirmation."
    elif curr > 75:
        sig, strength = "SELL", 0.92
        rationale = f"Extremely overbought: RSI {curr:.1f} (> 75). Strong mean-reversion SELL."
    elif curr > 70:
        sig, strength = "SELL", 0.72
        rationale = f"Overbought: RSI {curr:.1f} (> 70). Consider trimming or trailing stops."
    elif curr < 40 and curr > prev:
        sig, strength = "BUY", 0.45
        rationale = f"RSI recovering from low levels ({curr:.1f}) and trending up from {prev:.1f}."
    elif curr > 60 and curr < prev:
        sig, strength = "SELL", 0.45
        rationale = f"RSI rolling over from high levels ({curr:.1f}) from {prev:.1f}."
    else:
        sig, strength = "HOLD", 0.35
        rationale = f"RSI neutral at {curr:.1f} — no overbought/oversold extreme."

    sl, tp = _stops(price, atr14, sig)
    return {
        "signal": sig,
        "strength": round(strength, 2),
        "rationale": rationale,
        "entry_price": round(price, 2),
        "stop_loss": sl if sig != "HOLD" else None,
        "target_price": tp if sig != "HOLD" else None,
        "key_metrics": {
            "rsi": round(curr, 1),
            "rsi_prev": round(prev, 1),
            "rsi_trend": "rising" if curr > prev else "falling",
        },
    }


def _signal_macd_momentum(df: pd.DataFrame) -> dict:
    close = df["close"]
    macd = close.ewm(span=12).mean() - close.ewm(span=26).mean()
    sig_l = macd.ewm(span=9).mean()
    hist = macd - sig_l

    if len(hist.dropna()) < 2:
        return _no_data()

    cm, cs, ch = float(macd.iloc[-1]), float(sig_l.iloc[-1]), float(hist.iloc[-1])
    pm, ps, ph = float(macd.iloc[-2]), float(sig_l.iloc[-2]), float(hist.iloc[-2])
    price = float(close.iloc[-1])
    atr14 = float(_atr(df).iloc[-1])

    bull_cross = pm <= ps and cm > cs
    bear_cross = pm >= ps and cm < cs

    if bull_cross and cm < 0:
        sig, strength = "BUY", 0.88
        rationale = f"Bullish MACD crossover below zero (hist: {ch:+.3f}). Early trend reversal — high conviction."
    elif bull_cross:
        sig, strength = "BUY", 0.72
        rationale = f"Bullish MACD crossover above zero (hist: {ch:+.3f}). Momentum continuation."
    elif bear_cross and cm > 0:
        sig, strength = "SELL", 0.88
        rationale = f"Bearish MACD crossover above zero (hist: {ch:+.3f}). Momentum exhaustion."
    elif bear_cross:
        sig, strength = "SELL", 0.72
        rationale = f"Bearish MACD crossover below zero (hist: {ch:+.3f}). Downtrend continuation."
    elif cm > cs and ch > ph:
        sig, strength = "BUY", 0.52
        rationale = f"MACD above signal; histogram expanding ({ch:+.3f}). Upward momentum building."
    elif cm < cs and ch < ph:
        sig, strength = "SELL", 0.52
        rationale = (
            f"MACD below signal; histogram expanding downward ({ch:+.3f}). Selling pressure."
        )
    else:
        sig, strength = "HOLD", 0.35
        rationale = f"MACD ({cm:+.3f}) near signal line ({cs:+.3f}). No clear momentum signal."

    sl, tp = _stops(price, atr14, sig)
    return {
        "signal": sig,
        "strength": round(strength, 2),
        "rationale": rationale,
        "entry_price": round(price, 2),
        "stop_loss": sl if sig != "HOLD" else None,
        "target_price": tp if sig != "HOLD" else None,
        "key_metrics": {
            "macd": round(cm, 3),
            "signal_line": round(cs, 3),
            "histogram": round(ch, 3),
            "crossover": bull_cross or bear_cross,
        },
    }


def _signal_bollinger_breakout(df: pd.DataFrame) -> dict:
    close = df["close"]
    mid = close.rolling(20).mean()
    std = close.rolling(20).std()
    upper = mid + 2 * std
    lower = mid - 2 * std
    bw = (upper - lower) / mid  # bandwidth

    if mid.isna().all():
        return _no_data()

    price = float(close.iloc[-1])
    cup = float(upper.iloc[-1])
    clo = float(lower.iloc[-1])
    cmid = float(mid.iloc[-1])
    cbw = float(bw.iloc[-1])
    avg_bw = float(bw.rolling(50).mean().iloc[-1]) if len(bw.dropna()) >= 50 else cbw
    atr14 = float(_atr(df).iloc[-1])

    bb_pct = (price - clo) / (cup - clo) if (cup - clo) > 0 else 0.5
    squeeze = cbw < avg_bw * 0.75 if not np.isnan(avg_bw) else False

    if price > cup:
        sig, strength = "BUY", 0.82
        sq_note = " (Post-squeeze breakout!)" if squeeze else ""
        rationale = f"Price ({price:.1f}) broke above upper BB ({cup:.1f}){sq_note}. Strong bullish momentum."
    elif price < clo:
        sig, strength = "SELL", 0.82
        rationale = (
            f"Price ({price:.1f}) broke below lower BB ({clo:.1f}). Bearish breakdown confirmed."
        )
    elif bb_pct > 0.85:
        sig, strength = "BUY", 0.52
        rationale = f"Price approaching upper BB (%B = {bb_pct:.2f}). Potential breakout setup — watch closely."
    elif bb_pct < 0.15:
        sig, strength = "SELL", 0.52
        rationale = (
            f"Price approaching lower BB (%B = {bb_pct:.2f}). Potential breakdown — watch closely."
        )
    elif squeeze:
        sig, strength = "HOLD", 0.65
        rationale = f"Bollinger Squeeze: BW {cbw:.3f} vs avg {avg_bw:.3f}. Explosive move imminent — wait for direction."
    else:
        sig, strength = "HOLD", 0.30
        rationale = f"Price mid-range within BBands (%B = {bb_pct:.2f}). No breakout signal."

    sl, tp = _stops(price, atr14, sig)
    return {
        "signal": sig,
        "strength": round(strength, 2),
        "rationale": rationale,
        "entry_price": round(price, 2),
        "stop_loss": sl if sig != "HOLD" else None,
        "target_price": tp if sig != "HOLD" else None,
        "key_metrics": {
            "upper_band": round(cup, 2),
            "lower_band": round(clo, 2),
            "middle_band": round(cmid, 2),
            "bb_pct_b": round(bb_pct, 3),
            "bandwidth": round(cbw, 3),
            "squeeze": squeeze,
        },
    }


def _signal_ema_ribbon(df: pd.DataFrame) -> dict:
    close = df["close"]
    e9 = close.ewm(span=9).mean()
    e21 = close.ewm(span=21).mean()
    e55 = close.ewm(span=55).mean()

    v9, v21, v55 = float(e9.iloc[-1]), float(e21.iloc[-1]), float(e55.iloc[-1])
    price = float(close.iloc[-1])
    atr14 = float(_atr(df).iloc[-1])
    spread = (v9 - v55) / v55 * 100

    if v9 > v21 > v55 and spread > 1.5:
        sig, strength = "BUY", 0.88
        rationale = f"Strong EMA ribbon uptrend: 9({v9:.1f}) > 21({v21:.1f}) > 55({v55:.1f}). Spread {spread:+.2f}%."
    elif v9 > v21 > v55:
        sig, strength = "BUY", 0.62
        rationale = (
            f"EMA ribbon bullish but tight ({spread:+.2f}%). Early uptrend — momentum building."
        )
    elif v9 < v21 < v55 and abs(spread) > 1.5:
        sig, strength = "SELL", 0.88
        rationale = f"Strong EMA ribbon downtrend: 9({v9:.1f}) < 21({v21:.1f}) < 55({v55:.1f}). Spread {spread:+.2f}%."
    elif v9 < v21 < v55:
        sig, strength = "SELL", 0.62
        rationale = f"EMA ribbon bearish but tight ({spread:+.2f}%). Early downtrend."
    elif v9 > v55:
        sig, strength = "BUY", 0.42
        rationale = (
            "Partially bullish: 9 EMA above 55 EMA, but 21 EMA misaligned. Transition in progress."
        )
    else:
        sig, strength = "HOLD", 0.30
        rationale = (
            f"EMA ribbon compressed/mixed (spread {spread:+.2f}%). No clear trend direction."
        )

    sl = round(v21 - atr14, 2) if sig == "BUY" else round(v21 + atr14, 2)
    tp = round(price + 3 * atr14, 2) if sig == "BUY" else round(price - 3 * atr14, 2)
    return {
        "signal": sig,
        "strength": round(strength, 2),
        "rationale": rationale,
        "entry_price": round(price, 2),
        "stop_loss": sl if sig != "HOLD" else None,
        "target_price": tp if sig != "HOLD" else None,
        "key_metrics": {
            "ema_9": round(v9, 2),
            "ema_21": round(v21, 2),
            "ema_55": round(v55, 2),
            "ribbon_spread_pct": round(spread, 2),
            "alignment": "bullish" if v9 > v21 > v55 else "bearish" if v9 < v21 < v55 else "mixed",
        },
    }


def _signal_volume_breakout(df: pd.DataFrame) -> dict:
    close = df["close"]
    volume = df["volume"]
    avg_vol = volume.rolling(20).mean()
    vol_ratio = volume / avg_vol
    chg_pct = close.pct_change() * 100

    if vol_ratio.isna().all():
        return _no_data()

    cvr = float(vol_ratio.iloc[-1])
    cchg = float(chg_pct.iloc[-1])
    price = float(close.iloc[-1])
    atr14 = float(_atr(df).iloc[-1])
    avg_v = float(avg_vol.iloc[-1])
    cur_v = float(volume.iloc[-1])
    recent_surge = float(vol_ratio.iloc[-3:].max())
    recent_chg = float(chg_pct.iloc[-3:].sum())

    if cvr >= 2.0 and cchg >= 2.0:
        sig, strength = "BUY", min(0.95, 0.62 + cvr * 0.04)
        rationale = (
            f"Volume surge TODAY: {cvr:.1f}× avg with +{cchg:.1f}% price move. Strong accumulation."
        )
    elif cvr >= 2.0 and cchg <= -2.0:
        sig, strength = "SELL", min(0.95, 0.62 + cvr * 0.04)
        rationale = (
            f"Volume surge TODAY: {cvr:.1f}× avg with {cchg:.1f}% price drop. Heavy distribution."
        )
    elif recent_surge >= 2.0 and recent_chg >= 3.0:
        sig, strength = "BUY", 0.62
        rationale = f"Recent volume surge ({recent_surge:.1f}× avg, +{recent_chg:.1f}% 3-day). Post-breakout continuation."
    elif recent_surge >= 2.0 and recent_chg <= -3.0:
        sig, strength = "SELL", 0.62
        rationale = f"Recent volume surge ({recent_surge:.1f}× avg, {recent_chg:.1f}% 3-day). Selling pressure sustained."
    elif cvr >= 1.5 and cchg >= 1.0:
        sig, strength = "BUY", 0.45
        rationale = f"Elevated volume ({cvr:.1f}× avg) with modest gain. Monitor for continuation."
    else:
        sig, strength = "HOLD", 0.25
        rationale = f"No significant volume event (today: {cvr:.1f}× avg, price: {cchg:+.1f}%). Waiting for breakout."

    sl, tp = _stops(price, atr14, sig)
    return {
        "signal": sig,
        "strength": round(strength, 2),
        "rationale": rationale,
        "entry_price": round(price, 2),
        "stop_loss": sl if sig != "HOLD" else None,
        "target_price": tp if sig != "HOLD" else None,
        "key_metrics": {
            "volume_ratio": round(cvr, 2),
            "avg_volume_20d": int(avg_v),
            "today_volume": int(cur_v),
            "price_change_pct": round(cchg, 2),
        },
    }


def _signal_donchian_breakout(df: pd.DataFrame) -> dict:
    high, low, close = df["high"], df["low"], df["close"]
    h20 = high.rolling(20).max().shift(1)
    l20 = low.rolling(20).min().shift(1)
    h10 = high.rolling(10).max().shift(1)
    l10 = low.rolling(10).min().shift(1)

    if h20.isna().all():
        return _no_data()

    price = float(close.iloc[-1])
    ch20 = float(h20.iloc[-1])
    cl20 = float(l20.iloc[-1])
    ch10 = float(h10.iloc[-1]) if not pd.isna(h10.iloc[-1]) else ch20
    cl10 = float(l10.iloc[-1]) if not pd.isna(l10.iloc[-1]) else cl20
    atr14 = float(_atr(df).iloc[-1])
    width = (ch20 - cl20) / cl20 * 100
    pos = (price - cl20) / (ch20 - cl20) * 100 if (ch20 - cl20) > 0 else 50

    if price > ch20:
        sig, strength = "BUY", 0.82
        rationale = f"Donchian breakout: price ({price:.1f}) above 20-day high ({ch20:.1f}). Turtle buy signal!"
    elif price < cl20:
        sig, strength = "SELL", 0.82
        rationale = f"Donchian breakdown: price ({price:.1f}) below 20-day low ({cl20:.1f}). Turtle sell signal!"
    elif pos > 75:
        sig, strength = "BUY", 0.52
        rationale = f"Price at {pos:.0f}% of channel, approaching 20-day high ({ch20:.1f}). Breakout setup forming."
    elif pos < 25:
        sig, strength = "SELL", 0.52
        rationale = (
            f"Price at {pos:.0f}% of channel, near 20-day low ({cl20:.1f}). Watch for breakdown."
        )
    else:
        sig, strength = "HOLD", 0.30
        rationale = f"Price mid-channel ({pos:.0f}%). Range {cl20:.1f}–{ch20:.1f} (width {width:.1f}%). Awaiting breakout."

    stop = cl10 if sig == "BUY" else ch10
    tp = round(price + 3 * atr14, 2) if sig == "BUY" else round(price - 3 * atr14, 2)
    return {
        "signal": sig,
        "strength": round(strength, 2),
        "rationale": rationale,
        "entry_price": round(price, 2),
        "stop_loss": round(stop, 2) if sig != "HOLD" else None,
        "target_price": tp if sig != "HOLD" else None,
        "key_metrics": {
            "high_20d": round(ch20, 2),
            "low_20d": round(cl20, 2),
            "exit_high_10d": round(ch10, 2),
            "exit_low_10d": round(cl10, 2),
            "channel_width_pct": round(width, 2),
            "position_in_channel_pct": round(pos, 1),
        },
    }


def _signal_supertrend(df: pd.DataFrame) -> dict:
    if len(df) < 20:
        return _no_data()

    supertrend, direction = _compute_supertrend(df)
    close = df["close"]

    curr_dir = int(direction.iloc[-1])
    prev_dir = int(direction.iloc[-2])
    curr_st = float(supertrend.iloc[-1])
    price = float(close.iloc[-1])
    atr14 = float(_atr(df).iloc[-1])

    days_in = 0
    for d in direction.iloc[::-1]:
        if int(d) == curr_dir:
            days_in += 1
        else:
            break

    flip = prev_dir != curr_dir
    dist = (price - curr_st) / curr_st * 100

    if curr_dir == 1 and flip:
        sig, strength = "BUY", 0.92
        rationale = f"Supertrend FLIP to bullish! Price ({price:.1f}) crossed above supertrend ({curr_st:.1f}). Fresh uptrend."
    elif curr_dir == 1:
        strength = min(0.82, 0.50 + days_in * 0.01)
        sig = "BUY"
        rationale = f"Supertrend bullish {days_in} days. Price {dist:.1f}% above dynamic support ({curr_st:.1f})."
    elif curr_dir == -1 and flip:
        sig, strength = "SELL", 0.92
        rationale = f"Supertrend FLIP to bearish! Price ({price:.1f}) crossed below supertrend ({curr_st:.1f}). Fresh downtrend."
    else:
        strength = min(0.82, 0.50 + days_in * 0.01)
        sig = "SELL"
        rationale = f"Supertrend bearish {days_in} days. Price {dist:.1f}% below dynamic resistance ({curr_st:.1f})."

    return {
        "signal": sig,
        "strength": round(strength, 2),
        "rationale": rationale,
        "entry_price": round(price, 2),
        "stop_loss": round(curr_st, 2),
        "target_price": round(price + 3 * atr14, 2)
        if sig == "BUY"
        else round(price - 3 * atr14, 2),
        "key_metrics": {
            "supertrend_level": round(curr_st, 2),
            "direction": "bullish" if curr_dir == 1 else "bearish",
            "days_in_trend": days_in,
            "fresh_flip": flip,
            "distance_pct": round(dist, 2),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Dispatcher
# ─────────────────────────────────────────────────────────────────────────────

_SIGNAL_FNS = {
    "golden_cross": _signal_golden_cross,
    "rsi_mean_reversion": _signal_rsi_mean_reversion,
    "macd_momentum": _signal_macd_momentum,
    "bollinger_breakout": _signal_bollinger_breakout,
    "ema_ribbon": _signal_ema_ribbon,
    "volume_breakout": _signal_volume_breakout,
    "donchian_breakout": _signal_donchian_breakout,
    "supertrend": _signal_supertrend,
}


def generate_signal(symbol: str, strategy_id: str) -> dict:
    """Generate a real-time trading signal for a symbol (NSE, BSE, or NASDAQ)."""
    if strategy_id not in _SIGNAL_FNS:
        return {"error": f"Unknown strategy: {strategy_id}"}
    df = _load_ohlcv(symbol)
    if df.empty or len(df) < 60:
        result = _no_data("Insufficient price history for this symbol.")
    else:
        result = _SIGNAL_FNS[strategy_id](df)
    result["symbol"] = symbol
    result["last_close"] = round(float(df["close"].iloc[-1]), 2) if not df.empty else None
    result["last_updated"] = datetime.now(timezone.utc).isoformat()
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Vectorized signal series (for backtest — compute once, walk through)
# ─────────────────────────────────────────────────────────────────────────────


def _signal_series(df: pd.DataFrame, strategy_id: str, params: dict | None = None) -> pd.Series:
    """Return a daily BUY/SELL/HOLD series for the whole dataframe.

    ``params`` allows overriding default strategy parameters, e.g.
    {"fast_period": 20, "slow_period": 100} for golden_cross.
    """
    p = params or {}
    close = df["close"]
    sig = pd.Series("HOLD", index=df.index)

    if strategy_id == "golden_cross":
        fast = int(p.get("fast_period", 50))
        slow = int(p.get("slow_period", 200))
        sma_fast = close.rolling(fast).mean()
        sma_slow = close.rolling(slow).mean()
        sig[sma_fast > sma_slow] = "BUY"
        sig[sma_fast < sma_slow] = "SELL"

    elif strategy_id == "rsi_mean_reversion":
        rsi_period = int(p.get("rsi_period", 14))
        oversold = p.get("rsi_oversold", 30)
        overbought = p.get("rsi_overbought", 70)
        delta = close.diff()
        rsi = 100 - 100 / (
            1
            + delta.clip(lower=0).rolling(rsi_period).mean()
            / (-delta.clip(upper=0)).rolling(rsi_period).mean().replace(0, np.nan)
        )
        sig[rsi < oversold] = "BUY"
        sig[rsi > overbought] = "SELL"

    elif strategy_id == "macd_momentum":
        fast = int(p.get("fast", 12))
        slow = int(p.get("slow", 26))
        signal_p = int(p.get("signal", 9))
        macd = close.ewm(span=fast).mean() - close.ewm(span=slow).mean()
        signal_l = macd.ewm(span=signal_p).mean()
        sig[macd > signal_l] = "BUY"
        sig[macd < signal_l] = "SELL"

    elif strategy_id == "bollinger_breakout":
        bb_period = int(p.get("bb_period", 20))
        bb_std = p.get("bb_std", 2.0)
        mid = close.rolling(bb_period).mean()
        std = close.rolling(bb_period).std()
        sig[close > mid + bb_std * std] = "BUY"
        sig[close < mid - bb_std * std] = "SELL"

    elif strategy_id == "ema_ribbon":
        e9 = close.ewm(span=int(p.get("fast", 9))).mean()
        e21 = close.ewm(span=int(p.get("mid", 21))).mean()
        e55 = close.ewm(span=int(p.get("slow", 55))).mean()
        sig[(e9 > e21) & (e21 > e55)] = "BUY"
        sig[(e9 < e21) & (e21 < e55)] = "SELL"

    elif strategy_id == "volume_breakout":
        vol_mult = p.get("vol_multiple", 2.0)
        pchg = p.get("price_change_pct", 2.0)
        lookback = int(p.get("lookback", 20))
        avg_vol = df["volume"].rolling(lookback).mean()
        vr = df["volume"] / avg_vol
        chg = close.pct_change() * 100
        sig[(vr >= vol_mult) & (chg >= pchg)] = "BUY"
        sig[(vr >= vol_mult) & (chg <= -pchg)] = "SELL"

    elif strategy_id == "donchian_breakout":
        entry_p = int(p.get("entry_period", 20))
        h20 = df["high"].rolling(entry_p).max().shift(1)
        l20 = df["low"].rolling(entry_p).min().shift(1)
        sig[close > h20] = "BUY"
        sig[close < l20] = "SELL"

    elif strategy_id == "supertrend":
        atr_p = int(p.get("atr_period", 10))
        mult = p.get("multiplier", 3.0)
        _, direction = _compute_supertrend(df, atr_period=atr_p, multiplier=mult)
        sig[direction == 1] = "BUY"
        sig[direction == -1] = "SELL"

    return sig


# ─────────────────────────────────────────────────────────────────────────────
# Backtest
# ─────────────────────────────────────────────────────────────────────────────


def backtest_strategy(
    symbol: str,
    strategy_id: str,
    lookback_days: int = 365,
    start_date: str | None = None,
    end_date: str | None = None,
    params: dict | None = None,
    include_costs: bool = True,
) -> dict:
    """
    Vectorized backtest: precompute full signal series, then simulate trades.
    Enter on BUY signal; exit on first SELL signal.

    Parameters
    ----------
    start_date / end_date : explicit date range (overrides lookback_days)
    params : strategy parameter overrides (passed to _signal_series)
    include_costs : whether to apply market transaction costs
    """
    if strategy_id not in _SIGNAL_FNS:
        return {"error": f"Unknown strategy: {strategy_id}"}

    exchange = exchange_for_symbol(symbol)

    # ── Cache lookup ──────────────────────────────────────────────────────
    ck = _cache_key(symbol, strategy_id, lookback_days, start_date, end_date, params, include_costs)
    cached = _cache_get(ck)
    if cached is not None:
        return cached

    df = _load_ohlcv(symbol, period="3y")
    if df.empty or len(df) < 250:
        return {"error": "Need 2+ years of data for a meaningful backtest."}

    # ── Date range filtering ──────────────────────────────────────────────
    if start_date and end_date:
        mask = (df.index >= start_date) & (df.index <= end_date)
        df_bt = df.loc[mask].copy()
        if df_bt.empty or len(df_bt) < 20:
            return {"error": f"Not enough data between {start_date} and {end_date}."}
        effective_days = len(df_bt)
    else:
        df_bt = df.iloc[-lookback_days:].copy()
        effective_days = lookback_days

    signals = _signal_series(df_bt, strategy_id, params)

    trades = []
    in_position = False
    entry_price = 0.0
    entry_date = None
    equity = 100_000.0
    peak_equity = equity
    max_drawdown = 0.0
    equity_curve = []
    total_costs = 0.0

    for i in range(len(df_bt)):
        price = float(df_bt["close"].iloc[i])
        date = df_bt.index[i]
        sig = signals.iloc[i]

        if sig == "BUY" and not in_position:
            in_position = True
            entry_price = price
            entry_date = date
            # Apply buy-side transaction costs
            if include_costs:
                shares = int(equity / price)
                cost = calculate_transaction_cost(price, shares, "buy", exchange)
                equity -= cost
                total_costs += cost
        elif sig == "SELL" and in_position:
            ret = (price - entry_price) / entry_price
            pnl = equity * ret
            equity += pnl
            # Apply sell-side transaction costs
            if include_costs:
                shares = int((equity) / price)  # approximate shares held
                cost = calculate_transaction_cost(price, max(shares, 1), "sell", exchange)
                equity -= cost
                total_costs += cost
            trades.append(
                {
                    "entry_date": str(entry_date.date()),
                    "exit_date": str(date.date()),
                    "entry_price": round(entry_price, 2),
                    "exit_price": round(price, 2),
                    "return_pct": round(ret * 100, 2),
                    "pnl": round(pnl, 2),
                    "result": "WIN" if ret > 0 else "LOSS",
                }
            )
            in_position = False

        portfolio_val = equity
        if in_position:
            unrealized_ret = (price - entry_price) / entry_price
            portfolio_val = equity * (1 + unrealized_ret)

        peak_equity = max(peak_equity, portfolio_val)
        drawdown = (peak_equity - portfolio_val) / peak_equity * 100
        max_drawdown = max(max_drawdown, drawdown)
        equity_curve.append(round(portfolio_val, 2))

    if in_position:
        last_price = float(df_bt["close"].iloc[-1])
        ret = (last_price - entry_price) / entry_price
        pnl = equity * ret
        equity += pnl
        trades.append(
            {
                "entry_date": str(entry_date.date()),
                "exit_date": "open",
                "entry_price": round(entry_price, 2),
                "exit_price": round(last_price, 2),
                "return_pct": round(ret * 100, 2),
                "pnl": round(pnl, 2),
                "result": "OPEN",
            }
        )

    total = len(trades)
    winning = sum(1 for t in trades if t["result"] == "WIN")
    total_return = (equity - 100_000) / 100_000 * 100

    eq_s = pd.Series(equity_curve)
    dr = eq_s.pct_change().dropna()
    sharpe = float(dr.mean() / dr.std() * np.sqrt(252)) if len(dr) > 1 and dr.std() > 0 else 0.0

    bh_start = float(df_bt["close"].iloc[0])
    bh_end = float(df_bt["close"].iloc[-1])
    bh_return = (bh_end - bh_start) / bh_start * 100

    result = {
        "symbol": symbol,
        "strategy_id": strategy_id,
        "period_days": effective_days,
        "total_trades": total,
        "winning_trades": winning,
        "losing_trades": total - winning,
        "win_rate": round(winning / total * 100, 1) if total > 0 else 0,
        "total_return_pct": round(total_return, 2),
        "max_drawdown_pct": round(max_drawdown, 2),
        "sharpe_ratio": round(sharpe, 2),
        "buy_and_hold_return_pct": round(bh_return, 2),
        "final_equity": round(equity, 2),
        "equity_curve": equity_curve[::5]
        + ([equity_curve[-1]] if len(equity_curve) % 5 != 1 else []),
        "trades": trades[-15:],
        "total_transaction_costs": round(total_costs, 2),
    }

    _cache_set(ck, result)
    return result
