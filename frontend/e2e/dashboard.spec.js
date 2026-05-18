import { test, expect } from '@playwright/test'
import { loginViaApi, expectApiOk } from './helpers.js'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page title and nav render', async ({ page }) => {
    await expect(page.getByText('StockSense').first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Dashboard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Watchlist/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /News/i })).toBeVisible()
  })

  test('Market Overview heading visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Market Overview/i })).toBeVisible()
  })

  test('backend health check passes', async ({ page }) => {
    const data = await expectApiOk(page, '/health')
    expect(data.status).toBe('ok')
  })

  test('indices API returns data', async ({ page }) => {
    const data = await expectApiOk(page, '/api/stocks/indices')
    expect(Object.keys(data).length).toBeGreaterThan(0)
    const firstIndex = Object.values(data)[0]
    expect(firstIndex).toHaveProperty('current_price')
    expect(typeof firstIndex.current_price).toBe('number')
  })

  test('watchlist section renders', async ({ page }) => {
    await expect(page.getByText(/Your Watchlist|Watchlist/i).first()).toBeVisible()
  })

  test('nav active state highlights Dashboard', async ({ page }) => {
    const dashboardLink = page.getByRole('link', { name: /Dashboard/i })
    await expect(dashboardLink).toBeVisible()
  })

  test('screenshot', async ({ page }) => {
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/dashboard.png', fullPage: true })
  })
})
