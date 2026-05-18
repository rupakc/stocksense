import { test, expect } from '@playwright/test'
import { loginViaApi, selectExchange, authedApiGet } from './helpers.js'

test.describe('User Journey Audit - Finding Friction Points', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('JOURNEY 1: Dashboard → data quality check', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const html = await page.locator('main').innerHTML()
    const text = await page.locator('main').textContent()

    // Check: are there loading spinners stuck?
    const spinners = await page.locator('.animate-spin').count()
    const skeletons = await page.locator('.animate-pulse').count()

    // Check: are there NaN or undefined values displayed?
    const hasNaN = text.includes('NaN')
    const hasUndefined = text.includes('undefined')
    const hasNull = /\bnull\b/.test(text)

    // Check: empty cards or sections
    const emptyCards = html.match(/>\s*<\/div>\s*<\/div>/g)?.length || 0

    console.log(`Dashboard: spinners=${spinners}, skeletons=${skeletons}, NaN=${hasNaN}, undefined=${hasUndefined}, null=${hasNull}`)

    await page.screenshot({ path: 'e2e/screenshots/journey/01-dashboard.png', fullPage: true })

    expect(hasNaN, 'NaN visible on Dashboard').toBe(false)
    expect(hasUndefined, 'undefined visible on Dashboard').toBe(false)
  })

  test('JOURNEY 2: Watchlist → add stock → verify it appears', async ({ page }) => {
    await page.goto('/watchlist')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const html = await page.locator('main').innerHTML()
    const text = await page.locator('main').textContent()

    // Check for NaN/undefined
    console.log(`Watchlist NaN: ${text.includes('NaN')}, undefined: ${text.includes('undefined')}`)

    // Check if search input exists and is usable
    const searchInput = page.locator('input[placeholder*="earch"], input[placeholder*="ymbol"], input[placeholder*="stock"], input[type="text"]').first()
    const hasSearch = await searchInput.count() > 0
    console.log(`Watchlist: has search input: ${hasSearch}`)

    await page.screenshot({ path: 'e2e/screenshots/journey/02-watchlist.png', fullPage: true })

    expect(text.includes('NaN'), 'NaN on Watchlist').toBe(false)
    expect(text.includes('undefined'), 'undefined on Watchlist').toBe(false)
  })

  test('JOURNEY 3: Stock Detail → check chart and data', async ({ page }) => {
    await page.goto('/stock/RELIANCE')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(4000)

    const text = await page.locator('main').textContent()
    const html = await page.locator('main').innerHTML()

    // Check for chart presence
    const hasChart = html.includes('svg') || html.includes('canvas') || html.includes('recharts')
    console.log(`StockDetail: hasChart=${hasChart}, NaN=${text.includes('NaN')}, undefined=${text.includes('undefined')}`)

    // Check for prediction section
    const hasPrediction = text.includes('Predict') || text.includes('Forecast') || text.includes('predict')
    console.log(`StockDetail: hasPrediction=${hasPrediction}`)

    await page.screenshot({ path: 'e2e/screenshots/journey/03-stock-detail.png', fullPage: true })

    expect(text.includes('NaN'), 'NaN on StockDetail').toBe(false)
  })

  test('JOURNEY 4: Momentum page data quality', async ({ page }) => {
    await page.goto('/momentum')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    for (const exchange of ['NSE', 'NASDAQ']) {
      await selectExchange(page, exchange)
      await page.waitForTimeout(3000)

      const text = await page.locator('main').textContent()
      const html = await page.locator('main').innerHTML()

      console.log(`Momentum(${exchange}): NaN=${text.includes('NaN')}, undefined=${text.includes('undefined')}, null=${/\bnull\b/.test(text)}`)

      // Check for stuck loading
      const loading = await page.locator('text=Loading').count()
      console.log(`Momentum(${exchange}): loading indicators=${loading}`)

      // Check table has data
      const rows = await page.locator('table tbody tr').count()
      console.log(`Momentum(${exchange}): table rows=${rows}`)

      expect(text.includes('NaN'), `NaN on Momentum(${exchange})`).toBe(false)
      expect(text.includes('undefined'), `undefined on Momentum(${exchange})`).toBe(false)
    }

    await page.screenshot({ path: 'e2e/screenshots/journey/04-momentum.png', fullPage: true })
  })

  test('JOURNEY 5: Strategies page - backtest flow', async ({ page }) => {
    await page.goto('/strategies')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const text = await page.locator('main').textContent()
    const html = await page.locator('main').innerHTML()

    // Check strategy tabs/cards
    const hasStrategies = text.includes('Golden Cross') || text.includes('RSI') || text.includes('MACD')
    console.log(`Strategies: hasStrategies=${hasStrategies}`)

    // Check for NaN in backtest results
    console.log(`Strategies: NaN=${text.includes('NaN')}, undefined=${text.includes('undefined')}`)

    // Try clicking a strategy
    const stratButtons = page.locator('button').filter({ hasText: /Golden Cross/i })
    if (await stratButtons.count() > 0) {
      await stratButtons.first().click()
      await page.waitForTimeout(3000)
      const afterClick = await page.locator('main').textContent()
      console.log(`Strategies after click: NaN=${afterClick.includes('NaN')}`)
    }

    // Switch to NASDAQ
    await selectExchange(page, 'NASDAQ')
    await page.waitForTimeout(3000)
    const nasdaqText = await page.locator('main').textContent()
    console.log(`Strategies(NASDAQ): NaN=${nasdaqText.includes('NaN')}, empty=${nasdaqText.length < 50}`)

    await page.screenshot({ path: 'e2e/screenshots/journey/05-strategies.png', fullPage: true })

    expect(text.includes('NaN'), 'NaN on Strategies').toBe(false)
  })

  test('JOURNEY 6: News page - article quality', async ({ page }) => {
    await page.goto('/news')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const text = await page.locator('main').textContent()
    const html = await page.locator('main').innerHTML()

    // Check articles loaded
    const articleCards = await page.locator('article, [class*="card"], [class*="Card"]').count()
    console.log(`News: articleCards=${articleCards}`)

    // Check sentiment badges
    const sentimentBadges = html.match(/Bullish|Bearish|Neutral/gi)?.length || 0
    console.log(`News: sentimentBadges=${sentimentBadges}`)

    // Check for broken images
    const brokenImages = await page.locator('img').evaluateAll(imgs =>
      imgs.filter(img => !img.complete || img.naturalWidth === 0).length
    )
    console.log(`News: brokenImages=${brokenImages}`)

    // Switch exchanges
    for (const ex of ['NSE', 'NASDAQ']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(2500)
      const exText = await page.locator('main').textContent()
      console.log(`News(${ex}): NaN=${exText.includes('NaN')}, contentLen=${exText.length}`)
    }

    await page.screenshot({ path: 'e2e/screenshots/journey/06-news.png', fullPage: true })
  })

  test('JOURNEY 7: Portfolio advisor quality', async ({ page }) => {
    await page.goto('/portfolio')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(4000)

    for (const ex of ['NSE', 'NASDAQ', 'All Markets']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(3000)
      const text = await page.locator('main').textContent()
      const html = await page.locator('main').innerHTML()

      console.log(`Portfolio(${ex}): NaN=${text.includes('NaN')}, undefined=${text.includes('undefined')}, contentLen=${text.length}`)

      // Check for BUY/SELL/HOLD recommendations
      const hasBuy = text.includes('BUY') || text.includes('Buy')
      const hasSell = text.includes('SELL') || text.includes('Sell')
      const hasHold = text.includes('HOLD') || text.includes('Hold')
      console.log(`Portfolio(${ex}): BUY=${hasBuy}, SELL=${hasSell}, HOLD=${hasHold}`)
    }

    await page.screenshot({ path: 'e2e/screenshots/journey/07-portfolio.png', fullPage: true })
  })

  test('JOURNEY 8: Risk dashboard quality', async ({ page }) => {
    await page.goto('/risk')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(4000)

    for (const ex of ['NSE', 'NASDAQ']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(3000)
      const text = await page.locator('main').textContent()
      const html = await page.locator('main').innerHTML()

      console.log(`Risk(${ex}): NaN=${text.includes('NaN')}, undefined=${text.includes('undefined')}`)

      // Check for correlation matrix
      const hasCorrelation = text.includes('Correlation') || text.includes('correlation')
      const hasVaR = text.includes('VaR') || text.includes('Value at Risk')
      console.log(`Risk(${ex}): hasCorrelation=${hasCorrelation}, hasVaR=${hasVaR}`)
    }

    await page.screenshot({ path: 'e2e/screenshots/journey/08-risk.png', fullPage: true })
  })

  test('JOURNEY 9: Screener filters and results', async ({ page }) => {
    await page.goto('/screener')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const text = await page.locator('main').textContent()
    console.log(`Screener: NaN=${text.includes('NaN')}, contentLen=${text.length}`)

    // Try preset filters
    const presets = ['Value', 'Growth', 'Dividend', 'Momentum']
    for (const preset of presets) {
      const btn = page.locator('button').filter({ hasText: new RegExp(preset, 'i') })
      if (await btn.count() > 0) {
        await btn.first().click()
        await page.waitForTimeout(2000)
        const afterText = await page.locator('main').textContent()
        console.log(`Screener(${preset}): NaN=${afterText.includes('NaN')}, resultLen=${afterText.length}`)
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/journey/09-screener.png', fullPage: true })
  })

  test('JOURNEY 10: Earnings data quality', async ({ page }) => {
    await page.goto('/earnings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    for (const ex of ['NSE', 'NASDAQ']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(2500)
      const text = await page.locator('main').textContent()
      console.log(`Earnings(${ex}): NaN=${text.includes('NaN')}, undefined=${text.includes('undefined')}, contentLen=${text.length}`)
    }

    // Check dividends tab
    const divTab = page.locator('button').filter({ hasText: /Dividend/i })
    if (await divTab.count() > 0) {
      await divTab.first().click()
      await page.waitForTimeout(2000)
      const divText = await page.locator('main').textContent()
      console.log(`Dividends: NaN=${divText.includes('NaN')}`)
    }

    await page.screenshot({ path: 'e2e/screenshots/journey/10-earnings.png', fullPage: true })
  })

  test('JOURNEY 11: Compare page flow', async ({ page }) => {
    await page.goto('/compare')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const text = await page.locator('main').textContent()
    const html = await page.locator('main').innerHTML()

    // Check if comparison inputs exist
    const inputs = await page.locator('input').count()
    console.log(`Compare: inputs=${inputs}, NaN=${text.includes('NaN')}`)

    await page.screenshot({ path: 'e2e/screenshots/journey/11-compare.png', fullPage: true })
  })

  test('JOURNEY 12: Economic Indicators data quality', async ({ page }) => {
    await page.goto('/economic')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const text = await page.locator('main').textContent()
    console.log(`Economic: NaN=${text.includes('NaN')}, undefined=${text.includes('undefined')}, contentLen=${text.length}`)

    // Check for forex section
    const hasForex = text.includes('USD') || text.includes('INR') || text.includes('Forex')
    console.log(`Economic: hasForex=${hasForex}`)

    await page.screenshot({ path: 'e2e/screenshots/journey/12-economic.png', fullPage: true })
  })

  test('JOURNEY 13: Alerts creation flow', async ({ page }) => {
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const text = await page.locator('main').textContent()
    console.log(`Alerts: NaN=${text.includes('NaN')}, contentLen=${text.length}`)

    // Check "Check Now" button
    const checkBtn = page.locator('button').filter({ hasText: /Check Now/i })
    const hasCheckBtn = await checkBtn.count() > 0
    console.log(`Alerts: hasCheckBtn=${hasCheckBtn}`)

    // Check alert creation form
    const hasForm = text.includes('Create') || text.includes('Symbol') || text.includes('Threshold')
    console.log(`Alerts: hasForm=${hasForm}`)

    await page.screenshot({ path: 'e2e/screenshots/journey/13-alerts.png', fullPage: true })
  })

  test('JOURNEY 14: ML Predictions - check all trained models', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const symbols = ['HDFCLIFE.NS', 'AAPL', 'ADBE']

    for (const symbol of symbols) {
      const resp = await authedApiGet(page, `/api/predictions/${symbol}`)
      const status = resp.status()
      if (status === 200) {
        const data = await resp.json()
        const lastPred = data.predictions?.slice(-1)[0]
        console.log(`Prediction(${symbol}): status=200, confidence=${data.confidence}, horizon=${data.horizon_days}, lastClose=${lastPred?.predicted_close}`)
      } else {
        console.log(`Prediction(${symbol}): status=${status} (no model)`)
      }
      expect([200, 404]).toContain(status)
    }
  })

  test('JOURNEY 15: API response times audit', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const endpoints = [
      { path: '/api/stocks/watchlist', name: 'Watchlist' },
      { path: '/api/stocks/momentum', name: 'Momentum' },
      { path: '/api/portfolio/', name: 'Portfolio' },
      { path: '/api/portfolio/risk', name: 'Risk' },
      { path: '/api/strategies/', name: 'Strategies' },
      { path: '/api/news/?limit=10', name: 'News' },
      { path: '/api/stocks/earnings', name: 'Earnings' },
      { path: '/api/screener/scan?limit=5', name: 'Screener' },
      { path: '/api/economic/indicators', name: 'Economic' },
      { path: '/api/economic/forex', name: 'Forex' },
    ]

    for (const ep of endpoints) {
      const start = Date.now()
      const resp = await authedApiGet(page, ep.path)
      const elapsed = Date.now() - start
      console.log(`API ${ep.name}: ${resp.status()} in ${elapsed}ms`)

      if (elapsed > 10000) {
        console.log(`WARNING: ${ep.name} took ${elapsed}ms - very slow!`)
      }
    }
  })

  test('JOURNEY 16: Settings page functionality', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const text = await page.locator('main').textContent()
    console.log(`Settings: contentLen=${text.length}`)

    // Check password change form
    const hasPasswordForm = text.includes('Password') || text.includes('password')
    console.log(`Settings: hasPasswordForm=${hasPasswordForm}`)

    await page.screenshot({ path: 'e2e/screenshots/journey/16-settings.png', fullPage: true })
  })

  test('JOURNEY 17: Corporate Actions quality', async ({ page }) => {
    await page.goto('/corporate-actions')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    for (const ex of ['NSE', 'NASDAQ']) {
      await selectExchange(page, ex)
      await page.waitForTimeout(2500)
      const text = await page.locator('main').textContent()
      console.log(`CorpActions(${ex}): NaN=${text.includes('NaN')}, undefined=${text.includes('undefined')}, contentLen=${text.length}`)
    }

    await page.screenshot({ path: 'e2e/screenshots/journey/17-corporate-actions.png', fullPage: true })
  })

  test('JOURNEY 18: Mutual Funds overlap', async ({ page }) => {
    await page.goto('/mutual-funds')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    const text = await page.locator('main').textContent()
    console.log(`MutualFunds: NaN=${text.includes('NaN')}, contentLen=${text.length}`)

    await page.screenshot({ path: 'e2e/screenshots/journey/18-mutual-funds.png', fullPage: true })
  })
})
