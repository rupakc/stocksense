"""
Prediction service — Prophet model with multi-signal regressors.

Feature matrix (built by FeatureBuilder):
  Candlestick: candle_body, candle_range, upper_shadow, lower_shadow,
               gap, doji_flag, typical_price_return, vwap_ratio,
               volume_momentum, hl_pct_52w_high
  Technical  : rsi_14, return_1d/5d/20d, macd_diff, bb_width, bb_position,
               atr_14, cci_20, stoch_k, williams_r, mfi_14, obv_pct_change,
               volume_ratio, adx_14, ema_cross_9_21, roc_10,
               ad_pct_change, ichimoku_base_pct
  Sentiment  : sentiment_7d, sentiment_30d, sentiment_momentum, news_volume_7d
  Macro/Eco  : usd_inr, crude_oil, gold, silver, copper, india_vix,
               us_10y, dxy, nifty50_return_1d/5d, niftybank_return_1d/5d

All regressors are z-score normalised.  Future values:
  - sentiment_*, gap, doji_flag  → 0.0 (unknowable)
  - volume_*, obv_pct_change     → 0.0 (assume average)
  - candlestick / macro / tech   → last-5-day median
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timezone

import joblib
import numpy as np

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.prediction.feature_builder import FeatureBuilder

logger = logging.getLogger(__name__)


class PredictionService:

    def _model_path(self, symbol: str) -> str:
        safe = re.sub(r'[^A-Za-z0-9_\-]', '_', symbol)
        model_dir = os.path.abspath(settings.model_dir)
        os.makedirs(model_dir, exist_ok=True)
        path = os.path.join(model_dir, f"{safe}_prophet.joblib")
        if not path.startswith(model_dir):
            raise ValueError(f"Invalid symbol for model path: {symbol}")
        return path

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    async def train(
        self,
        symbol: str,
        horizon_days: int,
        db: AsyncSession,
    ):
        builder = FeatureBuilder()
        df = await builder.build(symbol, db)

        if len(df) < 60:
            raise ValueError(
                f"Insufficient training data for {symbol}: "
                f"{len(df)} rows available, 60 minimum required"
            )

        feature_cols = builder._feature_columns(df)
        logger.info(
            f"Training Prophet for {symbol}: {len(df)} rows, "
            f"{len(feature_cols)} features"
        )

        model, prophet_predictions, prophet_metrics = await asyncio.to_thread(
            self._train_prophet, df, feature_cols, builder, horizon_days
        )

        final_predictions = prophet_predictions
        final_metrics = prophet_metrics
        model_name = "prophet-multisignal"
        gbm_model = None
        saved_blend_info = None

        try:
            gbm_model, gbm_preds, gbm_metrics = await asyncio.to_thread(
                self._train_gbm, df, feature_cols, horizon_days, builder
            )
            final_predictions, saved_blend_info = self._blend_predictions(
                prophet_predictions, gbm_preds,
                prophet_metrics["mape"], gbm_metrics["mape"],
            )
            final_metrics = {
                **prophet_metrics,
                "gbm_mae": gbm_metrics["mae"],
                "gbm_mape": gbm_metrics["mape"],
                **saved_blend_info,
            }
            blended_mape = (
                prophet_metrics["mape"] * saved_blend_info["prophet_weight"]
                + gbm_metrics["mape"] * saved_blend_info["gbm_weight"]
            )
            final_metrics["mape"] = round(blended_mape, 4)
            model_name = "ensemble-prophet-gbm"
            logger.info(
                f"Ensemble trained for {symbol}: "
                f"Prophet MAPE={prophet_metrics['mape']:.2f}%, "
                f"GBM MAPE={gbm_metrics['mape']:.2f}%, "
                f"Blended MAPE={blended_mape:.2f}%"
            )
        except Exception as exc:
            logger.warning(f"GBM ensemble failed for {symbol}, using Prophet only: {exc}")
            final_metrics["gbm_error"] = str(exc)

        model_path = self._model_path(symbol)
        await asyncio.to_thread(
            joblib.dump,
            {
                "model": model,
                "gbm_model": gbm_model,
                "blend_info": saved_blend_info,
                "builder": builder,
                "features": feature_cols,
            },
            model_path,
        )

        # Persist to GCS immediately so the model survives a container restart
        from app.services.gcs_sync import get_gcs_sync
        await asyncio.to_thread(get_gcs_sync().upload_model, model_path)

        from app.db.models import PredictionResult
        record = PredictionResult(
            symbol=symbol,
            model_name=model_name,
            trained_at=datetime.now(timezone.utc),
            horizon_days=horizon_days,
            predictions=final_predictions,
            metrics=final_metrics,
            features_used=feature_cols,
        )
        db.add(record)
        await db.commit()
        logger.info(
            f"Saved prediction for {symbol}: "
            f"MAE={final_metrics['mae']:.2f}, MAPE={final_metrics['mape']:.2f}%"
        )
        return record

    # ------------------------------------------------------------------
    # Fast training — GBM only, completes in < 60 s per symbol
    # ------------------------------------------------------------------

    async def train_fast(self, symbol: str, horizon_days: int, db: AsyncSession):
        """Train a GBM-only model.

        Prophet is intentionally skipped: it requires two full Stan fits
        (eval + final) that can each take 5-15 min with 30+ regressors,
        causing cascading asyncio.to_thread leaks and OOM kills on Cloud Run.
        GBM produces a usable prediction in under 60 s; Prophet can be run
        on demand via the /api/predictions/train endpoint.
        """
        from datetime import timedelta

        builder = FeatureBuilder()
        df = await builder.build(symbol, db)

        if len(df) < 60:
            raise ValueError(
                f"Insufficient training data for {symbol}: "
                f"{len(df)} rows, 60 minimum required"
            )

        feature_cols = builder._feature_columns(df)
        logger.info(f"[fast-train] {symbol}: {len(df)} rows, {len(feature_cols)} features")

        gbm_model, gbm_preds, metrics = await asyncio.to_thread(
            self._train_gbm, df, feature_cols, horizon_days, builder
        )

        # Pair future prices with business dates
        last_date = df["ds"].max()
        future_dates = pd.bdate_range(
            start=last_date + timedelta(days=1), periods=horizon_days
        )
        residual_band = metrics.get("rmse", metrics.get("mae", 10) * 1.5)
        predictions = [
            {
                "date": dt.strftime("%Y-%m-%d"),
                "predicted_close": round(float(p), 2),
                "lower_bound": round(float(p) - residual_band, 2),
                "upper_bound": round(float(p) + residual_band, 2),
            }
            for dt, p in zip(future_dates, gbm_preds)
        ]

        model_path = self._model_path(symbol)
        await asyncio.to_thread(
            joblib.dump,
            {
                "model": None,          # no Prophet in fast mode
                "gbm_model": gbm_model,
                "blend_info": None,
                "builder": builder,
                "features": feature_cols,
                "residual_band": residual_band,
            },
            model_path,
        )

        from app.services.gcs_sync import get_gcs_sync
        await asyncio.to_thread(get_gcs_sync().upload_model, model_path)

        from app.db.models import PredictionResult
        record = PredictionResult(
            symbol=symbol,
            model_name="gbm-fast",
            trained_at=datetime.now(timezone.utc),
            horizon_days=horizon_days,
            predictions=predictions,
            metrics=metrics,
            features_used=feature_cols,
        )
        db.add(record)
        await db.commit()
        logger.info(
            f"[fast-train] Saved for {symbol}: "
            f"MAE={metrics['mae']:.2f}, MAPE={metrics['mape']:.2f}%"
        )
        return record

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    async def get_latest(
        self, symbol: str, horizon_days: int, db: AsyncSession
    ) -> dict | None:
        """Return the latest stored prediction, falling back to on-disk model."""
        from sqlalchemy import select
        from app.db.models import PredictionResult

        result = await db.execute(
            select(PredictionResult)
            .where(
                PredictionResult.symbol == symbol,
                PredictionResult.horizon_days == horizon_days,
            )
            .order_by(PredictionResult.trained_at.desc())
            .limit(1)
        )
        row = result.scalars().first()
        if row:
            return self._row_to_dict(row)

        disk_pred = await self._predict_from_disk(symbol, horizon_days, db)
        if disk_pred:
            return disk_pred
        return None

    async def _predict_from_disk(
        self, symbol: str, horizon_days: int, db: AsyncSession
    ) -> dict | None:
        """Load a saved model from disk and generate a fresh prediction.

        Uses build_for_inference() so all four feature layers (price, technical,
        sentiment, macro) are recomputed with the training-time scaler stats,
        keeping the feature distribution consistent with what the model was trained on.
        """
        model_path = self._model_path(symbol)
        if not os.path.exists(model_path):
            return None

        try:
            from datetime import timedelta
            saved = await asyncio.to_thread(joblib.load, model_path)
            model = saved["model"]
            builder = saved["builder"]
            feature_cols = saved["features"]
            gbm_model = saved.get("gbm_model")
            blend_info = saved.get("blend_info")

            # Recompute all features with saved normalization; never re-fits the scaler
            train_df = await builder.build_for_inference(symbol, db)
            if train_df.empty or len(train_df) < 30:
                return None

            # Pad any feature columns added after the model was saved
            for col in feature_cols:
                if col not in train_df.columns:
                    train_df[col] = 0.0

            # GBM-only model (saved by train_fast): no Prophet model on disk
            if model is None and gbm_model is not None:
                future_df = builder.get_future_features(train_df, horizon_days)
                future_X = future_df.tail(horizon_days)[feature_cols].fillna(0.0).values
                gbm_raw = [float(gbm_model.predict(r.reshape(1, -1))[0]) for r in future_X]
                residual_band = saved.get("residual_band", 10.0)
                last_date = train_df["ds"].max()
                future_dates = pd.bdate_range(
                    start=last_date + timedelta(days=1), periods=horizon_days
                )
                predictions = [
                    {
                        "date": dt.strftime("%Y-%m-%d"),
                        "predicted_close": round(p, 2),
                        "lower_bound": round(p - residual_band, 2),
                        "upper_bound": round(p + residual_band, 2),
                    }
                    for dt, p in zip(future_dates, gbm_raw)
                ]
                logger.info(f"[disk-fallback] GBM-fast prediction for {symbol}")
                return {
                    "symbol": symbol,
                    "model_name": "gbm-disk-fallback",
                    "trained_at": datetime.fromtimestamp(
                        os.path.getmtime(model_path), tz=timezone.utc
                    ),
                    "horizon_days": horizon_days,
                    "predictions": predictions,
                    "metrics": saved.get("metrics", {}),
                    "confidence": self._confidence(
                        (saved.get("metrics") or {}).get("mape", 99)
                    ),
                    "features_used": feature_cols,
                }

            future = builder.get_future_features(train_df, horizon_days)
            forecast = await asyncio.to_thread(model.predict, future)

            tail = forecast.tail(horizon_days)

            if gbm_model is not None and blend_info is not None:
                try:
                    future_X = future.tail(horizon_days)[feature_cols].fillna(0.0).values
                    gbm_preds = [float(gbm_model.predict(r.reshape(1, -1))[0]) for r in future_X]
                    w_p = blend_info["prophet_weight"]
                    w_g = blend_info["gbm_weight"]
                    predictions = [
                        {
                            "date": row["ds"].strftime("%Y-%m-%d"),
                            "predicted_close": round(row["yhat"] * w_p + gbm_preds[i] * w_g, 2),
                            "lower_bound": round(row["yhat_lower"], 2),
                            "upper_bound": round(row["yhat_upper"], 2),
                            "prophet_pred": round(row["yhat"], 2),
                            "gbm_pred": round(gbm_preds[i], 2),
                        }
                        for i, (_, row) in enumerate(tail.iterrows())
                    ]
                    model_label = "ensemble-disk-fallback"
                except Exception:
                    predictions = [
                        {
                            "date": row["ds"].strftime("%Y-%m-%d"),
                            "predicted_close": round(row["yhat"], 2),
                            "lower_bound": round(row["yhat_lower"], 2),
                            "upper_bound": round(row["yhat_upper"], 2),
                        }
                        for _, row in tail.iterrows()
                    ]
                    model_label = "prophet-disk-fallback"
            else:
                predictions = [
                    {
                        "date": row["ds"].strftime("%Y-%m-%d"),
                        "predicted_close": round(row["yhat"], 2),
                        "lower_bound": round(row["yhat_lower"], 2),
                        "upper_bound": round(row["yhat_upper"], 2),
                    }
                    for _, row in tail.iterrows()
                ]
                model_label = "prophet-disk-fallback"

            metrics = saved.get("metrics", {})
            logger.info(f"[disk-fallback] Generated {model_label} prediction for {symbol}")
            return {
                "symbol": symbol,
                "model_name": model_label,
                "trained_at": datetime.fromtimestamp(
                    os.path.getmtime(model_path), tz=timezone.utc
                ),
                "horizon_days": horizon_days,
                "predictions": predictions,
                "metrics": metrics,
                "confidence": self._confidence(metrics.get("mape", 99)),
                "features_used": feature_cols,
            }
        except Exception as exc:
            logger.warning(f"[disk-fallback] Failed for {symbol}: {exc}")
            return None

    # ------------------------------------------------------------------
    # Core Prophet training
    # ------------------------------------------------------------------

    def _make_prophet_model(self, feature_cols: list[str], uncertainty_samples: int = 100):
        from prophet import Prophet
        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=True,
            changepoint_prior_scale=0.1,
            interval_width=0.90,
            seasonality_mode="additive",
            uncertainty_samples=uncertainty_samples,
        )
        model.add_seasonality(name="quarterly", period=91.25, fourier_order=5)
        for col in feature_cols:
            if col.startswith("sentiment") or col.startswith("news_"):
                prior = 0.3   # news sentiment — allow more influence
            elif col in ("candle_body", "gap", "vwap_ratio", "lower_shadow",
                         "ema_cross_9_21", "ichimoku_base_pct"):
                prior = 0.2   # high-signal candlestick patterns
            elif col in ("rsi_14", "macd_diff", "bb_position", "mfi_14",
                         "stoch_k", "williams_r", "cci_20",
                         "adx_14", "roc_10"):
                prior = 0.15  # oscillator signals
            else:
                prior = 0.08  # macro, volatility, volume — slow-moving background
            model.add_regressor(col, prior_scale=prior, standardize=False)
        return model

    def _train_prophet(
        self,
        df: pd.DataFrame,
        feature_cols: list[str],
        builder: FeatureBuilder,
        horizon_days: int,
    ) -> tuple[object, list[dict], dict]:
        model = self._make_prophet_model(feature_cols)

        train_df = df[["ds", "y"] + feature_cols].copy()

        split = int(len(train_df) * 0.80)
        train_part = train_df.iloc[:split]
        test_part  = train_df.iloc[split:]

        # --- Walk-forward validation model (no uncertainty intervals needed) ---
        eval_model = self._make_prophet_model(feature_cols, uncertainty_samples=0)
        eval_model.fit(train_part)
        test_forecast = eval_model.predict(test_part[["ds"] + feature_cols])
        merged = test_part[["ds", "y"]].merge(
            test_forecast[["ds", "yhat"]], on="ds"
        ).dropna()
        mae  = float((merged["y"] - merged["yhat"]).abs().mean())
        mape = float(
            ((merged["y"] - merged["yhat"]).abs()
             / merged["y"].abs().clip(lower=1e-8)).mean() * 100
        )
        rmse = float(((merged["y"] - merged["yhat"]) ** 2).mean() ** 0.5)
        metrics = {
            "mae":  round(mae,  4),
            "mape": round(mape, 4),
            "rmse": round(rmse, 4),
            "eval_rows": len(merged),
            "features_count": len(feature_cols),
        }

        # --- Final model fit on full data ---
        model.fit(train_df)

        future_full = builder.get_future_features(train_df, horizon_days)
        forecast = model.predict(future_full)

        tail = forecast.tail(horizon_days)
        predictions = [
            {
                "date":            row["ds"].strftime("%Y-%m-%d"),
                "predicted_close": round(row["yhat"],       2),
                "lower_bound":     round(row["yhat_lower"], 2),
                "upper_bound":     round(row["yhat_upper"], 2),
            }
            for _, row in tail.iterrows()
        ]

        return model, predictions, metrics

    # ------------------------------------------------------------------
    # Gradient Boosting ensemble
    # ------------------------------------------------------------------

    def _train_gbm(
        self,
        df: pd.DataFrame,
        feature_cols: list[str],
        horizon_days: int,
        builder: FeatureBuilder,
    ) -> tuple[object, list[float], dict]:
        from sklearn.ensemble import GradientBoostingRegressor
        from sklearn.metrics import mean_absolute_error

        X = df[feature_cols].values
        y = df["y"].values

        split = int(len(df) * 0.80)
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]

        gbm = GradientBoostingRegressor(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            subsample=0.8, min_samples_leaf=10, random_state=42,
        )
        gbm.fit(X_train, y_train)
        preds = gbm.predict(X_test)
        mae = mean_absolute_error(y_test, preds)
        mape = float(
            (np.abs(y_test - preds) / np.clip(np.abs(y_test), 1e-8, None)).mean() * 100
        )

        gbm_full = GradientBoostingRegressor(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            subsample=0.8, min_samples_leaf=10, random_state=42,
        )
        gbm_full.fit(X, y)

        # Use the same future-feature extrapolation as Prophet so both models
        # see consistent inputs; previously last_features was never updated,
        # causing flat/constant GBM predictions across all horizon days.
        future_df = builder.get_future_features(df, horizon_days)
        future_X = future_df.tail(horizon_days)[feature_cols].fillna(0.0).values
        gbm_preds = [float(gbm_full.predict(row.reshape(1, -1))[0]) for row in future_X]

        rmse = float(np.sqrt(np.mean((y_test - preds) ** 2)))
        return gbm_full, gbm_preds, {
            "mae": round(mae, 4),
            "mape": round(mape, 4),
            "rmse": round(rmse, 4),
        }

    def _blend_predictions(self, prophet_preds, gbm_preds, prophet_mape, gbm_mape):
        total = prophet_mape + gbm_mape
        if total == 0:
            w_prophet, w_gbm = 0.5, 0.5
        else:
            w_prophet = 1 - (prophet_mape / total)
            w_gbm = 1 - (gbm_mape / total)
        wsum = w_prophet + w_gbm
        w_prophet /= wsum
        w_gbm /= wsum

        blended = []
        for i, pp in enumerate(prophet_preds):
            gb_val = gbm_preds[i] if i < len(gbm_preds) else pp["predicted_close"]
            blended_close = pp["predicted_close"] * w_prophet + gb_val * w_gbm
            blended.append({
                "date": pp["date"],
                "predicted_close": round(blended_close, 2),
                "lower_bound": pp["lower_bound"],
                "upper_bound": pp["upper_bound"],
                "prophet_pred": pp["predicted_close"],
                "gbm_pred": round(gb_val, 2),
            })
        return blended, {"prophet_weight": round(w_prophet, 3), "gbm_weight": round(w_gbm, 3)}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _confidence(self, mape: float) -> str:
        if mape < settings.confidence_high_mape:
            return "high"
        if mape < settings.confidence_medium_mape:
            return "medium"
        return "low"

    def _row_to_dict(self, row) -> dict:
        return {
            "symbol":       row.symbol,
            "model_name":   row.model_name,
            "trained_at":   row.trained_at,
            "horizon_days": row.horizon_days,
            "predictions":  row.predictions,
            "metrics":      row.metrics,
            "confidence":   self._confidence(
                row.metrics.get("mape", 99) if row.metrics else 99
            ),
            "features_used": row.features_used,
        }
