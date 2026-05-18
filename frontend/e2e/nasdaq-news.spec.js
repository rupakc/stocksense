import { test, expect } from '@playwright/test'
import { loginViaApi, authedApiGet } from './helpers.js'

test.describe('NASDAQ News Search', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('web-search API returns articles for AAPL with NASDAQ exchange', async ({ page }) => {
    const response = await authedApiGet(
      page,
      `/api/news/web-search?symbol=AAPL&exchange=NASDAQ&limit=10`
    )
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(Array.isArray(data)).toBeTruthy()
    expect(data.length).toBeGreaterThan(0)
    const article = data[0]
    expect(article).toHaveProperty('title')
    expect(article).toHaveProperty('url')
    expect(article).toHaveProperty('sentiment_compound')
    expect(article).toHaveProperty('relevance_score')
  })

  test('web-search API returns articles for MSFT with NASDAQ exchange', async ({ page }) => {
    const response = await authedApiGet(
      page,
      `/api/news/web-search?symbol=MSFT&exchange=NASDAQ&limit=5`
    )
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(Array.isArray(data)).toBeTruthy()
    expect(data.length).toBeGreaterThan(0)
  })

  test('web-search still works for Indian stocks with NSE exchange', async ({ page }) => {
    const response = await authedApiGet(
      page,
      `/api/news/web-search?symbol=RELIANCE&exchange=NSE&limit=5`
    )
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(Array.isArray(data)).toBeTruthy()
    expect(data.length).toBeGreaterThan(0)
  })

  test('NASDAQ news articles have relevant content', async ({ page }) => {
    const response = await authedApiGet(
      page,
      `/api/news/web-search?symbol=AAPL&exchange=NASDAQ&limit=10`
    )
    const data = await response.json()
    if (data.length > 0) {
      const titles = data.map(a => a.title.toLowerCase()).join(' ')
      const relevant = titles.includes('apple') || titles.includes('aapl') ||
                       titles.includes('iphone') || titles.includes('tech') ||
                       titles.includes('stock')
      expect(relevant).toBeTruthy()
    }
  })
})
