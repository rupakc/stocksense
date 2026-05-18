import { test, expect } from '@playwright/test'
import { loginViaApi, authedApiGet } from './helpers.js'

test.describe('NASDAQ Backtesting', () => {
  const nasdaqSymbol = 'AAPL'

  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('backtest API works for NASDAQ symbol (AAPL)', async ({ page }) => {
    const response = await authedApiGet(
      page,
      `/api/strategies/macd_momentum/backtest/${nasdaqSymbol}?lookback_days=365`
    )
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data).toHaveProperty('symbol', nasdaqSymbol)
    expect(data).toHaveProperty('strategy_id', 'macd_momentum')
    expect(data).toHaveProperty('total_trades')
    expect(data).toHaveProperty('total_return_pct')
    expect(data).toHaveProperty('equity_curve')
    expect(data.equity_curve.length).toBeGreaterThan(0)
  })

  test('backtest API works for multiple NASDAQ strategies', async ({ page }) => {
    const strategies = ['golden_cross', 'rsi_mean_reversion', 'bollinger_breakout', 'supertrend']
    for (const strategy of strategies) {
      const response = await authedApiGet(
        page,
        `/api/strategies/${strategy}/backtest/${nasdaqSymbol}?lookback_days=365`
      )
      expect(response.ok(), `${strategy} backtest should return 200`).toBeTruthy()
      const data = await response.json()
      expect(data.symbol).toBe(nasdaqSymbol)
      expect(data.strategy_id).toBe(strategy)
    }
  })

  test('NASDAQ backtest has lower transaction costs than Indian', async ({ page }) => {
    const nasdaqResp = await authedApiGet(
      page,
      `/api/strategies/macd_momentum/backtest/${nasdaqSymbol}?lookback_days=365`
    )
    const nasdaqData = await nasdaqResp.json()

    const indianResp = await authedApiGet(
      page,
      `/api/strategies/macd_momentum/backtest/RELIANCE.NS?lookback_days=365`
    )
    const indianData = await indianResp.json()

    if (nasdaqData.total_trades > 0 && indianData.total_trades > 0) {
      const nasdaqCostPerTrade = nasdaqData.total_transaction_costs / nasdaqData.total_trades
      const indianCostPerTrade = indianData.total_transaction_costs / indianData.total_trades
      expect(nasdaqCostPerTrade).toBeLessThan(indianCostPerTrade)
    }
  })

  test('compare all strategies works for NASDAQ symbol', async ({ page }) => {
    const response = await authedApiGet(
      page,
      `/api/strategies/compare/${nasdaqSymbol}?lookback_days=365`
    )
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data).toHaveProperty('symbol', nasdaqSymbol)
    expect(data).toHaveProperty('strategies')
    expect(data.strategies.length).toBeGreaterThan(0)
  })
})
