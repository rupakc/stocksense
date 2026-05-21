import { useQuery } from '@tanstack/react-query'
import { getMomentumData } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'
import { Activity, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Filter, RefreshCw, AlertCircle, Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'

// ── Formatting helpers ──────────────────────────────────────────────────────
function formatPrice(val, sym) {
  if (val === null) return '-'
  const c = (sym?.endsWith('.NS') || sym?.endsWith('.BO')) ? '₹' : '$'
  return `${c}${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatPct(val) {
  if (val === null) return '-'
  const sign = val > 0 ? '+' : ''
  return `${sign}${Number(val).toFixed(2)}%`
}

function formatScore(val) {
  if (val === null) return '-'
  return Number(val).toFixed(2)
}

// ── RSI color helpers ───────────────────────────────────────────────────────
function getRsiTileClasses(rsi) {
  if (rsi === null) return 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600'
  if (rsi > 80) return 'bg-red-600 border-red-700 text-white'
  if (rsi > 60) return 'bg-red-200 border-red-300 dark:bg-red-900/60 dark:border-red-800 dark:text-red-100'
  if (rsi >= 40) return 'bg-slate-200 border-slate-300 dark:bg-slate-600 dark:border-slate-500'
  if (rsi >= 20) return 'bg-emerald-200 border-emerald-300 dark:bg-emerald-900/60 dark:border-emerald-800 dark:text-emerald-100'
  return 'bg-emerald-600 border-emerald-700 text-white'
}

function getRsiTextClass(rsi) {
  if (rsi === null) return 'text-slate-500'
  if (rsi > 80) return 'text-white'
  if (rsi > 60) return 'text-red-800 dark:text-red-100'
  if (rsi >= 40) return 'text-slate-700 dark:text-slate-200'
  if (rsi >= 20) return 'text-emerald-800 dark:text-emerald-100'
  return 'text-white'
}

function getTrendBadge(trend) {
  if (!trend) return null
  const lower = trend.toLowerCase()
  if (lower === 'bullish') return { label: 'Bullish', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' }
  if (lower === 'bearish') return { label: 'Bearish', cls: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' }
  return { label: 'Neutral', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' }
}

// ── Filter definitions ──────────────────────────────────────────────────────
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'overbought', label: 'Overbought (RSI>70)' },
  { id: 'oversold', label: 'Oversold (RSI<30)' },
  { id: 'bullish', label: 'Bullish' },
  { id: 'bearish', label: 'Bearish' },
]

// ── Skeleton components ─────────────────────────────────────────────────────
function SkeletonSummary() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20 mb-3" />
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-28" />
        </div>
      ))}
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-4 h-28" />
      ))}
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 12 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
        </td>
      ))}
    </tr>
  )
}

// ── Sortable table header ───────────────────────────────────────────────────
function SortHeader({ label, colKey, sortCol, onClick, align = 'left' }) {
  const active = sortCol.key === colKey
  return (
    <th
      className={clsx(
        'px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      onClick={() => onClick(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortCol.asc ? <ArrowUp className="w-3 h-3 text-indigo-500" /> : <ArrowDown className="w-3 h-3 text-indigo-500" />
        ) : (
          <span className="w-3 h-3 inline-block opacity-30">-</span>
        )}
      </span>
    </th>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function Momentum() {
  const [activeFilter, setActiveFilter] = useState('all')
  const [sortCol, setSortCol] = useState({ key: 'rsi_14', asc: false })
  const globalExchange = useExchangeStore((s) => s.selected)
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)

  const { data: stocks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['momentum'],
    queryFn: getMomentumData,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  // ── Derived data ────────────────────────────────────────────────────────
  const filteredStocks = useMemo(() => {
    if (!stocks || !Array.isArray(stocks)) return []
    return stocks.filter(s => {
      if (!matchesSelected(s.symbol)) return false
      if (activeFilter === 'overbought') return s.rsi_14 > 70
      if (activeFilter === 'oversold') return s.rsi_14 < 30
      if (activeFilter === 'bullish') return s.trend?.toLowerCase() === 'bullish'
      if (activeFilter === 'bearish') return s.trend?.toLowerCase() === 'bearish'
      return true
    })
  }, [stocks, activeFilter, matchesSelected, globalExchange])

  const sortedStocks = useMemo(() => {
    if (!filteredStocks.length || !sortCol.key) return filteredStocks
    return [...filteredStocks].sort((a, b) => {
      let av = a[sortCol.key]
      let bv = b[sortCol.key]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortCol.asc ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      if (typeof av === 'boolean') av = av ? 1 : 0
      if (typeof bv === 'boolean') bv = bv ? 1 : 0
      av = av ?? -Infinity
      bv = bv ?? -Infinity
      return sortCol.asc ? av - bv : bv - av
    })
  }, [filteredStocks, sortCol])

  const exchangeFiltered = useMemo(() => {
    if (!stocks || !Array.isArray(stocks)) return []
    return stocks.filter(s => matchesSelected(s.symbol))
  }, [stocks, matchesSelected, globalExchange])

  const summary = useMemo(() => {
    if (!exchangeFiltered.length) return null
    const bullish = exchangeFiltered.filter(s => s.trend?.toLowerCase() === 'bullish').length
    const bearish = exchangeFiltered.filter(s => s.trend?.toLowerCase() === 'bearish').length
    const neutral = exchangeFiltered.length - bullish - bearish
    const avgRsi = exchangeFiltered.reduce((sum, s) => sum + (s.rsi_14 || 0), 0) / exchangeFiltered.length
    const sorted = [...exchangeFiltered].filter(s => s.rsi_14 !== null).sort((a, b) => b.rsi_14 - a.rsi_14)
    const mostOverbought = sorted[0] || null
    const mostOversold = sorted[sorted.length - 1] || null
    return { bullish, bearish, neutral, avgRsi, mostOverbought, mostOversold }
  }, [exchangeFiltered])

  function toggleSortCol(key) {
    setSortCol(prev =>
      prev.key === key ? { key, asc: !prev.asc } : { key, asc: false }
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Momentum / RSI Heatmap</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">RSI and momentum analysis across your watchlist</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Failed to load momentum data: {error?.message || 'Unknown error'}</span>
          <button
            onClick={() => refetch()}
            className="ml-auto text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-200 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Summary Bar ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <SkeletonSummary />
      ) : summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Trend counts */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Trend Breakdown</p>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{summary.bullish} Bullish</span>
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{summary.neutral} Neutral</span>
              <span className="text-sm font-semibold text-red-600 dark:text-red-400">{summary.bearish} Bearish</span>
            </div>
          </div>

          {/* Average RSI */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Average RSI</p>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.avgRsi.toFixed(1)}</p>
          </div>

          {/* Most Overbought */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Most Overbought</p>
            {summary.mostOverbought ? (
              <div className="flex items-center gap-2">
                <Link
                  to={`/stock/${summary.mostOverbought.symbol.replace(/\.(NS|BO)$/, '')}`}
                  className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200"
                >
                  {summary.mostOverbought.symbol.replace(/\.(NS|BO)$/, '')}
                </Link>
                <span className="text-sm font-bold text-red-600 dark:text-red-400">RSI {summary.mostOverbought.rsi_14?.toFixed(1)}</span>
              </div>
            ) : (
              <span className="text-sm text-slate-400">-</span>
            )}
          </div>

          {/* Most Oversold */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Most Oversold</p>
            {summary.mostOversold ? (
              <div className="flex items-center gap-2">
                <Link
                  to={`/stock/${summary.mostOversold.symbol.replace(/\.(NS|BO)$/, '')}`}
                  className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200"
                >
                  {summary.mostOversold.symbol.replace(/\.(NS|BO)$/, '')}
                </Link>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">RSI {summary.mostOversold.rsi_14?.toFixed(1)}</span>
              </div>
            ) : (
              <span className="text-sm text-slate-400">-</span>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400 dark:text-slate-500" />
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={clsx(
              'text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
              activeFilter === f.id
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700'
                : 'text-slate-500 border-slate-200 hover:bg-slate-50 dark:text-slate-400 dark:border-slate-600 dark:hover:bg-slate-700',
            )}
          >
            {f.label}
          </button>
        ))}
        {!isLoading && filteredStocks.length > 0 && (
          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
            {filteredStocks.length} stock{filteredStocks.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── RSI Heatmap Grid ─────────────────────────────────────────────── */}
      {isLoading ? (
        <SkeletonGrid />
      ) : filteredStocks.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center">
          <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-400 dark:text-slate-500">No stocks match this filter</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Try a different filter or add more stocks to your watchlist</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sortedStocks.map(stock => {
            const sym = stock.symbol.replace(/\.(NS|BO)$/, '')
            const trendBadge = getTrendBadge(stock.trend)
            return (
              <Link
                key={stock.symbol}
                to={`/stock/${sym}`}
                className={clsx(
                  'block rounded-xl border p-4 transition-all hover:shadow-md hover:scale-[1.02]',
                  getRsiTileClasses(stock.rsi_14),
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={clsx('text-sm font-bold', getRsiTextClass(stock.rsi_14))}>{sym}</span>
                  {trendBadge && (
                    <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', trendBadge.cls)}>
                      {trendBadge.label}
                    </span>
                  )}
                </div>
                <div className={clsx('text-2xl font-black mb-1', getRsiTextClass(stock.rsi_14))}>
                  {stock.rsi_14 !== null ? stock.rsi_14.toFixed(1) : '-'}
                </div>
                <div className="flex items-center justify-between">
                  <span className={clsx('text-xs font-medium opacity-80', getRsiTextClass(stock.rsi_14))}>RSI(14)</span>
                  <span className={clsx(
                    'text-xs font-semibold',
                    stock.change_1d > 0 ? 'text-emerald-700 dark:text-emerald-300' : stock.change_1d < 0 ? 'text-red-700 dark:text-red-300' : getRsiTextClass(stock.rsi_14),
                    // Override for tiles with white text
                    (stock.rsi_14 > 80 || stock.rsi_14 < 20) && (stock.change_1d > 0 ? 'text-emerald-200' : stock.change_1d < 0 ? 'text-red-200' : ''),
                  )}>
                    {formatPct(stock.change_1d)}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* ── Detailed Table ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto -mx-px">
          <div className="min-w-[640px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <SortHeader label="Symbol" colKey="symbol" sortCol={sortCol} onClick={toggleSortCol} />
                <SortHeader label="Name" colKey="name" sortCol={sortCol} onClick={toggleSortCol} />
                <SortHeader label="Price" colKey="price" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="RSI(14)" colKey="rsi_14" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="1D%" colKey="change_1d" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="1W%" colKey="change_1w" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="1M%" colKey="change_1m" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="3M%" colKey="change_3m" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <th className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-center whitespace-nowrap">SMA20</th>
                <th className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-center whitespace-nowrap">SMA50</th>
                <SortHeader label="Score" colKey="momentum_score" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="Trend" colKey="trend" sortCol={sortCol} onClick={toggleSortCol} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : sortedStocks.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-12 text-center text-slate-400 dark:text-slate-500">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No stocks match your criteria</p>
                    <p className="text-xs mt-1">Try adjusting your filters</p>
                  </td>
                </tr>
              ) : (
                sortedStocks.map(stock => <MomentumRow key={stock.symbol} stock={stock} />)
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Table row ───────────────────────────────────────────────────────────────
function MomentumRow({ stock }) {
  const sym = stock.symbol.replace(/\.(NS|BO)$/, '')
  const trendBadge = getTrendBadge(stock.trend)

  function changeCls(val) {
    if (val === null) return 'text-slate-500 dark:text-slate-400'
    if (val > 0) return 'text-emerald-600 dark:text-emerald-400'
    if (val < 0) return 'text-rose-600 dark:text-rose-400'
    return 'text-slate-500 dark:text-slate-400'
  }

  function rsiBgCls(rsi) {
    if (rsi === null) return ''
    if (rsi > 80) return 'bg-red-100 dark:bg-red-900/40'
    if (rsi > 70) return 'bg-red-50 dark:bg-red-900/20'
    if (rsi < 20) return 'bg-emerald-100 dark:bg-emerald-900/40'
    if (rsi < 30) return 'bg-emerald-50 dark:bg-emerald-900/20'
    return ''
  }

  return (
    <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors">
      <td className="px-3 py-3">
        <Link
          to={`/stock/${sym}`}
          className="font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors"
        >
          {sym}
        </Link>
      </td>
      <td className="px-3 py-3 text-slate-700 dark:text-slate-300 max-w-[100px] sm:max-w-[160px] truncate" title={stock.name}>
        {stock.name || '-'}
      </td>
      <td className="px-3 py-3 text-right font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
        {formatPrice(stock.price, stock.symbol)}
      </td>
      <td className={clsx('px-3 py-3 text-right font-bold whitespace-nowrap', rsiBgCls(stock.rsi_14))}>
        <span className={clsx(
          stock.rsi_14 > 70 ? 'text-red-700 dark:text-red-400' :
          stock.rsi_14 < 30 ? 'text-emerald-700 dark:text-emerald-400' :
          'text-slate-700 dark:text-slate-200',
        )}>
          {stock.rsi_14 !== null ? stock.rsi_14.toFixed(1) : '-'}
        </span>
      </td>
      <td className={clsx('px-3 py-3 text-right font-medium whitespace-nowrap', changeCls(stock.change_1d))}>
        {formatPct(stock.change_1d)}
      </td>
      <td className={clsx('px-3 py-3 text-right font-medium whitespace-nowrap', changeCls(stock.change_1w))}>
        {formatPct(stock.change_1w)}
      </td>
      <td className={clsx('px-3 py-3 text-right font-medium whitespace-nowrap', changeCls(stock.change_1m))}>
        {formatPct(stock.change_1m)}
      </td>
      <td className={clsx('px-3 py-3 text-right font-medium whitespace-nowrap', changeCls(stock.change_3m))}>
        {formatPct(stock.change_3m)}
      </td>
      <td className="px-3 py-3 text-center">
        {stock.above_sma20 !== null ? (
          stock.above_sma20 ? (
            <ArrowUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mx-auto" />
          ) : (
            <ArrowDown className="w-4 h-4 text-rose-500 dark:text-rose-400 mx-auto" />
          )
        ) : (
          <span className="text-slate-300 dark:text-slate-600">-</span>
        )}
      </td>
      <td className="px-3 py-3 text-center">
        {stock.above_sma50 !== null ? (
          stock.above_sma50 ? (
            <ArrowUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mx-auto" />
          ) : (
            <ArrowDown className="w-4 h-4 text-rose-500 dark:text-rose-400 mx-auto" />
          )
        ) : (
          <span className="text-slate-300 dark:text-slate-600">-</span>
        )}
      </td>
      <td className="px-3 py-3 text-right font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
        {formatScore(stock.momentum_score)}
      </td>
      <td className="px-3 py-3">
        {trendBadge ? (
          <span className={clsx('inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap', trendBadge.cls)}>
            {trendBadge.label}
          </span>
        ) : (
          <span className="text-slate-300 dark:text-slate-600">-</span>
        )}
      </td>
    </tr>
  )
}
