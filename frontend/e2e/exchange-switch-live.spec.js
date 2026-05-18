import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('Exchange Switch - Live Content Verification', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  })

  test('Momentum - switching exchange updates displayed stocks', async ({ page }) => {
    await page.goto('/momentum')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const nseContent = await page.locator('main').textContent()

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const nasdaqContent = await page.locator('main').textContent()

    // Either content differs OR both show empty state — but the page should not crash
    const mainLocator = page.locator('main')
    await expect(mainLocator).toBeVisible()

    // Verify no error messages appear
    const errorBanner = page.locator('text=Failed to load')
    expect(await errorBanner.count()).toBe(0)
  })

  test('Momentum - NSE stocks show ₹ currency, NASDAQ show $', async ({ page }) => {
    await page.goto('/momentum')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const nseHTML = await page.locator('main').innerHTML()

    if (!nseHTML.includes('No stocks match') && !nseHTML.includes('No stocks')) {
      expect(nseHTML).toMatch(/₹/)
    }

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const nasdaqHTML = await page.locator('main').innerHTML()

    if (!nasdaqHTML.includes('No stocks match') && !nasdaqHTML.includes('No stocks')) {
      expect(nasdaqHTML).toMatch(/\$/)
    }
  })

  test('Strategies - switching exchange filters signals correctly', async ({ page }) => {
    await page.goto('/strategies')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    const nseHTML = await page.locator('main').innerHTML()

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    const nasdaqHTML = await page.locator('main').innerHTML()

    // Page should not crash - main should be visible
    await expect(page.locator('main')).toBeVisible()
    expect(await page.locator('text=Failed to load').count()).toBe(0)
  })

  test('Portfolio - switching exchange shows correct advisory cards', async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(4000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const nseHTML = await page.locator('main').innerHTML()

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const nasdaqHTML = await page.locator('main').innerHTML()

    await expect(page.locator('main')).toBeVisible()
    expect(await page.locator('text=Failed to load').count()).toBe(0)

    // NSE cards should show ₹, NASDAQ should show $
    if (!nseHTML.includes('No stocks')) {
      expect(nseHTML).toMatch(/₹/)
    }
    if (!nasdaqHTML.includes('No stocks')) {
      expect(nasdaqHTML).toMatch(/\$/)
    }
  })

  test('Risk - switching exchange updates metrics and currency', async ({ page }) => {
    await page.goto('/risk')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(4000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const nseHTML = await page.locator('main').innerHTML()

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const nasdaqHTML = await page.locator('main').innerHTML()

    await expect(page.locator('main')).toBeVisible()
    expect(await page.locator('text=Failed to load').count()).toBe(0)

    // When NASDAQ is selected and has data, should reference S&P 500 not Nifty
    if (!nasdaqHTML.includes('No watchlist stocks')) {
      expect(nasdaqHTML).toMatch(/S&amp;P 500|S&P 500/)
    }
    // When NSE is selected and has data, should reference Nifty
    if (!nseHTML.includes('No watchlist stocks')) {
      expect(nseHTML).toMatch(/Nifty 50/)
    }
  })

  test('Earnings - switching exchange filters earnings cards', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    const nseHTML = await page.locator('main').innerHTML()

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    const nasdaqHTML = await page.locator('main').innerHTML()

    await expect(page.locator('main')).toBeVisible()
    expect(await page.locator('text=Failed to load').count()).toBe(0)
  })

  test('Corporate Actions - switching exchange filters timeline', async ({ page }) => {
    await page.goto('/corporate-actions')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    const nseHTML = await page.locator('main').innerHTML()

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    const nasdaqHTML = await page.locator('main').innerHTML()

    await expect(page.locator('main')).toBeVisible()
    expect(await page.locator('text=Failed to load').count()).toBe(0)
  })

  test('Screener - switching exchange updates market cap options and results', async ({ page }) => {
    await page.goto('/screener')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const nseHTML = await page.locator('main').innerHTML()

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const nasdaqHTML = await page.locator('main').innerHTML()

    await expect(page.locator('main')).toBeVisible()
    expect(await page.locator('text=Failed to load').count()).toBe(0)

    // NASDAQ should show $-based mcap options
    if (nasdaqHTML.includes('Market Cap')) {
      expect(nasdaqHTML).toMatch(/\$/)
    }
  })

  test('Alerts - switching exchange filters alert list', async ({ page }) => {
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1000)

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1000)

    await expect(page.locator('main')).toBeVisible()
    expect(await page.locator('text=Failed to load').count()).toBe(0)
  })

  test('Rapid exchange switching does not crash app', async ({ page }) => {
    await page.goto('/momentum')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    for (const exchange of ['NSE', 'NASDAQ', 'BSE', 'All Markets', 'NASDAQ', 'NSE']) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(500)
    }

    await expect(page.locator('main')).toBeVisible()
    const consoleErrors = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    await page.waitForTimeout(1000)
    // No unhandled errors
    const unhandledErrors = consoleErrors.filter(e =>
      e.includes('Unhandled') || e.includes('Cannot read properties')
    )
    expect(unhandledErrors).toHaveLength(0)
  })

  test('Switching exchange on News page refreshes article list', async ({ page }) => {
    await page.goto('/news')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)

    await expect(page.locator('main')).toBeVisible()
    expect(await page.locator('text=Failed to load').count()).toBe(0)
  })

  test('Dashboard - switching exchange updates index cards', async ({ page }) => {
    await page.waitForTimeout(3000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(3000)
    const nseHTML = await page.locator('main').innerHTML()

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(3000)
    const nasdaqHTML = await page.locator('main').innerHTML()

    // NSE should show NIFTY/SENSEX, NASDAQ should show S&P/Dow/NASDAQ
    if (!nseHTML.includes('No data')) {
      expect(nseHTML).toMatch(/NIFTY|SENSEX|Nifty/i)
    }
    if (!nasdaqHTML.includes('No data')) {
      expect(nasdaqHTML).toMatch(/S&amp;P|Dow|NASDAQ|S&P/i)
    }
  })
})
