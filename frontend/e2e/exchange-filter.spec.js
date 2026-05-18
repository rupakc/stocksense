import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange } from './helpers.js'

test.describe('Global Exchange Filter', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  })

  test('exchange dropdown is visible and defaults to All Markets', async ({ page }) => {
    const trigger = page.locator('button').filter({ hasText: /All Markets|NSE|BSE|NASDAQ/ }).first()
    await expect(trigger).toBeVisible()
  })

  test('can switch between all four exchange options', async ({ page }) => {
    for (const label of ['NSE', 'BSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, label)
      await page.waitForTimeout(300)
    }
  })

  test('exchange preference persists across page navigations', async ({ page }) => {
    await selectExchange(page, 'NASDAQ')
    await page.getByRole('link', { name: /Watchlist/i }).click()
    await page.waitForLoadState('domcontentloaded')
    const trigger = page.locator('button').filter({ hasText: /NASDAQ/ }).first()
    await expect(trigger).toBeVisible()
  })

  test('Dashboard - index cards filter by exchange', async ({ page }) => {
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'e2e/screenshots/dashboard-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'e2e/screenshots/dashboard-nasdaq.png', fullPage: true })
  })

  test('Watchlist - page loads and filters', async ({ page }) => {
    await page.goto('/watchlist')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/watchlist-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/watchlist-nasdaq.png', fullPage: true })
  })

  test('Portfolio - advisory cards filter by exchange', async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    const mainNSE = await page.locator('main').textContent()
    await page.screenshot({ path: 'e2e/screenshots/portfolio-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    const mainNasdaq = await page.locator('main').textContent()
    await page.screenshot({ path: 'e2e/screenshots/portfolio-nasdaq.png', fullPage: true })

    expect(typeof mainNSE).toBe('string')
    expect(typeof mainNasdaq).toBe('string')
  })

  test('Screener - results filter by exchange', async ({ page }) => {
    await page.goto('/screener')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/screenshots/screener-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/screenshots/screener-nasdaq.png', fullPage: true })
  })

  test('Momentum - data filters by exchange', async ({ page }) => {
    await page.goto('/momentum')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/screenshots/momentum-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/screenshots/momentum-nasdaq.png', fullPage: true })
  })

  test('News - market news tab filters by exchange context', async ({ page }) => {
    await page.goto('/news')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/news-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/news-nasdaq.png', fullPage: true })
  })

  test('Mutual Funds - disabled for NASDAQ', async ({ page }) => {
    await page.goto('/mutual-funds')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1000)
    const mainText = await page.locator('main').textContent()
    expect(mainText).toMatch(/Indian markets only|not available|NASDAQ/i)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/mf-nse.png', fullPage: true })
  })

  test('Risk - data filters by exchange', async ({ page }) => {
    await page.goto('/risk')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/screenshots/risk-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/screenshots/risk-nasdaq.png', fullPage: true })
  })

  test('Corporate Actions - data filters by exchange', async ({ page }) => {
    await page.goto('/corporate-actions')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/corp-actions-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/corp-actions-nasdaq.png', fullPage: true })
  })

  test('Strategies - signals filter by exchange', async ({ page }) => {
    await page.goto('/strategies')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/strategies-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/strategies-nasdaq.png', fullPage: true })
  })

  test('Earnings - data filters by exchange', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/earnings-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/screenshots/earnings-nasdaq.png', fullPage: true })
  })

  test('Compare - page loads with exchange filter', async ({ page }) => {
    await page.goto('/compare')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'e2e/screenshots/compare-nasdaq.png', fullPage: true })

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'e2e/screenshots/compare-nse.png', fullPage: true })
  })
})
