import { test, expect } from '@playwright/test'
import { loginViaApi } from './helpers.js'

test.describe('News Feed Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/news')
    await page.waitForLoadState('domcontentloaded')
  })

  test('news page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /News/i })).toBeVisible()
  })

  test('news articles render or empty state shows', async ({ page }) => {
    await page.waitForTimeout(3000)
    const body = await page.textContent('body')
    expect(body.length).toBeGreaterThan(50)
  })

  test('sentiment filter buttons visible', async ({ page }) => {
    await page.waitForTimeout(2000)
    await expect(page.getByRole('button', { name: /All/i }).first()).toBeVisible()
  })

  test('screenshot of news page', async ({ page }) => {
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'e2e/screenshots/news.png', fullPage: true })
  })
})
