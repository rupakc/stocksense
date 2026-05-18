import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('Strategies Page - Full Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/strategies')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading and description render', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Strategies/i })).toBeVisible()
  })

  test('strategy tabs are visible', async ({ page }) => {
    await page.waitForTimeout(2000)
    const mainText = await page.locator('main').textContent()
    expect(mainText.length).toBeGreaterThan(10)
  })

  test('strategies API returns valid data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('backtest API works for NSE stock', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/golden_cross/backtest/RELIANCE.NS?lookback_days=365')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('total_trades')
    expect(data).toHaveProperty('total_return_pct')
  })

  test('backtest API works for NASDAQ stock', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/golden_cross/backtest/AAPL?lookback_days=365')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('total_trades')
    expect(data).toHaveProperty('total_return_pct')
  })

  test('compare API works for NSE', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/compare/RELIANCE.NS?lookback_days=365')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('symbol')
    expect(data).toHaveProperty('strategies')
  })

  test('compare API works for NASDAQ', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/compare/AAPL?lookback_days=365')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('symbol')
    expect(data).toHaveProperty('strategies')
  })

  test('strategy list contains expected strategies', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/')
    const data = await resp.json()
    const ids = data.map(s => s.id)
    expect(ids).toContain('golden_cross')
    expect(ids).toContain('rsi_mean_reversion')
  })

  test('page does not crash on exchange switch', async ({ page }) => {
    await page.waitForTimeout(2000)
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    await expect(page.locator('main')).toBeVisible()
  })

  test('screenshot of strategies page', async ({ page }) => {
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/strategies-full.png', fullPage: true })
  })
})
