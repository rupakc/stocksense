import { test, expect } from '@playwright/test'
import { loginViaApi, authedApiGet } from './helpers.js'

test.describe('Backend API Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  })

  // ── Auth ──────────────────────────────────────────────────────────────────
  test('health endpoint returns 200', async ({ page }) => {
    const resp = await page.request.get('http://localhost:8000/health')
    expect(resp.status()).toBe(200)
  })

  test('auth login with valid credentials returns token', async ({ page }) => {
    const resp = await page.request.post('http://localhost:8000/api/auth/login', {
      data: { username: 'stocker', password: 'stockmulti@123' },
    })
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('access_token')
  })

  test('auth login with invalid credentials returns 401', async ({ page }) => {
    const resp = await page.request.post('http://localhost:8000/api/auth/login', {
      data: { username: 'bad', password: 'bad' },
    })
    expect(resp.status()).toBe(401)
  })

  // ── Watchlist ─────────────────────────────────────────────────────────────
  test('GET /api/stocks/watchlist returns array', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/watchlist')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  // ── Indices ───────────────────────────────────────────────────────────────
  test('GET /api/stocks/indices returns data for NSE', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/indices?exchange=NSE')
    expect(resp.status()).toBe(200)
  })

  test('GET /api/stocks/indices returns data for NASDAQ', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/indices?exchange=NASDAQ')
    expect(resp.status()).toBe(200)
  })

  // ── Quotes ────────────────────────────────────────────────────────────────
  test('GET /api/stocks/quote/RELIANCE.NS returns quote', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/quote/RELIANCE.NS')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('symbol')
  })

  test('GET /api/stocks/quotes works with NSE symbols', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/quotes?symbols=RELIANCE.NS,TCS.NS')
    expect(resp.status()).toBe(200)
  })

  // ── History ───────────────────────────────────────────────────────────────
  test('GET /api/stocks/history/RELIANCE.NS returns OHLCV data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/history/RELIANCE.NS?period=1mo')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('close')
    }
  })

  // ── Momentum ──────────────────────────────────────────────────────────────
  test('GET /api/stocks/momentum returns array', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/momentum')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  // ── Portfolio ─────────────────────────────────────────────────────────────
  test('GET /api/portfolio/ returns array', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/portfolio/')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  // ── Risk ──────────────────────────────────────────────────────────────────
  test('GET /api/portfolio/risk returns risk data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/portfolio/risk')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('symbols')
    expect(data).toHaveProperty('risk_metrics')
    expect(data).toHaveProperty('correlation_matrix')
  })

  // ── Strategies ────────────────────────────────────────────────────────────
  test('GET /api/strategies/ returns strategies list', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET /api/strategies/golden_cross/backtest/RELIANCE.NS returns trades', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/golden_cross/backtest/RELIANCE.NS?lookback_days=365')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('total_trades')
  })

  test('GET /api/strategies/golden_cross/backtest/AAPL returns trades', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/golden_cross/backtest/AAPL?lookback_days=365')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('total_trades')
  })

  test('GET /api/strategies/compare/RELIANCE.NS returns results', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/compare/RELIANCE.NS?lookback_days=365')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('symbol')
    expect(data).toHaveProperty('strategies')
  })

  test('GET /api/strategies/compare/AAPL returns results', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/strategies/compare/AAPL?lookback_days=365')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(data).toHaveProperty('symbol')
    expect(data).toHaveProperty('strategies')
  })

  // ── Screener ──────────────────────────────────────────────────────────────
  test('GET /api/screener/scan returns stocks', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/screener/scan?limit=5')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET /api/screener/sectors returns sectors', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/screener/sectors')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  // ── Earnings ──────────────────────────────────────────────────────────────
  test('GET /api/stocks/earnings returns array', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/earnings')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET /api/stocks/dividends returns array', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/stocks/dividends')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  // ── Corporate Actions ─────────────────────────────────────────────────────
  test('GET /api/corporate-actions/ returns array', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/corporate-actions/')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  // ── News ──────────────────────────────────────────────────────────────────
  test('GET /api/news/ returns array', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/news/?limit=5')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET /api/news/web-search for NSE returns results', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/news/web-search?symbol=RELIANCE&exchange=NSE&limit=5')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET /api/news/web-search for NASDAQ returns results', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/news/web-search?symbol=AAPL&exchange=NASDAQ&limit=5')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  // ── Predictions ───────────────────────────────────────────────────────────
  test('GET /api/predictions/RELIANCE.NS returns prediction or 404', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/predictions/RELIANCE.NS')
    expect([200, 404, 422]).toContain(resp.status())
  })

  // ── Economic Indicators ───────────────────────────────────────────────────
  test('GET /api/economic/indicators returns data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/economic/indicators')
    expect(resp.status()).toBe(200)
  })

  test('GET /api/economic/forex returns data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/economic/forex')
    expect(resp.status()).toBe(200)
  })

  // ── Compare ───────────────────────────────────────────────────────────────
  test('GET /api/compare/ returns data', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/compare/?symbols=RELIANCE.NS,TCS.NS')
    expect(resp.status()).toBe(200)
  })

  // ── Exchanges ─────────────────────────────────────────────────────────────
  test('GET /api/exchanges returns exchange list', async ({ page }) => {
    const resp = await authedApiGet(page, '/api/exchanges')
    expect(resp.status()).toBe(200)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })
})
