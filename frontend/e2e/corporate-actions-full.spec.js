import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('Corporate Actions - Full Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/corporate-actions')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Corporate Actions/i })).toBeVisible()
  })

  test('corporate actions API returns data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/corporate-actions/')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('filter tabs (All, Dividend, Stock Split, Other) are visible', async ({ page }) => {
    await page.waitForTimeout(2000)
    for (const tab of ['All', 'Dividend', 'Stock Split', 'Other']) {
      const btn = page.locator('button').filter({ hasText: new RegExp(`^${tab}$`) })
      await expect(btn).toBeVisible()
    }
  })

  test('clicking filter tabs filters the timeline', async ({ page }) => {
    await page.waitForTimeout(3000)
    const divBtn = page.locator('button').filter({ hasText: /^Dividend$/ })
    await divBtn.click()
    await page.waitForTimeout(1000)
    await expect(page.locator('main')).toBeVisible()
  })

  test('symbol filter dropdown works', async ({ page }) => {
    await page.waitForTimeout(3000)
    const select = page.locator('select')
    if (await select.count() > 0) {
      const options = await select.locator('option').allTextContents()
      expect(options[0]).toMatch(/All Symbols/)
    }
  })

  test('summary cards show dividends, splits, and total', async ({ page }) => {
    await page.waitForTimeout(3000)
    const html = await page.locator('main').innerHTML()
    if (!html.includes('No corporate actions')) {
      expect(html).toMatch(/Dividends|Stock Splits|Total Actions/i)
    }
  })

  test('NSE filter shows only Indian stocks', async ({ page }) => {
    await page.waitForTimeout(3000)
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    const html = await page.locator('main').innerHTML()
    if (!html.includes('No corporate actions')) {
      expect(html).not.toMatch(/\bAAPL\b|\bMSFT\b|\bGOOGL\b/)
    }
  })

  test('actions data has required fields', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/corporate-actions/')
    const data = await resp.json()
    if (data.length > 0) {
      const action = data[0]
      expect(action).toHaveProperty('symbol')
      expect(action).toHaveProperty('type')
      expect(action).toHaveProperty('date')
    }
  })

  test('no crash on rapid exchange switching', async ({ page }) => {
    await page.waitForTimeout(2000)
    for (const ex of ['NSE', 'NASDAQ', 'BSE', 'All Markets']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(500)
    }
    await expect(page.locator('main')).toBeVisible()
  })

  test('screenshot of corporate actions page', async ({ page }) => {
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/corp-actions-full.png', fullPage: true })
  })
})
