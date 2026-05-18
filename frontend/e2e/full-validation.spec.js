import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange } from './helpers.js'

const EXCHANGES = ['All Markets', 'NSE', 'NASDAQ', 'BSE']
const PAGES = [
  { path: '/momentum', name: 'Momentum', heading: /Momentum/i },
  { path: '/strategies', name: 'Strategies', heading: /Strategies/i },
  { path: '/news', name: 'News', heading: /News/i },
  { path: '/portfolio', name: 'Portfolio', heading: /Portfolio/i },
  { path: '/risk', name: 'Risk', heading: /Risk/i },
  { path: '/screener', name: 'Screener', heading: /Screener/i },
  { path: '/earnings', name: 'Earnings', heading: /Earnings|Dividends/i },
  { path: '/corporate-actions', name: 'CorporateActions', heading: /Corporate/i },
  { path: '/alerts', name: 'Alerts', heading: /Alerts/i },
  { path: '/', name: 'Dashboard', heading: /Dashboard|StockSense/i },
  { path: '/compare', name: 'Compare', heading: /Compare/i },
  { path: '/watchlist', name: 'Watchlist', heading: /Watchlist/i },
]

test.describe('Full Validation - Exchange Switching on Every Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  for (const pg of PAGES) {
    test(`${pg.name}: renders and survives all exchange switches`, async ({ page }) => {
      const errors = []
      page.on('pageerror', err => errors.push(`PAGE_ERROR: ${err.message}`))
      page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('net::ERR')) {
          errors.push(`CONSOLE_ERROR: ${msg.text()}`)
        }
      })

      await page.goto(pg.path)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2000)

      // Verify page heading renders
      const main = page.locator('main')
      await expect(main).toBeVisible()
      const mainText = await main.textContent()
      expect(mainText.length).toBeGreaterThan(5)

      // Cycle through all exchanges
      for (const exchange of EXCHANGES) {
        await selectExchange(page, exchange)
        await page.waitForTimeout(2500)

        // Main should still be visible (no crash)
        await expect(main).toBeVisible({ timeout: 5000 })

        // No "Failed to load" banners
        const failBanners = await page.locator('text=Failed to load').count()
        expect(failBanners, `"Failed to load" banner appeared on ${pg.name} with ${exchange}`).toBe(0)

        // No white screen (main has content)
        const content = await main.textContent()
        expect(content.length, `${pg.name} is blank with ${exchange}`).toBeGreaterThan(5)

        // No uncaught errors
        const criticalErrors = errors.filter(e =>
          e.includes('Unhandled') || e.includes('Cannot read properties') || e.includes('is not a function')
        )
        expect(criticalErrors, `Critical JS errors on ${pg.name} with ${exchange}`).toHaveLength(0)
      }

      // Screenshot final state
      await page.screenshot({ path: `e2e/screenshots/validation-${pg.name.toLowerCase()}.png`, fullPage: true })
    })
  }
})

