import { test, expect } from '@playwright/test'
import { loginViaApi, authedApiGet } from './helpers.js'

test.describe('Stock Detail Page', () => {
  const symbol = 'RELIANCE.NS'
  const encodedSymbol = encodeURIComponent(symbol)

  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto(`/stock/${encodedSymbol}`)
    await page.waitForLoadState('domcontentloaded')
  })

  test('quote API returns data for RELIANCE', async ({ page }) => {
    const response = await authedApiGet(page, `/api/stocks/quote/${symbol}`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data).toHaveProperty('current_price')
    expect(data).toHaveProperty('symbol', symbol)
    expect(typeof data.current_price).toBe('number')
    expect(data.current_price).toBeGreaterThan(0)
  })

  test('history API returns OHLCV records', async ({ page }) => {
    const response = await authedApiGet(page, `/api/stocks/history/${symbol}?period=1mo`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(Array.isArray(data)).toBeTruthy()
    expect(data.length).toBeGreaterThan(0)
    expect(data[0]).toHaveProperty('close')
    expect(data[0]).toHaveProperty('volume')
  })

  test('stock detail page renders without crash', async ({ page }) => {
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
    expect((body ?? '').length).toBeGreaterThan(50)
  })

  test('screenshot of stock detail page', async ({ page }) => {
    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'e2e/screenshots/stock-detail.png', fullPage: true })
  })
})
