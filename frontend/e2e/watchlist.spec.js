import { test, expect } from '@playwright/test'
import { loginViaApi, authedApiGet } from './helpers.js'

test.describe('Watchlist Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/watchlist')
    await page.waitForLoadState('domcontentloaded')
  })

  test('watchlist page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Watchlist/i })).toBeVisible()
  })

  test('add stock input is visible', async ({ page }) => {
    const input = page.locator('input[type="text"]').first()
    await expect(input).toBeVisible()
  })

  test('watchlist API returns data', async ({ page }) => {
    const response = await authedApiGet(page, '/api/stocks/watchlist')
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('watchlist content renders', async ({ page }) => {
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body.length).toBeGreaterThan(50)
  })

  test('screenshot of watchlist page', async ({ page }) => {
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e/screenshots/watchlist.png', fullPage: true })
  })
})