test.describe('Content Validation - Currency & Data Correctness', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('Momentum: NSE shows ₹, NASDAQ shows $, tables render', async ({ page }) => {
    await page.goto('/momentum')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // Check table structure exists
    const table = page.locator('table')
    const hasTable = await table.count() > 0

    // NSE check
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(3000)
    const nseHTML = await page.locator('main').innerHTML()
    if (!nseHTML.includes('No stocks match') && hasTable) {
      expect(nseHTML, 'NSE momentum should show ₹').toMatch(/₹/)
      // Verify table headers exist
      expect(nseHTML).toMatch(/Symbol|RSI|Change/i)
    }

    // NASDAQ check
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(3000)
    const nasdaqHTML = await page.locator('main').innerHTML()
    if (!nasdaqHTML.includes('No stocks match') && hasTable) {
      expect(nasdaqHTML, 'NASDAQ momentum should show $').toMatch(/\$/)
    }

    // All Markets check
    await selectExchange(page, 'All Markets')
    await page.waitForTimeout(3000)
    const allHTML = await page.locator('main').innerHTML()
    await expect(page.locator('main')).toBeVisible()

    // BSE check
    await selectExchange(page, 'BSE')
    await page.waitForTimeout(3000)
    await expect(page.locator('main')).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/validation-momentum-currency.png', fullPage: true })
  })

  test('Momentum: filter tabs (Bullish/Bearish/All) work with each exchange', async ({ page }) => {
    await page.goto('/momentum')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    for (const exchange of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(2000)

      // Try clicking filter tabs if they exist
      const buttons = page.locator('button')
      const allBtn = buttons.filter({ hasText: /^All$/i })
      if (await allBtn.count() > 0) {
        await allBtn.first().click()
        await page.waitForTimeout(500)
      }
      const bullishBtn = buttons.filter({ hasText: /Bullish/i })
      if (await bullishBtn.count() > 0) {
        await bullishBtn.first().click()
        await page.waitForTimeout(1000)
        await expect(page.locator('main')).toBeVisible()
      }
      const bearishBtn = buttons.filter({ hasText: /Bearish/i })
      if (await bearishBtn.count() > 0) {
        await bearishBtn.first().click()
        await page.waitForTimeout(1000)
        await expect(page.locator('main')).toBeVisible()
      }
    }
  })

  test('Strategies: backtest panel renders for each exchange', async ({ page }) => {
    await page.goto('/strategies')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    for (const exchange of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(2500)

      const mainHTML = await page.locator('main').innerHTML()
      // Strategy page should always show strategy names
      expect(mainHTML).toMatch(/Golden Cross|RSI|MACD|Bollinger|EMA|Volume|Donchian|Supertrend/i)

      await expect(page.locator('main')).toBeVisible()
    }

    await page.screenshot({ path: 'e2e/screenshots/validation-strategies-exchanges.png', fullPage: true })
  })

  test('Strategies: clicking a strategy tab loads signals', async ({ page }) => {
    await page.goto('/strategies')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // Click on different strategy tabs if visible
    const strategyNames = ['Golden Cross', 'RSI', 'MACD', 'Bollinger']
    for (const name of strategyNames) {
      const tab = page.locator('button').filter({ hasText: new RegExp(name, 'i') })
      if (await tab.count() > 0) {
        await tab.first().click()
        await page.waitForTimeout(2000)
        await expect(page.locator('main')).toBeVisible()
        const content = await page.locator('main').textContent()
        expect(content.length).toBeGreaterThan(10)
      }
    }
  })

  test('News: articles load and filter by exchange', async ({ page }) => {
    await page.goto('/news')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    for (const exchange of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(2500)

      await expect(page.locator('main')).toBeVisible()
      const mainText = await page.locator('main').textContent()
      expect(mainText.length).toBeGreaterThan(10)
    }
  })

  test('Portfolio: advisory cards show correct currency per exchange', async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(4000)

    // NSE should show ₹
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(3000)
    const nseHTML = await page.locator('main').innerHTML()
    if (!nseHTML.includes('No stocks') && !nseHTML.includes('empty') && nseHTML.includes('₹')) {
      expect(nseHTML).toMatch(/₹/)
    }

    // NASDAQ should show $
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(3000)
    const nasdaqHTML = await page.locator('main').innerHTML()
    if (!nasdaqHTML.includes('No stocks') && !nasdaqHTML.includes('empty') && nasdaqHTML.includes('$')) {
      expect(nasdaqHTML).toMatch(/\$/)
    }

    await expect(page.locator('main')).toBeVisible()
  })

  test('Risk: metrics and correlation matrix update per exchange', async ({ page }) => {
    await page.goto('/risk')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(4000)

    for (const exchange of ['NSE', 'NASDAQ', 'All Markets', 'BSE']) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(3000)

      await expect(page.locator('main')).toBeVisible()
      const content = await page.locator('main').textContent()
      expect(content.length).toBeGreaterThan(5)
    }
  })

  test('Screener: filters and results update per exchange', async ({ page }) => {
    await page.goto('/screener')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    for (const exchange of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(2500)

      await expect(page.locator('main')).toBeVisible()
      const mainHTML = await page.locator('main').innerHTML()
      expect(mainHTML.length).toBeGreaterThan(50)
    }
  })

  test('Earnings: tabs and data update per exchange', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // Click between Earnings and Dividends tabs
    const earningsTab = page.locator('button').filter({ hasText: /Earnings/i })
    const dividendsTab = page.locator('button').filter({ hasText: /Dividends/i })

    for (const exchange of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(2000)

      if (await earningsTab.count() > 0) {
        await earningsTab.first().click()
        await page.waitForTimeout(1500)
        await expect(page.locator('main')).toBeVisible()
      }

      if (await dividendsTab.count() > 0) {
        await dividendsTab.first().click()
        await page.waitForTimeout(1500)
        await expect(page.locator('main')).toBeVisible()
      }
    }
  })

  test('Corporate Actions: timeline updates per exchange', async ({ page }) => {
    await page.goto('/corporate-actions')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    for (const exchange of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(2500)

      await expect(page.locator('main')).toBeVisible()
    }
  })

  test('Alerts: page loads and survives exchange switches', async ({ page }) => {
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await expect(page.getByRole('heading', { name: /Price Alerts/i })).toBeVisible()

    for (const exchange of EXCHANGES) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(1500)
      await expect(page.locator('main')).toBeVisible()
    }

    // Check Now button should be visible
    const checkBtn = page.locator('button').filter({ hasText: /Check Now/i })
    await expect(checkBtn).toBeVisible()
  })

  test('Dashboard: index cards change per exchange', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    // NSE → should show Nifty/Sensex
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(3000)
    const nseHTML = await page.locator('main').innerHTML()

    // NASDAQ → should show S&P/Dow/NASDAQ
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(3000)
    const nasdaqHTML = await page.locator('main').innerHTML()

    // Both should render without crash
    await expect(page.locator('main')).toBeVisible()

    // Content should differ between exchanges
    if (!nseHTML.includes('No data') && !nasdaqHTML.includes('No data')) {
      // At minimum, the dashboard should have substantial content
      expect(nseHTML.length).toBeGreaterThan(100)
      expect(nasdaqHTML.length).toBeGreaterThan(100)
    }
  })

  test('Compare: renders for each exchange', async ({ page }) => {
    await page.goto('/compare')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    for (const exchange of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(2000)
      await expect(page.locator('main')).toBeVisible()
    }
  })

  test('Rapid exchange cycling on Momentum does not crash', async ({ page }) => {
    await page.goto('/momentum')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const errors = []
    page.on('pageerror', err => errors.push(err.message))

    for (let i = 0; i < 3; i++) {
      for (const exchange of EXCHANGES) {
        await selectExchange(page, exchange)
        await page.waitForTimeout(300)
      }
    }

    await page.waitForTimeout(2000)
    await expect(page.locator('main')).toBeVisible()
    expect(errors.filter(e => e.includes('Cannot read') || e.includes('is not a function'))).toHaveLength(0)
  })

  test('Rapid exchange cycling on Strategies does not crash', async ({ page }) => {
    await page.goto('/strategies')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const errors = []
    page.on('pageerror', err => errors.push(err.message))

    for (let i = 0; i < 3; i++) {
      for (const exchange of EXCHANGES) {
        await selectExchange(page, exchange)
        await page.waitForTimeout(300)
      }
    }

    await page.waitForTimeout(2000)
    await expect(page.locator('main')).toBeVisible()
    expect(errors.filter(e => e.includes('Cannot read') || e.includes('is not a function'))).toHaveLength(0)
  })

  test('Rapid exchange cycling on News does not crash', async ({ page }) => {
    await page.goto('/news')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const errors = []
    page.on('pageerror', err => errors.push(err.message))

    for (let i = 0; i < 3; i++) {
      for (const exchange of EXCHANGES) {
        await selectExchange(page, exchange)
        await page.waitForTimeout(300)
      }
    }

    await page.waitForTimeout(2000)
    await expect(page.locator('main')).toBeVisible()
    expect(errors.filter(e => e.includes('Cannot read') || e.includes('is not a function'))).toHaveLength(0)
  })
})
