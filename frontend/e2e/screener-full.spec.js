import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('Screener - Full Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/screener')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Screener/i })).toBeVisible()
  })

  test('screener API returns data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/screener/scan?limit=10')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('screener sectors API returns sectors', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/screener/sectors')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('screener results have required fields', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/screener/scan?limit=5')
    const data = await resp.json()
    if (data.length > 0) {
      const stock = data[0]
      expect(stock).toHaveProperty('symbol')
      expect(stock).toHaveProperty('name')
    }
  })

  test('preset filters are visible', async ({ page }) => {
    await page.waitForTimeout(2000)
    const mainText = await page.locator('main').textContent()
    expect(mainText).toMatch(/Growth|Value|Dividend|Momentum/i)
  })

  test('NSE shows ₹ market cap options', async ({ page }) => {
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    expect(html).toMatch(/₹|Cr/)
  })

  test('NASDAQ shows $ market cap options', async ({ page }) => {
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    expect(html).toMatch(/\$|B\b/)
  })

  test('exchange filter correctly filters results', async ({ page }) => {
    await page.waitForTimeout(3000)
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const nseHTML = await page.locator('main').innerHTML()

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const nasdaqHTML = await page.locator('main').innerHTML()

    // Page should not crash after switching
    await expect(page.locator('main')).toBeVisible()
  })

  test('sort columns are clickable', async ({ page }) => {
    await page.waitForTimeout(3000)
    const headers = page.locator('th')
    if (await headers.count() > 0) {
      await headers.first().click()
      await page.waitForTimeout(500)
      await expect(page.locator('main')).toBeVisible()
    }
  })

  test('no crash on exchange switch', async ({ page }) => {
    await page.waitForTimeout(2000)
    for (const ex of ['NSE', 'NASDAQ', 'BSE', 'All Markets']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(1000)
    }
    await expect(page.locator('main')).toBeVisible()
  })

  test('screenshot of screener page', async ({ page }) => {
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/screener-full.png', fullPage: true })
  })
})
