Train or retrain the ML prediction model for one or all tracked stocks.

Usage: /train [SYMBOL|all]

Steps:
1. If SYMBOL is "all", get list of tracked symbols from DB
2. For each symbol, invoke ml-predictor agent
3. Report training results: MAE, RMSE, MAPE for each model
4. Save models to backend/models/saved/
5. Update model metadata in DB (trained_at, metrics)

Note: Training 1 symbol takes ~30-60 seconds. Training all may take several minutes.
