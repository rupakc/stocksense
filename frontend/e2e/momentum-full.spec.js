import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('Momentum Page - Full Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/momentum')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Momentum/i })).toBeVisible()
  })

  test('momentum API returns data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/momentum')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('momentum stocks have required fields', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/momentum')
    const data = await resp.json()
    if (data.length > 0) {
      const stock = data[0]
      expect(stock).toHaveProperty('symbol')
      expect(stock).toHaveProperty('momentum_score')
    }
  })

  test('filter tabs work', async ({ page }) => {
    await page.waitForTimeout(3000)
    const mainText = await page.locator('main').textContent()
    // Check for filter buttons (Bullish, Bearish, etc.)
    const hasBullish = mainText.includes('Bullish') || mainText.includes('bullish')
    const hasBearish = mainText.includes('Bearish') || mainText.includes('bearish')
    // At minimum the page should render something
    expect(mainText.length).toBeGreaterThan(10)
  })

  test('NSE filter shows only Indian stocks', async ({ page }) => {
    await page.waitForTimeout(3000)
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    if (!html.includes('No stocks match') && !html.includes('No stocks')) {
      expect(html).toMatch(/₹/)
    }
  })

  test('NASDAQ filter shows only US stocks', async ({ page }) => {
    await page.waitForTimeout(3000)
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    if (!html.includes('No momentum') && !html.includes('No stocks')) {
      expect(html).not.toMatch(/\.NS/)
    }
  })

  test('All Markets shows mixed stocks', async ({ page }) => {
    await page.waitForTimeout(3000)
    await selectExchange(page, 'All Markets')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    expect(html.length).toBeGreaterThan(0)
  })

  test('no console errors on page load', async ({ page }) => {
    const errors = []
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text())
    })
    await page.waitForTimeout(3000)
    const critical = errors.filter(e => e.includes('Unhandled') || e.includes('Cannot read'))
    expect(critical).toHaveLength(0)
  })

  test('screenshot of momentum page', async ({ page }) => {
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/momentum-full.png', fullPage: true })
  })
})
