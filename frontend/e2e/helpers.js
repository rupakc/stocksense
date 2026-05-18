/**
 * Shared helpers for StockSense e2e tests.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

/** Wait for the API response to be non-empty (useful for slow yfinance fetches). */
export async function waitForContent(page, selector, timeout = 15000) {
  await page.waitForSelector(selector, { state: 'visible', timeout })
}

/** Intercept API calls and assert they return 200. */
export async function expectApiOk(page, path) {
  const auth = readCachedAuth()
  const headers = auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}
  const response = await page.request.get(`http://localhost:8000${path}`, { headers })
  if (!response.ok()) {
    throw new Error(`API ${path} returned ${response.status()}`)
  }
  return response.json()
}

/** Make an authenticated API request. */
export async function authedApiGet(page, path) {
  const auth = readCachedAuth()
  const headers = auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}
  return page.request.get(`http://localhost:8000${path}`, { headers })
}

function readCachedAuth() {
  try {
    const data = readFileSync(resolve(import.meta.dirname, '.auth-token.json'), 'utf8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

/** Inject auth token into localStorage so the app loads authenticated. */
export async function loginViaApi(page, username = 'stocker', password = 'stockmulti@123') {
  let auth = readCachedAuth()

  if (!auth) {
    const resp = await page.request.post('http://localhost:8000/api/auth/login', {
      data: { username, password },
    })
    if (!resp.ok()) throw new Error(`Login failed: ${resp.status()}`)
    const body = await resp.json()
    auth = { token: body.access_token, username }
  }

  await page.addInitScript(({ token, username }) => {
    localStorage.setItem('stocksense-auth', JSON.stringify({
      state: { token, username },
      version: 0,
    }))
  }, auth)
}

/** Open the global exchange dropdown and select an exchange option. */
export async function selectExchange(page, label) {
  const trigger = page.locator('button').filter({ hasText: /All Markets|NSE|BSE|NASDAQ/ }).first()
  await trigger.click()
  await page.waitForTimeout(200)
  const dropdown = page.locator('.absolute.bg-white.border')
  await dropdown.getByRole('button', { name: new RegExp(label) }).click()
  await page.waitForTimeout(400)
}
