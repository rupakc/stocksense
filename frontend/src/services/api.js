import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      const authStore = useAuthStore.getState()
      if (authStore.token) {
        authStore.logout()
        window.location.href = '/login?expired=true'
      }
    }
    return Promise.reject(error)
  }
)

// ── Response validation helpers ──────────────────────────────────────────────
function validateArray(data, label) {
  if (!Array.isArray(data)) {
    console.warn(`Expected array for ${label}, got:`, typeof data)
    return []
  }
  return data
}

function validateObject(data, label) {
  if (!data || typeof data !== 'object') {
    console.warn(`Expected object for ${label}, got:`, typeof data)
    return null
  }
  return data
}

// Auth
export const login = (username, password) =>
  api.post('/auth/login', { username, password }).then(r => r.data)
export const register = (username, password) =>
  api.post('/auth/register', { username, password }).then(r => r.data)
export const getProfile = () => api.get('/auth/me').then(r => validateObject(r.data, 'profile'))
export const changePassword = (currentPassword, newPassword) =>
  api.put('/auth/password', { current_password: currentPassword, new_password: newPassword }).then(r => r.data)

// Exchange registry + user preferences
export const getExchanges = () => api.get('/exchanges').then(r => validateArray(r.data, 'exchanges'))
export const getPreferences = () => api.get('/auth/preferences').then(r => r.data)
export const updatePreferences = (prefs) => api.put('/auth/preferences', prefs).then(r => r.data)

// Stocks
export const getWatchlist = () => api.get('/stocks/watchlist').then(r => validateArray(r.data, 'watchlist'))
export const addToWatchlist = (symbol, exchange = 'NSE') =>
  api.post('/stocks/watchlist', { symbol, exchange }).then(r => r.data)
export const removeFromWatchlist = (symbol) => api.delete(`/stocks/watchlist/${symbol}`)
export const getQuote = (symbol) => api.get(`/stocks/quote/${symbol}`).then(r => r.data)
export const getQuotesBatch = (symbols) =>
  api.get('/stocks/quotes', { params: { symbols: symbols.join(',') } }).then(r => r.data)
export const getHistory = (symbol, period = '1y') =>
  api.get(`/stocks/history/${symbol}`, { params: { period } }).then(r => r.data)
export const getIndices = (exchange = 'ALL') => api.get('/stocks/indices', { params: { exchange } }).then(r => r.data)
export const getMomentumData = () => api.get('/stocks/momentum').then(r => r.data)
export const getEarnings = () => api.get('/stocks/earnings').then(r => r.data)
export const getDividends = () => api.get('/stocks/dividends').then(r => r.data)

// Predictions
export const getPrediction = (symbol, horizonDays = 30) =>
  api.get(`/predictions/${symbol}`, { params: { horizon_days: horizonDays } })
    .then(r => r.data)
    .catch(e => {
      if (e.response?.status === 404) return null
      throw e
    })
export const triggerTraining = (symbol, horizonDays = 30) =>
  api.post('/predictions/train', { symbol, horizon_days: horizonDays }).then(r => r.data)
export const retrainAll = () =>
  api.post('/predictions/retrain-all').then(r => r.data)

// News
export const getNews = (symbol = null, limit = 20) =>
  api.get('/news/', { params: { symbol, limit } }).then(r => r.data)
export const getSentiment = (symbol) =>
  api.get(`/news/sentiment/${symbol}`).then(r => r.data)
export const searchWebNews = (symbol, limit = 25, exchange = 'NSE') =>
  api.get('/news/web-search', { params: { symbol, limit, exchange } }).then(r => r.data)

// Economic
export const getEconomicIndicators = () => api.get('/economic/indicators').then(r => r.data)
export const getForexRates = () => api.get('/economic/forex').then(r => r.data)

// Portfolio Advisor
export const getPortfolioAdvice = () => api.get('/portfolio/').then(r => validateArray(r.data, 'portfolio-advice'))

// Screener
export const screenStocks = (params) => api.get('/screener/scan', { params }).then(r => r.data)
export const getScreenerSectors = () => api.get('/screener/sectors').then(r => r.data)

// Symbol search (multi-exchange)
export const searchSymbols = (q, exchange = 'NSE') => api.get('/stocks/symbols', { params: { q, exchange } }).then(r => r.data)

// Trading Strategies
export const getStrategies = () => api.get('/strategies/').then(r => validateArray(r.data, 'strategies'))
export const getStrategySignals = (strategyId) => api.get(`/strategies/${strategyId}/signals`).then(r => r.data)
export const runBacktest = (strategyId, symbol, { lookbackDays = 365, startDate, endDate, params, includeCosts = true } = {}) => {
  // Use POST when custom params are provided, GET otherwise
  if (params && Object.keys(params).length > 0) {
    return api.post(`/strategies/${strategyId}/backtest/${symbol}`, {
      lookback_days: lookbackDays,
      start_date: startDate || null,
      end_date: endDate || null,
      params,
      include_costs: includeCosts,
    }).then(r => r.data)
  }
  const qp = { lookback_days: lookbackDays, include_costs: includeCosts }
  if (startDate) qp.start_date = startDate
  if (endDate) qp.end_date = endDate
  return api.get(`/strategies/${strategyId}/backtest/${symbol}`, { params: qp }).then(r => r.data)
}
export const compareStrategies = (symbol, lookbackDays = 365) =>
  api.get(`/strategies/compare/${symbol}`, { params: { lookback_days: lookbackDays } }).then(r => r.data)

// Risk Analysis
export const getRiskAnalysis = () => api.get('/portfolio/risk').then(r => r.data)

// Options
export const getOptionsChain = (symbol) => api.get(`/stocks/options/${symbol}`).then(r => r.data)

// Peer Comparison
export const compareStocks = (symbols) => api.get('/compare/', { params: { symbols } }).then(r => r.data)

// Tax Report
export const getTaxReport = (fy) => api.get('/tax/report', { params: { financial_year: fy } }).then(r => r.data)

// Corporate Actions
export const getCorporateActions = () => api.get('/corporate-actions/').then(r => r.data)
export const getSymbolCorporateActions = (symbol) => api.get(`/corporate-actions/${symbol}`).then(r => r.data)

// Alerts
export const getAlerts = () => api.get('/alerts/').then(r => validateArray(r.data, 'alerts'))
export const createAlert = (data) => api.post('/alerts/', data).then(r => r.data)
export const updateAlert = ({ id, ...data }) => api.put(`/alerts/${id}`, data).then(r => r.data)
export const deleteAlert = (id) => api.delete(`/alerts/${id}`)
export const checkAlerts = () => api.post('/alerts/check').then(r => r.data)
export const getTriggeredAlerts = () => api.get('/alerts/triggered').then(r => validateArray(r.data, 'triggered-alerts'))

// Mutual Fund Overlap
export const getMFOverlap = () => api.get('/mf/overlap').then(r => r.data)

export default api
