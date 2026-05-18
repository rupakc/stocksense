Run full analysis pipeline for a stock: fetch data, compute sentiment, generate prediction.

Usage: /analyze [SYMBOL]

Steps:
1. Fetch latest market data for SYMBOL.NS using data-fetcher agent
2. Fetch and score latest news using news-analyst agent
3. Run ML prediction for 1d, 7d, 30d horizons
4. Display summary table with: current price, predicted prices, sentiment score, signal
5. Show top 3 relevant news headlines with sentiment

Spawn subagents for steps 1-3 in parallel, then aggregate in step 4.
