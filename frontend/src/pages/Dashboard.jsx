import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { getIndices, getWatchlist, getQuote, getQuotesBatch, getPrediction, retrainAll } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'
import clsx from 'clsx'
import {
  TrendingUp, TrendingDown, ArrowRight, Activity,
  Brain, RefreshCw, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Clock,
} from 'lucide-react'

const MARKET_CONFIGS = {
  NSE: { tz: 'Asia/Kolkata', open: 555, close: 930, label: 'IST' },
  BSE: { tz: 'Asia/Kolkata', open: 555, close: 930, label: 'IST' },
  NASDAQ: { tz: 'America/New_York', open: 570, close: 960, label: 'ET' },
}

function getMarketState(exchangeId, now) {
  const cfg = MARKET_CONFIGS[exchangeId]
  if (!cfg) return { status: 'Unknown', isOpen: false }
  const tzTime = new Date(now.toLocaleString('en-US', { timeZone: cfg.tz }))
  const day = tzTime.getDay()
  const timeMinutes = tzTime.getHours() * 60 + tzTime.getMinutes()
  const isWeekday = day >= 1 && day <= 5
  const isOpen = isWeekday && timeMinutes >= cfg.open && timeMinutes <= cfg.close
  const isPreMarket = isWeekday && timeMinutes >= cfg.open - 15 && timeMinutes < cfg.open
  const status = isOpen ? 'Open' : isPreMarket ? 'Pre-Market' : 'Closed'
  const formattedTime = tzTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  return { status, isOpen, isPreMarket, formattedTime, label: cfg.label }
}

