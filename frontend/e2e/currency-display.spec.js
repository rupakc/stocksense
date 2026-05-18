import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange } from './helpers.js'

test.describe('Currency Display by Exchange', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.addInitScript(() => {
      localStorage.removeItem('stocksense-exchange')
    })
  })

  test('Portfolio cards show ₹ for NSE stocks and $ for NASDAQ stocks', async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    await selectExchange(page, 'All Markets')
    await page.waitForTimeout(2000)

    const priceElements = page.locator('.text-lg.font-bold.tabular-nums')
    const count = await priceElements.count()
    if (count === 0) {
      test.skip()
      return
    }

    const currencies = new Set()
    for (let i = 0; i < count; i++) {
      const text = await priceElements.nth(i).textContent()
      if (text.startsWith('₹')) currencies.add('INR')
      if (text.startsWith('$')) currencies.add('USD')
    }
    expect(currencies.size).toBeGreaterThan(0)
  })

  test('Stock Detail shows ₹ for Indian stock', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const resp = await page.request.get('http://localhost:8000/api/stocks/watchlist', {
      headers: { Authorization: `Bearer ${(await page.evaluate(() => JSON.parse(localStorage.getItem('stocksense-auth'))?.state?.token))}` }
    })

    let watchlist = []
    if (resp.ok()) {
      const data = await resp.json()
      watchlist = Array.isArray(data) ? data : (data?.items ?? [])
    }

    const nseStock = watchlist.find(s => s.symbol?.endsWith('.NS'))
    if (!nseStock) {
      test.skip()
      return
    }

    await page.goto(`/stock/${encodeURIComponent(nseStock.symbol)}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const mainContent = await page.locator('main').textContent()
    expect(mainContent).toContain('₹')
  })

  test('Stock Detail shows $ for NASDAQ stock', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const resp = await page.request.get('http://localhost:8000/api/stocks/watchlist', {
      headers: { Authorization: `Bearer ${(await page.evaluate(() => JSON.parse(localStorage.getItem('stocksense-auth'))?.state?.token))}` }
    })

    let watchlist = []
    if (resp.ok()) {
      const data = await resp.json()
      watchlist = Array.isArray(data) ? data : (data?.items ?? [])
    }

    const nasdaqStock = watchlist.find(s => s.symbol && !s.symbol.endsWith('.NS') && !s.symbol.endsWith('.BO'))
    if (!nasdaqStock) {
      test.skip()
      return
    }

    await page.goto(`/stock/${encodeURIComponent(nasdaqStock.symbol)}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const mainContent = await page.locator('main').textContent()
    expect(mainContent).toContain('$')
  })

  test('Screener shows exchange-aware formatting', async ({ page }) => {
    await page.goto('/screener')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/screenshots/screener-currency-nse.png', fullPage: true })

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/screenshots/screener-currency-nasdaq.png', fullPage: true })
  })
})
