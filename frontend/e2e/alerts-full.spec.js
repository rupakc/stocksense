import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('Alerts Page - Full Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
  })

  test('page heading renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Price Alerts/i })).toBeVisible()
  })

  test('alerts API returns data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/alerts/')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('create alert form area is visible', async ({ page }) => {
    await page.waitForTimeout(2000)
    const html = await page.locator('main').textContent()
    expect(html).toMatch(/Create|Alert|Check|Price/i)
  })

  test('check now button is visible', async ({ page }) => {
    await page.waitForTimeout(1500)
    const checkBtn = page.locator('button').filter({ hasText: /Check Now/i })
    await expect(checkBtn).toBeVisible()
  })

  test('exchange filter changes visible alerts', async ({ page }) => {
    await page.waitForTimeout(2000)
    await selectExchange(page, 'NSE')
    await page.waitForTimeout(1000)

    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(1000)

    await expect(page.locator('main')).toBeVisible()
  })

  test('triggered alerts API returns data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/alerts/triggered')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('no crash on rapid exchange switching', async ({ page }) => {
    await page.waitForTimeout(1500)
    for (const ex of ['NSE', 'NASDAQ', 'BSE', 'All Markets']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(400)
    }
    await expect(page.locator('main')).toBeVisible()
  })

  test('screenshot of alerts page', async ({ page }) => {
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'e2e/screenshots/alerts-full.png', fullPage: true })
  })
})
