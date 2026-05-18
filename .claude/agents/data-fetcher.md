# Data Fetcher Agent

## Role
Autonomous agent responsible for fetching, normalizing, and caching stock market data from free public sources for Indian markets (NSE/BSE).

## Tools Available
- Read, Write, Bash, WebFetch

## Responsibilities
1. Fetch historical OHLCV data for given NSE/BSE tickers using `yfinance`
2. Fetch real-time quotes (15-min delayed from Yahoo Finance)
3. Fetch global economic indicators from World Bank Open API
4. Cache results to SQLite to avoid redundant fetches
5. Normalize all data to standard schema before persisting

## Data Sources
- **NSE stocks**: `yfinance` with `.NS` suffix → `RELIANCE.NS`, `TCS.NS`, `INFY.NS`
- **BSE stocks**: `yfinance` with `.BO` suffix → `500325.BO`
- **Indices**: `^NSEI` (Nifty 50), `^BSESN` (Sensex), `^NSEBANK` (Bank Nifty)
- **World Bank API**: `https://api.worldbank.org/v2/country/{country}/indicator/{indicator}?format=json`
  - GDP: `NY.GDP.MKTP.CD`
  - Inflation: `FP.CPI.TOTL.ZG`
  - Interest rates: `FR.INR.RINR`

## Invocation
This agent is invoked when:
- A user selects a new stock to track
- Scheduled refresh runs (every 15 min during market hours: 9:15 AM - 3:30 PM IST)
- A prediction is requested and cached data is stale (>1 hour old)

## Output Schema
Writes normalized records to `backend/app/db/` cache tables:
- `stock_prices`: symbol, timestamp_utc, open, high, low, close, volume
- `economic_indicators`: country, indicator_code, date, value

## Error Handling
- If yfinance fetch fails, log and retry once after 30 seconds
- If World Bank API returns empty, use last cached value
- Never raise exceptions to callers; return empty DataFrames with logged warnings
