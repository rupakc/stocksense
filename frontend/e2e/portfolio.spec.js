import { test, expect } from '@playwright/test'
import { loginViaApi, authedApiGet } from './helpers.js'

test.describe('Portfolio Advisor Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/portfolio')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Portfolio/i })).toBeVisible()
  })

  test('subtitle shown', async ({ page }) => {
    await expect(page.getByText(/advisory signals/i)).toBeVisible()
  })

  test('portfolio API responds with an array', async ({ page }) => {
    const response = await authedApiGet(page, '/api/portfolio/')
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('each advisory has required fields', async ({ page }) => {
    const response = await authedApiGet(page, '/api/portfolio/')
    const data = await response.json()
    if (data.length > 0) {
      const rec = data[0]
      expect(rec).toHaveProperty('symbol')
      expect(rec).toHaveProperty('signal')
      expect(['BUY', 'HOLD', 'SELL', 'WATCH']).toContain(rec.signal)
      expect(rec).toHaveProperty('confidence')
      expect(rec).toHaveProperty('composite_score')
      expect(rec).toHaveProperty('rationale')
    }
  })

  test('screenshot of portfolio page', async ({ page }) => {
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/portfolio.png', fullPage: true })
  })
})
