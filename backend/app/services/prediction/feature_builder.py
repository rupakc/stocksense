"""
Feature builder for the stock prediction pipeline.

Assembles a daily-frequency training matrix by merging four signal layers:

  1. Candlestick / OHLCV features
       candle_body, candle_range, upper_shadow, lower_shadow,
       gap (overnight), doji_flag, typical_price_return,
       vwap_ratio, volume_momentum, hl_pct_of_52w_high

  2. Technical indicators (price-derived)
       rsi_14, macd_diff, bb_width, bb_position,
       return_1d / 5d / 20d, atr_14, cci_20,
       stoch_k, williams_r, mfi_14, obv_pct_change,
       volume_ratio, adx_14, ema_cross_9_21, roc_10,
       ad_pct_change, ichimoku_base_pct

  3. News sentiment
       sentiment_7d, sentiment_30d, sentiment_momentum, news_volume_7d

  4. Macro / economic signals
       usd_inr, crude_oil, gold, india_vix, us_10y, dxy,
       nifty_return_1d, nifty_return_5d,
       niftybank_return_1d, copper, silver

All features are z-score normalised using training-set statistics.
Scaler stats are stored on the FeatureBuilder instance so the same
transform is applied to the future dataframe at inference time.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import ta
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import NewsArticle, StockPrice

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Macro tickers — exchange-specific
# ---------------------------------------------------------------------------
INDIAN_MACRO_TICKERS: dict[str, str] = {
    "usd_inr":    "USDINR=X",   # Rupee — primary FX risk for Indian equities
    "crude_oil":  "CL=F",       # WTI crude — energy costs / inflation
    "gold":       "GC=F",       # Safe-haven demand
    "silver":     "SI=F",       # Industrial + precious metal hybrid signal
    "copper":     "HG=F",       # Dr. Copper — leading economic activity proxy
    "nifty50":    "^NSEI",      # Broad market beta
    "niftybank":  "^NSEBANK",   # Banking sector beta (rate-sensitive)
    "india_vix":  "^INDIAVIX",  # Indian equity volatility
    "us_10y":     "^TNX",       # Global risk-free rate / liquidity
    "dxy":        "DX-Y.NYB",   # USD index — global risk appetite
}

US_MACRO_TICKERS: dict[str, str] = {
    "eur_usd":    "EURUSD=X",   # Euro/USD — FX risk for US equities
    "crude_oil":  "CL=F",       # WTI crude — energy costs / inflation
    "gold":       "GC=F",       # Safe-haven demand
    "silver":     "SI=F",       # Industrial + precious metal hybrid signal
    "copper":     "HG=F",       # Dr. Copper — leading economic activity proxy
    "sp500":      "^GSPC",      # Broad market beta (S&P 500)
    "nasdaq100":  "^NDX",       # Tech-heavy market beta
    "vix":        "^VIX",       # US equity volatility (fear gauge)
    "us_10y":     "^TNX",       # Risk-free rate / liquidity
    "dxy":        "DX-Y.NYB",   # USD index — global risk appetite
}

MACRO_TICKERS = INDIAN_MACRO_TICKERS


def _macro_tickers_for_symbol(symbol: str) -> dict[str, str]:
    if symbol.endswith((".NS", ".BO")):
        return INDIAN_MACRO_TICKERS
    return US_MACRO_TICKERS

# Candlestick features use last-5d median for future extrapolation
_CANDLE_FEATURES = {
    "candle_body", "candle_range", "upper_shadow", "lower_shadow",
    "gap", "doji_flag", "typical_price_return", "vwap_ratio",
    "volume_momentum", "hl_pct_52w_high",
}


class FeatureBuilder:
    """Builds and normalises the full feature matrix for a given symbol."""

    def __init__(self) -> None:
        self._scaler_stats: dict[str, tuple[float, float]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def build(self, symbol: str, db: AsyncSession) -> pd.DataFrame:
        """Return a merged, normalised daily DataFrame ready for Prophet."""
        price_df = await self._load_price_features(symbol, db)
        if price_df.empty:
            return pd.DataFrame()

        sentiment_df = await self._load_sentiment_features(symbol, db, price_df["ds"])
        macro_tickers = _macro_tickers_for_symbol(symbol)
        macro_df = self._load_macro_features(price_df["ds"], macro_tickers)

        df = price_df.copy()

        if not sentiment_df.empty:
            df = df.merge(sentiment_df, on="ds", how="left")
            for col in [c for c in sentiment_df.columns if c != "ds"]:
                df[col] = df[col].fillna(0.0)
        else:
            df["sentiment_7d"] = 0.0
            df["sentiment_30d"] = 0.0
            df["sentiment_momentum"] = 0.0
            df["news_volume_7d"] = 0.0

        if not macro_df.empty:
            df = df.merge(macro_df, on="ds", how="left")
            for col in [c for c in macro_df.columns if c != "ds"]:
                df[col] = df[col].ffill().bfill()
        else:
            for col in macro_tickers:
                df[col] = 0.0

        feature_cols = self._feature_columns(df)
        df = self._normalise(df, feature_cols, fit=True)
        df = df.dropna(subset=["y"])

        logger.info(
            f"[FeatureBuilder] {symbol}: {len(df)} rows, "
            f"{len(feature_cols)} features: {feature_cols}"
        )
        return df

    def get_future_features(self, train_df: pd.DataFrame, horizon_days: int) -> pd.DataFrame:
        """Create a future DataFrame with extrapolated feature values."""
        last_date = train_df["ds"].max()
        future_dates = pd.bdate_range(start=last_date + timedelta(days=1), periods=horizon_days)
        future = pd.DataFrame({"ds": future_dates})

        tail5 = train_df.tail(5)
        feature_cols = self._feature_columns(train_df)

        for col in feature_cols:
            if col.startswith("sentiment") or col.startswith("news_"):
                future[col] = 0.0          # future news is unknowable → neutral
            elif col in ("volume_ratio", "volume_momentum", "obv_pct_change",
                         "ad_pct_change"):
                future[col] = 0.0          # volume: assume average
            elif col == "gap":
                future[col] = 0.0          # no overnight gap expected
            elif col == "doji_flag":
                future[col] = 0.0
            else:
                # Candlestick body/range/shadows + macro + technical: recent median
                future[col] = float(tail5[col].median()) if col in tail5 else 0.0

        return pd.concat([train_df[["ds"] + feature_cols], future], ignore_index=True)

    # ------------------------------------------------------------------
    # Private: OHLCV + candlestick + technical features
    # ------------------------------------------------------------------

    async def _load_price_features(self, symbol: str, db: AsyncSession) -> pd.DataFrame:
        cutoff = datetime.now(timezone.utc) - timedelta(days=3 * 365)
        result = await db.execute(
            select(StockPrice)
            .where(StockPrice.symbol == symbol, StockPrice.timestamp_utc >= cutoff)
            .order_by(StockPrice.timestamp_utc)
        )
        rows = result.scalars().all()
        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame([{
            "ds":     r.timestamp_utc,
            "y":      r.close,
            "open":   r.open,
            "high":   r.high,
            "low":    r.low,
            "close":  r.close,
            "volume": r.volume,
        } for r in rows])
        df["ds"] = pd.to_datetime(df["ds"]).dt.tz_localize(None)
        df = df.sort_values("ds").reset_index(drop=True)

        o = df["open"].astype(float)
        h = df["high"].astype(float)
        l = df["low"].astype(float)
        c = df["close"].astype(float)
        v = df["volume"].astype(float)
        hl_range = (h - l).replace(0, np.nan)  # avoid div-by-zero on HL range

        # ── Candlestick body & shadow features ─────────────────────────
        df["candle_body"]    = (c - o) / (c + 1e-9)              # +ve = bullish day
        df["candle_range"]   = (h - l) / (c + 1e-9)              # intraday volatility
        upper_wick           = h - pd.concat([o, c], axis=1).max(axis=1)
        lower_wick           = pd.concat([o, c], axis=1).min(axis=1) - l
        df["upper_shadow"]   = upper_wick / (hl_range + 1e-9)    # bearish rejection
        df["lower_shadow"]   = lower_wick / (hl_range + 1e-9)    # bullish reversal
        df["doji_flag"]      = ((df["candle_body"].abs() < 0.003)).astype(float)  # indecision
        df["gap"]            = (o - c.shift(1)) / (c.shift(1) + 1e-9)  # overnight gap

        # ── Typical price & VWAP ───────────────────────────────────────
        typical = (h + l + c) / 3
        df["typical_price_return"] = typical.pct_change(1)
        tp_vol   = (typical * v).rolling(20).sum()
        vol_sum  = v.rolling(20).sum()
        vwap_20  = tp_vol / (vol_sum + 1e-9)
        df["vwap_ratio"] = c / (vwap_20 + 1e-9) - 1              # +ve = above VWAP

        # ── 52-week high proximity ─────────────────────────────────────
        rolling_high_52w = h.rolling(252, min_periods=20).max()
        df["hl_pct_52w_high"] = (c - rolling_high_52w) / (rolling_high_52w + 1e-9)

        # ── Volume signals ─────────────────────────────────────────────
        vol_sma20 = v.rolling(20).mean()
        df["volume_ratio"]    = v / (vol_sma20 + 1e-9)
        df["volume_momentum"] = v.pct_change(5)                   # 5-day volume trend

        # ── OBV (On-Balance Volume) trend ──────────────────────────────
        obv = ta.volume.OnBalanceVolumeIndicator(c, v).on_balance_volume()
        df["obv_pct_change"]  = obv.pct_change(5).replace([np.inf, -np.inf], 0).fillna(0)

        # ── MFI (Money Flow Index — volume-weighted RSI) ───────────────
        df["mfi_14"] = ta.volume.MFIIndicator(
            high=h, low=l, close=c, volume=v, window=14
        ).money_flow_index()

        # ── Momentum / trend ───────────────────────────────────────────
        df["rsi_14"]    = ta.momentum.rsi(c, window=14)
        df["return_1d"] = c.pct_change(1)
        df["return_5d"] = c.pct_change(5)
        df["return_20d"] = c.pct_change(20)

        macd_obj         = ta.trend.MACD(c)
        df["macd_diff"]  = macd_obj.macd_diff()

        # ── Volatility bands ───────────────────────────────────────────
        bb             = ta.volatility.BollingerBands(c)
        bb_upper       = bb.bollinger_hband()
        bb_lower       = bb.bollinger_lband()
        bb_mid         = bb.bollinger_mavg()
        df["bb_width"]    = (bb_upper - bb_lower) / (bb_mid + 1e-9)
        df["bb_position"] = (c - bb_lower) / (bb_upper - bb_lower + 1e-9)

        # ── ATR (Average True Range) ───────────────────────────────────
        df["atr_14"] = ta.volatility.AverageTrueRange(
            high=h, low=l, close=c, window=14
        ).average_true_range() / (c + 1e-9)   # normalise as % of price

        # ── CCI (Commodity Channel Index) ──────────────────────────────
        df["cci_20"] = ta.trend.CCIIndicator(
            high=h, low=l, close=c, window=20
        ).cci()

        # ── Stochastic %K ──────────────────────────────────────────────
        stoch = ta.momentum.StochasticOscillator(
            high=h, low=l, close=c, window=14
        )
        df["stoch_k"] = stoch.stoch()

        # ── Williams %R ────────────────────────────────────────────────
        df["williams_r"] = ta.momentum.WilliamsRIndicator(
            high=h, low=l, close=c, lbp=14
        ).williams_r()

        # ── ADX (Average Directional Index) — trend strength ──────────
        df["adx_14"] = ta.trend.ADXIndicator(
            high=h, low=l, close=c, window=14
        ).adx()

        # ── EMA crossover signal (9/21) — short-term trend direction ──
        ema_9 = c.ewm(span=9, adjust=False).mean()
        ema_21 = c.ewm(span=21, adjust=False).mean()
        df["ema_cross_9_21"] = (ema_9 - ema_21) / (c + 1e-9)

        # ── Rate of Change (10-day) — fast momentum signal ─────────────
        df["roc_10"] = ta.momentum.ROCIndicator(
            close=c, window=10
        ).roc()

        # ── Accumulation/Distribution pct change — smart money flow ────
        ad_line = ta.volume.AccDistIndexIndicator(
            high=h, low=l, close=c, volume=v
        ).acc_dist_index()
        df["ad_pct_change"] = ad_line.pct_change(5).replace([np.inf, -np.inf], 0).fillna(0)

        # ── Ichimoku base line position — equilibrium proximity ────────
        ichimoku_high_9 = h.rolling(9, min_periods=1).max()
        ichimoku_low_9 = l.rolling(9, min_periods=1).min()
        ichimoku_high_26 = h.rolling(26, min_periods=1).max()
        ichimoku_low_26 = l.rolling(26, min_periods=1).min()
        base_line = (ichimoku_high_26 + ichimoku_low_26) / 2
        df["ichimoku_base_pct"] = (c - base_line) / (c + 1e-9)

        return df

    # ------------------------------------------------------------------
    # Private: news sentiment features
    # ------------------------------------------------------------------

    async def _load_sentiment_features(
        self, symbol: str, db: AsyncSession, date_index: pd.Series
    ) -> pd.DataFrame:
        base = symbol.replace(".NS", "").replace(".BO", "").lower()
        since = date_index.min() - timedelta(days=35)

        result = await db.execute(
            select(NewsArticle.published_at, NewsArticle.sentiment_compound)
            .where(
                NewsArticle.published_at >= since,
                NewsArticle.sentiment_compound.is_not(None),
                NewsArticle.title.ilike(f"%{base}%")
                | NewsArticle.summary.ilike(f"%{base}%"),
            )
            .order_by(NewsArticle.published_at)
        )
        rows = result.all()
        if not rows:
            return pd.DataFrame()

        news_df = pd.DataFrame([
            {"date": r.published_at.replace(tzinfo=None).date(), "compound": r.sentiment_compound}
            for r in rows
        ])
        daily = (
            news_df.groupby("date")
            .agg(avg_sentiment=("compound", "mean"), count=("compound", "count"))
            .reset_index()
        )
        daily["ds"] = pd.to_datetime(daily["date"])

        full_idx = pd.DataFrame({"ds": pd.to_datetime(date_index)})
        daily = full_idx.merge(daily[["ds", "avg_sentiment", "count"]], on="ds", how="left")
        daily["avg_sentiment"] = daily["avg_sentiment"].ffill().fillna(0.0)
        daily["count"] = daily["count"].fillna(0.0)

        daily["sentiment_7d"]       = daily["avg_sentiment"].rolling(7,  min_periods=1).mean()
        daily["sentiment_30d"]      = daily["avg_sentiment"].rolling(30, min_periods=1).mean()
        daily["sentiment_momentum"] = daily["sentiment_7d"] - daily["sentiment_7d"].shift(3).fillna(0)
        daily["news_volume_7d"]     = daily["count"].rolling(7, min_periods=1).sum()

        return daily[["ds", "sentiment_7d", "sentiment_30d", "sentiment_momentum", "news_volume_7d"]]

    # ------------------------------------------------------------------
    # Private: macro / economic features
    # ------------------------------------------------------------------

    def _load_macro_features(self, date_index: pd.Series,
                             macro_tickers: dict[str, str] | None = None) -> pd.DataFrame:
        tickers = macro_tickers or MACRO_TICKERS
        start = (date_index.min() - timedelta(days=10)).strftime("%Y-%m-%d")
        end   = (date_index.max() + timedelta(days=5)).strftime("%Y-%m-%d")

        tickers_str = " ".join(tickers.values())
        macro_series: dict[str, pd.Series] = {}
        try:
            raw = yf.download(
                tickers_str, start=start, end=end, progress=False,
                auto_adjust=True, group_by="ticker", threads=True,
            )
            for name, ticker in tickers.items():
                try:
                    if len(tickers) == 1:
                        col = raw["Close"]
                    else:
                        col = raw[ticker]["Close"]
                    s = col.squeeze().dropna()
                    if s.empty:
                        continue
                    s.index = pd.to_datetime(s.index).tz_localize(None)
                    s.name = name
                    macro_series[name] = s
                except (KeyError, TypeError):
                    logger.warning(f"[FeatureBuilder] Missing macro data for {ticker}")
        except Exception as exc:
            logger.warning(f"[FeatureBuilder] Batch macro download failed: {exc}")

        if not macro_series:
            return pd.DataFrame()

        macro_df = pd.DataFrame(macro_series)
        macro_df.index.name = "ds"
        macro_df = macro_df.reset_index()

        full_idx = pd.DataFrame({"ds": pd.to_datetime(date_index)})
        macro_df = full_idx.merge(macro_df, on="ds", how="left")

        for col in macro_series:
            macro_df[col] = macro_df[col].ffill().bfill()

        # Convert index levels to returns to remove scale/unit dependency
        for idx_col in ("nifty50", "niftybank", "sp500", "nasdaq100"):
            if idx_col in macro_df.columns:
                macro_df[f"{idx_col}_return_1d"] = macro_df[idx_col].pct_change(1, fill_method=None).fillna(0)
                macro_df[f"{idx_col}_return_5d"] = macro_df[idx_col].pct_change(5, fill_method=None).fillna(0)
                macro_df = macro_df.drop(columns=[idx_col])

        return macro_df

    # ------------------------------------------------------------------
    # Private: normalisation
    # ------------------------------------------------------------------

    def _feature_columns(self, df: pd.DataFrame) -> list[str]:
        exclude = {"ds", "y", "open", "close", "high", "low", "volume", "date"}
        return [c for c in df.columns if c not in exclude]

    def _normalise(self, df: pd.DataFrame, feature_cols: list[str], fit: bool) -> pd.DataFrame:
        df = df.copy()
        for col in feature_cols:
            if col not in df.columns:
                df[col] = 0.0
            series = df[col].astype(float)
            if fit:
                mean = float(series.mean())
                std  = float(series.std()) or 1.0
                self._scaler_stats[col] = (mean, std)
            else:
                mean, std = self._scaler_stats.get(col, (0.0, 1.0))
            df[col] = (series - mean) / std
            df[col] = df[col].replace([np.inf, -np.inf], 0.0).fillna(0.0)
        return df
