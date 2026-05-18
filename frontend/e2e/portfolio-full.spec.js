import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('Portfolio Advisory - Full Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/portfolio')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Portfolio/i })).toBeVisible()
  })

  test('subtitle renders', async ({ page }) => {
    const subtitle = page.locator('text=AI-powered advisory')
    await expect(subtitle).toBeVisible()
  })

  test('portfolio API returns valid array', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/portfolio/')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('advisory cards have signal, confidence, composite_score', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/portfolio/')
    const data = await resp.json()
    if (data.length > 0) {
      const rec = data[0]
      expect(rec).toHaveProperty('signal')
      expect(rec).toHaveProperty('confidence')
      expect(rec).toHaveProperty('composite_score')
      expect(rec).toHaveProperty('technical_score')
      expect(rec).toHaveProperty('prediction_score')
      expect(rec).toHaveProperty('sentiment_score')
      expect(['BUY', 'HOLD', 'SELL', 'WATCH']).toContain(rec.signal)
    }
  })

  test('summary tiles show counts for BUY, HOLD, SELL, WATCH', async ({ page }) => {
    await page.waitForTimeout(4000)
    const mainHTML = await page.locator('main').innerHTML()
    if (!mainHTML.includes('No stocks')) {
      expect(mainHTML).toMatch(/BUY|HOLD|SELL|WATCH/)
    }
  })

  test('NSE filter shows Indian stocks with ₹', async ({ page }) => {
    await page.waitForTimeout(4000)
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    if (!html.includes('No stocks')) {
      expect(html).toMatch(/₹/)
    }
  })

  test('NASDAQ filter shows US stocks with $', async ({ page }) => {
    await page.waitForTimeout(4000)
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    if (!html.includes('No stocks')) {
      expect(html).toMatch(/\$/)
    }
  })

  test('refresh button is visible and clickable', async ({ page }) => {
    await page.waitForTimeout(2000)
    const refreshBtn = page.locator('button').filter({ hasText: /Refresh/i })
    await expect(refreshBtn).toBeVisible()
    await refreshBtn.click()
    await page.waitForTimeout(1000)
    await expect(page.locator('main')).toBeVisible()
  })

  test('no crash on exchange switch', async ({ page }) => {
    await page.waitForTimeout(3000)
    for (const ex of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(1500)
    }
    await expect(page.locator('main')).toBeVisible()
  })

  test('screenshot of portfolio page', async ({ page }) => {
    await page.waitForTimeout(4000)
    await page.screenshot({ path: 'e2e/screenshots/portfolio-full.png', fullPage: true })
  })
})
