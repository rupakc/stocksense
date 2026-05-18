Fetch historical and current data for a given stock symbol from NSE/BSE.

Usage: /fetch-stock [SYMBOL] [PERIOD]

Arguments:
- SYMBOL: NSE ticker (e.g., RELIANCE, TCS, INFY) — .NS suffix added automatically
- PERIOD: 1mo | 3mo | 6mo | 1y | 2y | 5y (default: 1y)

Steps:
1. Run: `cd backend && python -c "from app.services.market_data.nse_fetcher import NSEFetcher; NSEFetcher().fetch_and_store('$ARGUMENTS.NS', period='1y')"`
2. Confirm data was stored by checking row count
3. Report: symbol, date range fetched, number of records, latest close price
