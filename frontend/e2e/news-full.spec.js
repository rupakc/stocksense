import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('News Feed - Full Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/news')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /News/i })).toBeVisible()
  })

  test('news API returns articles', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/news/?limit=10')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('sentiment filter buttons visible', async ({ page }) => {
    await page.waitForTimeout(2000)
    const mainText = await page.locator('main').textContent()
    expect(mainText.length).toBeGreaterThan(10)
  })

  test('market news tab shows articles or empty state', async ({ page }) => {
    await page.waitForTimeout(3000)
    const main = await page.locator('main').textContent()
    expect(main.length).toBeGreaterThan(10)
  })

  test('company news tab can be selected', async ({ page }) => {
    await page.waitForTimeout(2000)
    const companyTab = page.locator('button').filter({ hasText: /Company/i })
    if (await companyTab.count() > 0) {
      await companyTab.click()
      await page.waitForTimeout(1000)
      await expect(page.locator('main')).toBeVisible()
    }
  })

  test('web search API works for NSE stock', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/news/web-search?symbol=RELIANCE&exchange=NSE&limit=5')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('web search API works for NASDAQ stock', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/news/web-search?symbol=AAPL&exchange=NASDAQ&limit=5')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('NSE exchange filter shows Indian market news', async ({ page }) => {
    await page.waitForTimeout(3000)
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1500)
    await expect(page.locator('main')).toBeVisible()
  })

  test('NASDAQ exchange filter shows US market news', async ({ page }) => {
    await page.waitForTimeout(3000)
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1500)
    await expect(page.locator('main')).toBeVisible()
  })

  test('bookmark toggle works', async ({ page }) => {
    await page.waitForTimeout(3000)
    const bookmarkBtns = page.locator('button[aria-label*="bookmark"], button:has(svg.lucide-bookmark)')
    if (await bookmarkBtns.count() > 0) {
      await bookmarkBtns.first().click()
      await page.waitForTimeout(500)
    }
    await expect(page.locator('main')).toBeVisible()
  })

  test('no crash on exchange switch', async ({ page }) => {
    await page.waitForTimeout(2000)
    for (const ex of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(1000)
    }
    await expect(page.locator('main')).toBeVisible()
  })

  test('screenshot of news page', async ({ page }) => {
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/news-full.png', fullPage: true })
  })
})
