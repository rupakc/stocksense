import { test, expect } from '@playwright/test'
import { loginViaApi, authedApiGet } from './helpers.js'

test.describe('Security Checks', () => {
  test('health endpoint has security headers', async ({ page }) => {
    const resp = await page.request.get('http://localhost:8000/health')
    expect(resp.headers()['x-content-type-options']).toBe('nosniff')
    expect(resp.headers()['x-frame-options']).toBe('DENY')
    expect(resp.headers()['x-xss-protection']).toBe('1; mode=block')
    expect(resp.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  test('API endpoints require authentication', async ({ page }) => {
    const resp = await page.request.get('http://localhost:8000/api/stocks/watchlist')
    expect(resp.status()).toBe(401)
  })

  test('invalid JWT returns 401', async ({ page }) => {
    const resp = await page.request.get('http://localhost:8000/api/stocks/watchlist', {
      headers: { Authorization: 'Bearer invalid-token-here' },
    })
    expect(resp.status()).toBe(401)
  })

  test('login rate limiting works', async ({ page }) => {
    const promises = []
    for (let i = 0; i < 12; i++) {
      promises.push(
        page.request.post('http://localhost:8000/api/auth/login', {
          data: { username: 'baduser', password: 'wrongpass' },
        })
      )
    }
    const results = await Promise.all(promises)
    const statuses = results.map(r => r.status())
    expect(statuses).toContain(429)
  })

  test('SQL injection in symbol parameter is rejected', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const resp = await authedApiGet(page, "/api/stocks/quote/'; DROP TABLE stocks;--")
    expect([400, 404, 422]).toContain(resp.status())
  })

  test('XSS payload in search parameter is safe', async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const resp = await authedApiGet(page, '/api/stocks/symbols?q=<script>alert(1)</script>')
    expect([200, 400, 422]).toContain(resp.status())
    if (resp.status() === 200) {
      const data = await resp.json()
      const text = JSON.stringify(data)
      expect(text).not.toContain('<script>')
    }
  })

  test('CORS headers are present', async ({ page }) => {
    const resp = await page.request.fetch('http://localhost:8000/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    })
    expect(resp.headers()['access-control-allow-origin']).toBeTruthy()
  })

  test('password validation rejects weak passwords', async ({ page }) => {
    const resp = await page.request.post('http://localhost:8000/api/auth/register', {
      data: { username: 'test_weak_pwd', password: '123' },
    })
    expect(resp.status()).toBe(422)
  })

  test('CSP header is present', async ({ page }) => {
    const resp = await page.request.get('http://localhost:8000/health')
    const csp = resp.headers()['content-security-policy']
    expect(csp).toBeTruthy()
    expect(csp).toContain("frame-ancestors 'none'")
  })

  test('permissions policy restricts APIs', async ({ page }) => {
    const resp = await page.request.get('http://localhost:8000/health')
    const pp = resp.headers()['permissions-policy']
    expect(pp).toContain('camera=()')
    expect(pp).toContain('microphone=()')
  })
})
