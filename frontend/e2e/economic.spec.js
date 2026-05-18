import { test, expect } from '@playwright/test'
import { loginViaApi } from './helpers.js'

test.describe('Economic Indicators Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/economic')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Economic/i })).toBeVisible()
  })

  test('page loads without crash', async ({ page }) => {
    const body = await page.textContent('body')
    expect(body.length).toBeGreaterThan(50)
  })

  test('screenshot of economic page', async ({ page }) => {
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/screenshots/economic.png', fullPage: true })
  })
})