function MarketStatus({ exchangeId }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const selected = exchangeId || useExchangeStore.getState().selected
  const exchanges = selected === 'ALL' ? ['NSE', 'NASDAQ'] : [selected]

  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      {exchanges.map(ex => {
        const s = getMarketState(ex, now)
        const color = s.isOpen ? 'text-emerald-600' : s.isPreMarket ? 'text-amber-600' : 'text-slate-400'
        const dotColor = s.isOpen ? 'bg-emerald-500' : s.isPreMarket ? 'bg-amber-500' : 'bg-slate-400'
        return (
          <div key={ex} className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor} ${s.isOpen ? 'animate-pulse' : ''}`} />
            <span className={`font-medium ${color}`}>{ex} {s.status}</span>
            <span className="text-slate-400 text-xs">· {s.label} {s.formattedTime}</span>
          </div>
        )
      })}
    </div>
  )
}

function LastUpdated({ dataUpdatedAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])
  if (!dataUpdatedAt) return null
  const ago = Math.floor((now - dataUpdatedAt) / 1000)
  const nextIn = Math.max(0, 60 - ago)
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
      <Clock className="w-3 h-3" />
      <span>Updated {ago}s ago · Next in {nextIn}s</span>
    </div>
  )
}

// ── Feature category metadata ────────────────────────────────────────────────
const FEATURE_CATEGORIES = {
  // Candlestick / OHLCV
  candle_body:          { label: 'Candle Body',     cat: 'Candlestick', color: 'bg-amber-100 text-amber-800   border-amber-200' },
  candle_range:         { label: 'Candle Range',    cat: 'Candlestick', color: 'bg-amber-100 text-amber-800   border-amber-200' },
  upper_shadow:         { label: 'Upper Shadow',    cat: 'Candlestick', color: 'bg-amber-100 text-amber-800   border-amber-200' },
  lower_shadow:         { label: 'Lower Shadow',    cat: 'Candlestick', color: 'bg-amber-100 text-amber-800   border-amber-200' },
  gap:                  { label: 'Gap',             cat: 'Candlestick', color: 'bg-amber-100 text-amber-800   border-amber-200' },
  doji_flag:            { label: 'Doji',            cat: 'Candlestick', color: 'bg-amber-100 text-amber-800   border-amber-200' },
  typical_price_return: { label: 'Typical Price',   cat: 'Candlestick', color: 'bg-amber-100 text-amber-800   border-amber-200' },
  vwap_ratio:           { label: 'VWAP Ratio',      cat: 'Candlestick', color: 'bg-amber-100 text-amber-800   border-amber-200' },
  hl_pct_52w_high:      { label: '52W High %',      cat: 'Candlestick', color: 'bg-amber-100 text-amber-800   border-amber-200' },
  volume_momentum:      { label: 'Vol Momentum',    cat: 'Candlestick', color: 'bg-amber-100 text-amber-800   border-amber-200' },
  // Technical
  rsi_14:               { label: 'RSI 14',          cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  macd_diff:            { label: 'MACD',            cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  bb_width:             { label: 'BB Width',        cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  bb_position:          { label: 'BB Position',     cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  atr_14:               { label: 'ATR 14',          cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  cci_20:               { label: 'CCI 20',          cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  stoch_k:              { label: 'Stoch %K',        cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  williams_r:           { label: 'Williams %R',     cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  mfi_14:               { label: 'MFI 14',          cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  obv_pct_change:       { label: 'OBV %',           cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  volume_ratio:         { label: 'Volume Ratio',    cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  return_1d:            { label: 'Return 1D',       cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  return_5d:            { label: 'Return 5D',       cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  return_20d:           { label: 'Return 20D',      cat: 'Technical',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  // Sentiment
  sentiment_7d:         { label: 'Sentiment 7D',    cat: 'Sentiment',   color: 'bg-purple-100 text-purple-800 border-purple-200' },
  sentiment_30d:        { label: 'Sentiment 30D',   cat: 'Sentiment',   color: 'bg-purple-100 text-purple-800 border-purple-200' },
  sentiment_momentum:   { label: 'Sent. Momentum',  cat: 'Sentiment',   color: 'bg-purple-100 text-purple-800 border-purple-200' },
  news_volume_7d:       { label: 'News Volume',     cat: 'Sentiment',   color: 'bg-purple-100 text-purple-800 border-purple-200' },
  // Macro
  usd_inr:              { label: 'USD/INR',         cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  crude_oil:            { label: 'Crude Oil',       cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  gold:                 { label: 'Gold',            cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  silver:               { label: 'Silver',          cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  copper:               { label: 'Copper',          cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  india_vix:            { label: 'India VIX',       cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  us_10y:               { label: 'US 10Y',          cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  dxy:                  { label: 'DXY',             cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  nifty50_return_1d:    { label: 'Nifty 1D',        cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  nifty50_return_5d:    { label: 'Nifty 5D',        cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  niftybank_return_1d:  { label: 'Bank Nifty 1D',   cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  niftybank_return_5d:  { label: 'Bank Nifty 5D',   cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  // US macro features (NASDAQ)
  eur_usd:              { label: 'EUR/USD',          cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  vix:                  { label: 'VIX',              cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  sp500_return_1d:      { label: 'S&P 500 1D',      cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  sp500_return_5d:      { label: 'S&P 500 5D',      cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  nasdaq100_return_1d:  { label: 'NASDAQ-100 1D',   cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  nasdaq100_return_5d:  { label: 'NASDAQ-100 5D',   cat: 'Macro',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
}

const CAT_COLORS = {
  Candlestick: 'bg-amber-50  text-amber-700  border-amber-200',
  Technical:   'bg-indigo-50 text-indigo-700 border-indigo-200',
  Sentiment:   'bg-purple-50 text-purple-700 border-purple-200',
  Macro:       'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function featureColor(key) {
  return FEATURE_CATEGORIES[key]?.color ?? 'bg-slate-100 text-slate-600 border-slate-200'
}

function featureLabel(key) {
  return FEATURE_CATEGORIES[key]?.label ?? key
}

// ── Sub-components ────────────────────────────────────────────────────────────
function IndexCard({ name, data }) {
  if (!data) return null
  const isUp = data.change >= 0
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{name}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">
        {data.current_price?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
      <div className={clsx('flex items-center gap-1 mt-1.5 text-sm font-semibold', isUp ? 'text-emerald-600' : 'text-rose-600')}>
        {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        {isUp ? '+' : ''}{data.change_pct?.toFixed(2)}%
      </div>
    </div>
  )
}

function currSym(symbol) {
  return (symbol?.endsWith('.NS') || symbol?.endsWith('.BO')) ? '₹' : '$'
}

function WatchlistRow({ symbol, preloadedQuote }) {
  const { data: quote } = useQuery({
    queryKey: ['quote', symbol],
    queryFn: () => getQuote(symbol),
    refetchInterval: 60000,
    initialData: preloadedQuote,
    staleTime: 30_000,
  })
  const isUp = (quote?.change ?? 0) >= 0

  return (
    <Link
      to={`/stock/${encodeURIComponent(symbol)}`}
      className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors group"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
          {symbol.replace(/\.(NS|BO)$/, '')}
        </p>
        <p className="text-xs text-slate-400 truncate max-w-[180px]">{quote?.name ?? '—'}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {quote ? (
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900 tabular-nums">{currSym(symbol)}{quote.current_price?.toFixed(2)}</p>
            <p className={clsx('text-xs font-medium tabular-nums', isUp ? 'text-emerald-600' : 'text-rose-600')}>
              {isUp ? '+' : ''}{quote.change_pct?.toFixed(2)}%
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 text-right">
            <div className="h-3.5 w-16 bg-slate-100 rounded animate-pulse" />
            <div className="h-3 w-10 bg-slate-100 rounded animate-pulse ml-auto" />
          </div>
        )}
        <ArrowRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  )
}

// ── ML Prediction card ────────────────────────────────────────────────────────
function PredictionCard({ symbol }) {
  const [showAllFeatures, setShowAllFeatures] = useState(false)

  const { data: pred, isLoading } = useQuery({
    queryKey: ['prediction', symbol],
    queryFn: () => getPrediction(symbol),
    staleTime: 10 * 60 * 1000,
    refetchInterval: (query) => query.state.data ? false : 30_000,
  })

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 animate-pulse h-52" />
    )
  }

  if (!pred) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center gap-2 h-52">
        <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
        <p className="text-xs text-slate-400 text-center">Training model<br />for {symbol.replace(/\.(NS|BO)$/, '')}</p>
        <p className="text-[10px] text-slate-300">Auto-refreshing every 30s</p>
      </div>
    )
  }

  const lastPred     = pred.predictions?.slice(-1)[0]
  const firstPred    = pred.predictions?.[0]
  // Compare final predicted close against today's price (not day-1 prediction) for a
  // meaningful projected-return figure. Fall back to firstPred if current_price is absent.
  const currentPrice = pred.current_price ?? firstPred?.predicted_close
  const ret7d        = lastPred && currentPrice
    ? ((lastPred.predicted_close - currentPrice) / currentPrice * 100)
    : null
  const isUp = (ret7d ?? 0) >= 0

  const features     = pred.features_used ?? []
  const PREVIEW_COUNT = 8
  const visible      = showAllFeatures ? features : features.slice(0, PREVIEW_COUNT)

  // Group by category for the legend dots
  const catCounts = features.reduce((acc, f) => {
    const cat = FEATURE_CATEGORIES[f]?.cat ?? 'Other'
    acc[cat] = (acc[cat] ?? 0) + 1
    return acc
  }, {})

  const confColor =
    pred.confidence === 'high'   ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
    pred.confidence === 'medium' ? 'text-amber-600   bg-amber-50   border-amber-200'   :
                                   'text-rose-600    bg-rose-50    border-rose-200'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to={`/stock/${encodeURIComponent(symbol)}`}
              className="font-bold text-slate-900 hover:text-indigo-600 transition-colors text-sm"
            >
              {symbol.replace(/\.(NS|BO)$/, '')}
            </Link>
            <p className="text-[10px] text-slate-400 mt-0.5">{pred.model_name} · {pred.horizon_days}d horizon</p>
          </div>
          <span className={clsx('text-[10px] font-semibold px-2 py-1 rounded-full border capitalize', confColor)}>
            {pred.confidence}
          </span>
        </div>

        {/* Predicted price + return */}
        {lastPred && (
          <div className="mt-3 flex items-end gap-3">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Target ({pred.horizon_days}d)</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{currSym(symbol)}{lastPred.predicted_close?.toFixed(2)}</p>
              <p className="text-[10px] text-slate-400 tabular-nums">
                {currSym(symbol)}{lastPred.lower_bound?.toFixed(0)} – {currSym(symbol)}{lastPred.upper_bound?.toFixed(0)}
              </p>
            </div>
            {ret7d !== null && (
              <div className={clsx('ml-auto text-right mb-1', isUp ? 'text-emerald-600' : 'text-rose-600')}>
                <p className="text-lg font-bold tabular-nums">
                  {isUp ? '+' : ''}{ret7d.toFixed(2)}%
                </p>
                <p className="text-[10px] font-medium">projected</p>
              </div>
            )}
          </div>
        )}

        {/* Accuracy */}
        {pred.metrics && (
          <div className="mt-3 flex gap-4 text-[10px] text-slate-500">
            <span>MAPE <span className="font-semibold text-slate-700">{pred.metrics.mape?.toFixed(2)}%</span></span>
            <span>MAE  <span className="font-semibold text-slate-700">{currSym(symbol)}{pred.metrics.mae?.toFixed(2)}</span></span>
            <span>RMSE <span className="font-semibold text-slate-700">{currSym(symbol)}{pred.metrics.rmse?.toFixed(2)}</span></span>
          </div>
        )}
      </div>

      {/* Features section */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
            Signals used ({features.length})
          </p>
          {/* Category legend */}
          <div className="flex items-center gap-2">
            {Object.entries(catCounts).map(([cat, n]) => (
              <span key={cat} className={clsx('text-[9px] font-semibold px-1.5 py-0.5 rounded border', CAT_COLORS[cat] ?? 'bg-slate-100 text-slate-500 border-slate-200')}>
                {cat[0]} {n}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {visible.map(f => (
            <span
              key={f}
              className={clsx('text-[10px] font-medium px-2 py-0.5 rounded-full border', featureColor(f))}
              title={FEATURE_CATEGORIES[f]?.cat}
            >
              {featureLabel(f)}
            </span>
          ))}
          {features.length > PREVIEW_COUNT && (
            <button
              onClick={() => setShowAllFeatures(v => !v)}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 flex items-center gap-0.5"
            >
              {showAllFeatures
                ? <><ChevronUp className="w-2.5 h-2.5" /> less</>
                : <><ChevronDown className="w-2.5 h-2.5" /> +{features.length - PREVIEW_COUNT} more</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Exchange grouping helpers ─────────────────────────────────────────────────
const EXCHANGE_META = {
  NSE:    { flag: '🇮🇳', label: 'NSE — India' },
  BSE:    { flag: '🇮🇳', label: 'BSE — India' },
  NASDAQ: { flag: '🇺🇸', label: 'NASDAQ — United States' },
}

function exchangeOf(symbol) {
  if (symbol?.endsWith('.NS')) return 'NSE'
  if (symbol?.endsWith('.BO')) return 'BSE'
  return 'NASDAQ'
}

function groupByExchange(items, keyFn = (s) => s.symbol) {
  const groups = {}
  for (const item of items) {
    const ex = exchangeOf(keyFn(item))
    ;(groups[ex] ??= []).push(item)
  }
  return groups
}

function ExchangeSectionHeader({ exchangeId }) {
  const meta = EXCHANGE_META[exchangeId] || { flag: '', label: exchangeId }
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-lg">{meta.flag}</span>
      <h3 className="text-sm font-bold text-slate-700">{meta.label}</h3>
      <div className="flex-1 h-px bg-slate-200" />
      <MarketStatus exchangeId={exchangeId} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const qc = useQueryClient()
  const [retrainStatus, setRetrainStatus] = useState(null) // null | 'running' | 'done' | 'error'
  const selectedExchange = useExchangeStore((s) => s.selected)
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)

  const { data: indices, dataUpdatedAt }   = useQuery({
    queryKey: ['indices', selectedExchange],
    queryFn: () => getIndices(selectedExchange),
    refetchInterval: 60000,
  })
  const { data: watchlist } = useQuery({ queryKey: ['watchlist'], queryFn: getWatchlist })

  const filteredWatchlist = watchlist?.filter(s => matchesSelected(s.symbol)) ?? []
  const symbolList = filteredWatchlist.map(s => s.symbol)
  const { data: batchQuotes } = useQuery({
    queryKey: ['quotes-batch', symbolList.join(',')],
    queryFn: () => getQuotesBatch(symbolList),
    enabled: symbolList.length > 0,
    refetchInterval: 60000,
    staleTime: 30_000,
  })

  const isGrouped = selectedExchange === 'ALL'
  const watchlistGroups = isGrouped ? groupByExchange(filteredWatchlist) : null

  const retrain = useMutation({
    mutationFn: retrainAll,
    onMutate:   () => setRetrainStatus('running'),
    onSuccess:  () => {
      setRetrainStatus('done')
      qc.invalidateQueries({ queryKey: ['prediction'] })
      setTimeout(() => qc.invalidateQueries({ queryKey: ['prediction'] }), 30000)
      setTimeout(() => qc.invalidateQueries({ queryKey: ['prediction'] }), 90000)
      setTimeout(() => setRetrainStatus(null), 6000)
    },
    onError: () => {
      setRetrainStatus('error')
      setTimeout(() => setRetrainStatus(null), 5000)
    },
  })

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Market Overview</h1>
          <div className="flex items-center gap-3 mt-1">
            <MarketStatus exchangeId={selectedExchange === 'ALL' ? null : selectedExchange} />
            <LastUpdated dataUpdatedAt={dataUpdatedAt} />
          </div>
        </div>
      </div>

      {/* ── Index cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {indices
          ? Object.entries(indices).map(([name, data]) => <IndexCard key={name} name={name} data={data} />)
          : Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm h-28 animate-pulse" />
            ))
        }
      </div>

      {/* ── Watchlist ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            <h2 className="font-semibold text-slate-800">Your Watchlist</h2>
            {filteredWatchlist.length > 0 && (
              <span className="text-xs text-slate-400">{filteredWatchlist.length} stocks</span>
            )}
          </div>
          <Link to="/watchlist" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
            Manage <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {!filteredWatchlist.length ? (
          <div className="p-10 text-center">
            <p className="text-sm text-slate-500">
              {watchlist?.length > 0
                ? 'No stocks in this exchange. Switch to "All Markets" or add stocks from this exchange.'
                : <>No stocks yet.{' '}<Link to="/watchlist" className="text-indigo-600 hover:underline font-medium">Add your first stock →</Link></>
              }
            </p>
          </div>
        ) : isGrouped ? (
          <div className="p-4 space-y-4">
            {Object.entries(watchlistGroups).map(([ex, stocks]) => (
              <div key={ex}>
                <ExchangeSectionHeader exchangeId={ex} />
                <div className="space-y-0">
                  {stocks.map((s) => <WatchlistRow key={s.symbol} symbol={s.symbol} preloadedQuote={batchQuotes?.[s.symbol]} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-2">
            {filteredWatchlist.map((s) => <WatchlistRow key={s.symbol} symbol={s.symbol} preloadedQuote={batchQuotes?.[s.symbol]} />)}
          </div>
        )}
      </div>

      {/* ── ML Predictions ── */}
      {filteredWatchlist.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-500" />
              <h2 className="font-semibold text-slate-800">ML Predictions</h2>
              <span className="text-xs text-slate-400">Prophet multi-signal model</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2">
                {[['Candlestick','bg-amber-100 text-amber-800 border-amber-200'],
                  ['Technical',  'bg-indigo-100 text-indigo-800 border-indigo-200'],
                  ['Sentiment',  'bg-purple-100 text-purple-800 border-purple-200'],
                  ['Macro',      'bg-emerald-100 text-emerald-800 border-emerald-200'],
                ].map(([cat, cls]) => (
                  <span key={cat} className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full border', cls)}>
                    {cat}
                  </span>
                ))}
              </div>
              <button
                onClick={() => retrain.mutate()}
                disabled={retrain.isPending || retrainStatus === 'running'}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-3 py-2 rounded-xl shadow-sm disabled:opacity-50 transition-all"
              >
                {retrainStatus === 'running'
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  : retrainStatus === 'done'
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  : retrainStatus === 'error'
                  ? <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  : <RefreshCw className="w-3.5 h-3.5" />
                }
                {retrainStatus === 'running' ? 'Training…'
                  : retrainStatus === 'done'  ? 'Queued!'
                  : retrainStatus === 'error' ? 'Error'
                  : 'Retrain All'
                }
              </button>
            </div>
          </div>

          {retrainStatus === 'running' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-700">
              Training in progress — predictions will update automatically. This may take a few minutes per symbol.
            </div>
          )}
          {retrainStatus === 'done' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
              Retraining queued for all {filteredWatchlist.length} symbol{filteredWatchlist.length > 1 ? 's' : ''}. Cards will refresh as each model completes.
            </div>
          )}

          {isGrouped ? (
            <div className="space-y-6">
              {Object.entries(groupByExchange(filteredWatchlist)).map(([ex, stocks]) => (
                <div key={ex}>
                  <ExchangeSectionHeader exchangeId={ex} />
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {stocks.map((s) => (
                      <PredictionCard key={s.symbol} symbol={s.symbol} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredWatchlist.map((s) => (
                <PredictionCard key={s.symbol} symbol={s.symbol} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
