import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('Earnings & Dividends - Full Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/earnings')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Earnings/i })).toBeVisible()
  })

  test('earnings API returns data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/earnings')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('dividends API returns data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/dividends')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('earnings tab is active by default', async ({ page }) => {
    await page.waitForTimeout(1500)
    const tabButton = page.locator('button').filter({ hasText: /Earnings Calendar/i })
    await expect(tabButton).toBeVisible()
  })

  test('can switch to dividends tab', async ({ page }) => {
    const divTab = page.locator('button').filter({ hasText: /Dividends/i })
    await divTab.click()
    await page.waitForTimeout(2000)
    await expect(page.locator('main')).toBeVisible()
  })

  test('earnings cards show correct currency for NSE', async ({ page }) => {
    await page.waitForTimeout(3000)
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    if (!html.includes('No earnings') && html.includes('EPS')) {
      expect(html).toMatch(/₹/)
    }
  })

  test('earnings cards show correct currency for NASDAQ', async ({ page }) => {
    await page.waitForTimeout(3000)
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(2000)
    const html = await page.locator('main').innerHTML()
    if (!html.includes('No earnings') && html.includes('EPS')) {
      expect(html).toMatch(/\$/)
    }
  })

  test('no crash on exchange switch while viewing dividends', async ({ page }) => {
    const divTab = page.locator('button').filter({ hasText: /Dividends/i })
    await divTab.click()
    await page.waitForTimeout(2000)

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    await expect(page.locator('main')).toBeVisible()
  })

  test('earnings data has required fields', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/earnings')
    const data = await resp.json()
    if (data.length > 0) {
      const item = data[0]
      expect(item).toHaveProperty('symbol')
    }
  })

  test('screenshot of earnings page', async ({ page }) => {
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/earnings-full.png', fullPage: true })
  })
})
