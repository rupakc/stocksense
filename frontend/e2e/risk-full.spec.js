import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('Risk Dashboard - Full Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/risk')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Risk/i })).toBeVisible()
  })

  test('risk API returns valid data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/portfolio/risk')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('symbols')
    expect(data).toHaveProperty('risk_metrics')
    expect(data).toHaveProperty('correlation_matrix')
  })

  test('risk metrics contain required fields', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/portfolio/risk')
    const data = await resp.json()
    const symbols = Object.keys(data.risk_metrics)
    if (symbols.length > 0) {
      const metrics = data.risk_metrics[symbols[0]]
      expect(metrics).toHaveProperty('annualized_volatility')
      expect(metrics).toHaveProperty('var_95')
      expect(metrics).toHaveProperty('sharpe_ratio')
    }
  })

  test('correlation matrix is symmetric', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/portfolio/risk')
    const data = await resp.json()
    const syms = data.symbols
    for (let i = 0; i < syms.length; i++) {
      for (let j = i + 1; j < syms.length; j++) {
        const a = data.correlation_matrix?.[syms[i]]?.[syms[j]]
        const b = data.correlation_matrix?.[syms[j]]?.[syms[i]]
        if (a != null && b != null) {
          expect(Math.abs(a - b)).toBeLessThan(0.01)
        }
      }
    }
  })

  test('portfolio metrics section renders when data available', async ({ page }) => {
    await page.waitForTimeout(4000)
    const mainHTML = await page.locator('main').innerHTML()
    if (!mainHTML.includes('No watchlist stocks')) {
      expect(mainHTML).toMatch(/Portfolio Risk Metrics|Volatility|Beta|Sharpe/i)
    }
  })

  test('stress test section renders', async ({ page }) => {
    await page.waitForTimeout(4000)
    const mainHTML = await page.locator('main').innerHTML()
    if (!mainHTML.includes('No watchlist stocks')) {
      expect(mainHTML).toMatch(/Stress Test|Market Crash|Correction/i)
    }
  })

  test('NSE filter shows Indian context (Nifty reference)', async ({ page }) => {
    await page.waitForTimeout(4000)
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    if (!html.includes('No watchlist')) {
      expect(html).toMatch(/Nifty|RBI|INR/i)
    }
  })

  test('NASDAQ filter shows US context (S&P reference)', async ({ page }) => {
    await page.waitForTimeout(4000)
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    if (!html.includes('No watchlist')) {
      expect(html).toMatch(/S&amp;P|S&P|Fed|USD/i)
    }
  })

  test('sector concentration chart renders', async ({ page }) => {
    await page.waitForTimeout(4000)
    const mainHTML = await page.locator('main').innerHTML()
    if (!mainHTML.includes('No watchlist stocks')) {
      expect(mainHTML).toMatch(/Sector Concentration|sector/i)
    }
  })

  test('no crash on exchange switch', async ({ page }) => {
    await page.waitForTimeout(3000)
    for (const ex of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(1500)
    }
    await expect(page.locator('main')).toBeVisible()
  })

  test('screenshot of risk page', async ({ page }) => {
    await page.waitForTimeout(4000)
    await page.screenshot({ path: 'e2e/screenshots/risk-full.png', fullPage: true })
  })
})
