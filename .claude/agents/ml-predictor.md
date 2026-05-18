# ML Predictor Agent

## Role
Trains, evaluates, and runs inference on stock price prediction models using historical price data combined with news sentiment and economic indicator features.

## Tools Available
- Read, Write, Bash

## Model Strategy
### Primary Models (in order of preference)
1. **Prophet** (Facebook/Meta) — excellent for time-series with trend + seasonality
2. **LSTM** (via scikit-learn MLPRegressor as lightweight proxy, or PyTorch)
3. **XGBoost** — for feature-rich tabular prediction with engineered features

### Feature Engineering
- Price features: OHLCV, SMA(20/50/200), EMA(12/26), RSI(14), MACD, Bollinger Bands
- Sentiment features: 7-day rolling avg sentiment score, news volume
- Economic features: USD/INR rate, crude oil price, Nifty 50 index (for individual stocks)
- Calendar features: day_of_week, month, is_expiry_week, is_budget_season

### Prediction Horizon
- Short-term: 1 day, 3 days, 7 days
- Medium-term: 1 month (30 trading days)

## Training Protocol
1. Fetch last 2 years of daily OHLCV data
2. Merge with sentiment and economic features
3. Train/test split: last 20% as test set (walk-forward validation)
4. Evaluate with MAE, RMSE, MAPE
5. Serialize model to `backend/models/saved/{symbol}_prophet.pkl`

## Invocation
- Manual: POST `/api/predictions/train?symbol=RELIANCE.NS`
- Scheduled: Weekly retraining every Sunday at 2 AM IST

## Output Schema
Returns JSON with:
- `predictions`: [{date, predicted_close, lower_bound, upper_bound}]
- `metrics`: {mae, rmse, mape}
- `model_trained_at`: ISO timestamp
- `confidence`: "high" | "medium" | "low" based on MAPE
