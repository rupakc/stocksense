import { test, expect } from '@playwright/test'
import { loginViaApi } from './helpers.js'

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('can navigate to main pages', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('link', { name: /Watchlist/i }).click()
    await expect(page).toHaveURL(/\/watchlist/)
    await expect(page.getByRole('heading', { name: /Watchlist/i })).toBeVisible()

    await page.getByRole('link', { name: /News/i }).click()
    await expect(page).toHaveURL(/\/news/)
    await expect(page.getByRole('heading', { name: /News/i })).toBeVisible()

    await page.getByRole('link', { name: /Dashboard/i }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: /Market Overview/i })).toBeVisible()
  })

  test('full app screenshot', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'e2e/screenshots/dashboard-full.png', fullPage: true })
  })
})
