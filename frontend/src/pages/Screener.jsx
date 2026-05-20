import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  Search, Filter, ChevronDown, ChevronUp, ArrowUpDown,
  TrendingDown, TrendingUp, Sparkles, Shield, DollarSign,
  Target, Gem, X, RefreshCw, AlertCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { screenStocks, getScreenerSectors } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'

// ── Pre-built screener presets (exchange-aware for market-cap thresholds) ───
function getPresets(exchange) {
  const isUS = exchange === 'NASDAQ'
  return [
    {
      id: 'value',
      label: 'Value Picks',
      icon: Gem,
      color: 'indigo',
      description: 'P/E < 15, Dividend > 2%',
      params: { max_pe: 15, min_dividend_yield: 0.02 },
    },
    {
      id: 'growth',
      label: 'Growth Stocks',
      icon: TrendingUp,
      color: 'emerald',
      description: 'Revenue Growth > 15%, ROE > 15%',
      params: { min_roe: 0.15 },
    },
    {
      id: 'low_debt',
      label: 'Low Debt',
      icon: Shield,
      color: 'blue',
      description: isUS ? 'D/E < 0.5, MCap > $10B' : 'D/E < 0.5, MCap > 10,000 Cr',
      params: { max_debt_to_equity: 0.5, min_market_cap: isUS ? 10000000000 : 100000000000 },
    },
    {
      id: 'near_52w_low',
      label: 'Near 52W Low',
      icon: TrendingDown,
      color: 'amber',
      description: 'Within 10% of 52-week low',
      params: { near_52w_low_pct: 10 },
    },
    {
      id: 'high_dividend',
      label: 'High Dividend',
      icon: DollarSign,
      color: 'violet',
      description: 'Yield > 3%',
      params: { min_dividend_yield: 0.03 },
    },
    {
      id: 'blue_chips',
      label: 'Blue Chips',
      icon: Target,
      color: 'rose',
      description: isUS ? 'MCap > $200B' : 'MCap > 1,00,000 Cr',
      params: { min_market_cap: isUS ? 200000000000 : 1000000000000 },
    },
  ]
}

const PRESET_COLORS = {
  indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  blue:    'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  amber:   'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  violet:  'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100',
  rose:    'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
}

const PRESET_ACTIVE = {
  indigo:  'ring-2 ring-indigo-400 bg-indigo-100',
  emerald: 'ring-2 ring-emerald-400 bg-emerald-100',
  blue:    'ring-2 ring-blue-400 bg-blue-100',
  amber:   'ring-2 ring-amber-400 bg-amber-100',
  violet:  'ring-2 ring-violet-400 bg-violet-100',
  rose:    'ring-2 ring-rose-400 bg-rose-100',
}

const MCAP_OPTIONS_INR = [
  { label: 'All', value: null },
  { label: 'Small Cap (< 5,000 Cr)', value: null, max: 50000000000 },
  { label: 'Mid Cap (5,000 - 50,000 Cr)', value: 50000000000 },
  { label: 'Large Cap (> 50,000 Cr)', value: 500000000000 },
]

const MCAP_OPTIONS_USD = [
  { label: 'All', value: null },
  { label: 'Small Cap (< $2B)', value: null, max: 2000000000 },
  { label: 'Mid Cap ($2B - $10B)', value: 2000000000 },
  { label: 'Large Cap (> $10B)', value: 10000000000 },
]

const SORT_OPTIONS = [
  { value: 'market_cap', label: 'Market Cap' },
  { value: 'change_pct', label: 'Change %' },
  { value: 'pe_ratio', label: 'P/E Ratio' },
  { value: 'dividend_yield', label: 'Dividend Yield' },
  { value: 'roe', label: 'ROE' },
  { value: 'debt_to_equity', label: 'Debt/Equity' },
  { value: 'price', label: 'Price' },
]

// ── Formatting helpers ──────────────────────────────────────────────────────
function formatMarketCap(val, sym) {
  if (!val) return '-'
  const indian = sym?.endsWith('.NS') || sym?.endsWith('.BO')
  if (indian) {
    const cr = val / 10000000
    if (cr >= 100000) return `₹${(cr / 100000).toFixed(2)} L Cr`
    if (cr >= 1000) return `₹${(cr / 1000).toFixed(1)}K Cr`
    return `₹${Math.round(cr).toLocaleString('en-IN')} Cr`
  }
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
  return `$${val.toLocaleString('en-US')}`
}

function formatPct(val) {
  if (val === null) return '-'
  return `${(val * 100).toFixed(2)}%`
}

function formatNum(val, dec = 2) {
  if (val === null) return '-'
  return Number(val).toFixed(dec)
}

function formatPrice(val, sym) {
  if (val === null) return '-'
  const c = (sym?.endsWith('.NS') || sym?.endsWith('.BO')) ? '₹' : '$'
  return `${c}${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

// ── Skeleton row ────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 10 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-4 bg-slate-200 rounded w-full" />
        </td>
      ))}
    </tr>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function Screener() {
  const [filters, setFilters] = useState({})
  const [activePreset, setActivePreset] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState('market_cap')
  const [sortCol, setSortCol] = useState({ key: null, asc: true })

  const globalExchange = useExchangeStore((s) => s.selected)
  const MCAP_OPTIONS = globalExchange === 'NASDAQ' ? MCAP_OPTIONS_USD : MCAP_OPTIONS_INR
  const PRESETS = useMemo(() => getPresets(globalExchange), [globalExchange])

  // Custom filter state
  const [sector, setSector] = useState('')
  const [mcapTier, setMcapTier] = useState(0)
  const [maxPe, setMaxPe] = useState('')
  const [minDividend, setMinDividend] = useState('')
  const [minRoe, setMinRoe] = useState('')
  const [maxDe, setMaxDe] = useState('')
  const [near52Low, setNear52Low] = useState(false)
  const [near52High, setNear52High] = useState(false)

  // Build API params from filters — exchange is passed server-side so the
  // scan universe is scoped to the right market from the start.
  const queryParams = useMemo(() => {
    const p = { exchange: globalExchange, sort_by: sortBy, limit: 50, ...filters }
    if (sector) p.sector = sector
    if (mcapTier > 0) {
      p.min_market_cap = MCAP_OPTIONS[mcapTier].value
      if (MCAP_OPTIONS[mcapTier].max != null) p.max_market_cap = MCAP_OPTIONS[mcapTier].max
    }
    if (maxPe) p.max_pe = parseFloat(maxPe)
    if (minDividend) p.min_dividend_yield = parseFloat(minDividend) / 100
    if (minRoe) p.min_roe = parseFloat(minRoe) / 100
    if (maxDe) p.max_debt_to_equity = parseFloat(maxDe)
    if (near52Low) p.near_52w_low_pct = 10
    if (near52High) p.near_52w_high_pct = 5
    return p
  }, [filters, globalExchange, sector, mcapTier, maxPe, minDividend, minRoe, maxDe, near52Low, near52High, sortBy])

  const { data: stocks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['screener', queryParams],
    queryFn: () => screenStocks(queryParams),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const { data: sectors } = useQuery({
    queryKey: ['screener-sectors'],
    queryFn: getScreenerSectors,
    staleTime: 30 * 60 * 1000,
  })

  // Server already scopes results to the selected exchange; sort client-side only.
  const exchangeFiltered = useMemo(() => stocks ?? [], [stocks])

  const sortedStocks = useMemo(() => {
    if (!exchangeFiltered.length || !sortCol.key) return exchangeFiltered
    return [...exchangeFiltered].sort((a, b) => {
      const av = a[sortCol.key] ?? -Infinity
      const bv = b[sortCol.key] ?? -Infinity
      return sortCol.asc ? av - bv : bv - av
    })
  }, [exchangeFiltered, sortCol])

  function handlePreset(preset) {
    if (activePreset === preset.id) {
      setActivePreset(null)
      setFilters({})
    } else {
      setActivePreset(preset.id)
      setFilters(preset.params)
      // Reset custom filters when using preset
      setSector('')
      setMcapTier(0)
      setMaxPe('')
      setMinDividend('')
      setMinRoe('')
      setMaxDe('')
      setNear52Low(false)
      setNear52High(false)
    }
  }

  function applyCustomFilters() {
    setActivePreset(null)
    setFilters({})
  }

  function clearAll() {
    setActivePreset(null)
    setFilters({})
    setSector('')
    setMcapTier(0)
    setMaxPe('')
    setMinDividend('')
    setMinRoe('')
    setMaxDe('')
    setNear52Low(false)
    setNear52High(false)
  }

  function toggleSortCol(key) {
    setSortCol(prev =>
      prev.key === key ? { key, asc: !prev.asc } : { key, asc: false }
    )
  }

  const hasFilters = activePreset || sector || mcapTier > 0 || maxPe || minDividend || minRoe || maxDe || near52Low || near52High

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Screener</h1>
          <p className="text-sm text-slate-500 mt-1">Screen NSE & NASDAQ stocks by fundamental criteria</p>
        </div>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear filters
            </button>
          )}
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Preset screeners */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {PRESETS.map(preset => {
          const Icon = preset.icon
          const isActive = activePreset === preset.id
          return (
            <button
              key={preset.id}
              onClick={() => handlePreset(preset)}
              className={clsx(
                'text-left rounded-xl border p-3 transition-all duration-150',
                PRESET_COLORS[preset.color],
                isActive && PRESET_ACTIVE[preset.color],
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" />
                <span className="text-xs font-semibold">{preset.label}</span>
              </div>
              <p className="text-[11px] opacity-70 leading-tight">{preset.description}</p>
            </button>
          )
        })}
      </div>

      {/* Custom filters toggle */}
      <div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          <Filter className="w-4 h-4" />
          Custom Filters
          {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showFilters && (
          <div className="mt-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Sector */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sector</label>
                <select
                  value={sector}
                  onChange={e => { setSector(e.target.value); applyCustomFilters() }}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">All Sectors</option>
                  {(sectors || []).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Market Cap */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Market Cap</label>
                <select
                  value={mcapTier}
                  onChange={e => { setMcapTier(Number(e.target.value)); applyCustomFilters() }}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {MCAP_OPTIONS.map((opt, i) => (
                    <option key={i} value={i}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* P/E Max */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Max P/E Ratio</label>
                <input
                  type="number"
                  value={maxPe}
                  onChange={e => { setMaxPe(e.target.value); applyCustomFilters() }}
                  placeholder="e.g. 25"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {/* Dividend Yield Min */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Min Dividend Yield (%)</label>
                <input
                  type="number"
                  value={minDividend}
                  onChange={e => { setMinDividend(e.target.value); applyCustomFilters() }}
                  placeholder="e.g. 2"
                  step="0.5"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {/* ROE Min */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Min ROE (%)</label>
                <input
                  type="number"
                  value={minRoe}
                  onChange={e => { setMinRoe(e.target.value); applyCustomFilters() }}
                  placeholder="e.g. 15"
                  step="1"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {/* D/E Max */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Max Debt/Equity</label>
                <input
                  type="number"
                  value={maxDe}
                  onChange={e => { setMaxDe(e.target.value); applyCustomFilters() }}
                  placeholder="e.g. 1.0"
                  step="0.1"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {/* 52W Low toggle */}
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={near52Low}
                    onChange={e => { setNear52Low(e.target.checked); applyCustomFilters() }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-200"
                  />
                  <span className="text-sm text-slate-600">Near 52W Low (10%)</span>
                </label>
              </div>

              {/* 52W High toggle */}
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={near52High}
                    onChange={e => { setNear52High(e.target.checked); applyCustomFilters() }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-200"
                  />
                  <span className="text-sm text-slate-600">Near 52W High (5%)</span>
                </label>
              </div>
            </div>

            {/* Sort control */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-3">
              <label className="text-xs font-medium text-slate-500">Sort by:</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Failed to load screener results: {error?.message || 'Unknown error'}</span>
          <button
            onClick={() => refetch()}
            className="ml-auto text-xs font-medium text-rose-600 hover:text-rose-800 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results count */}
      {!isLoading && stocks && (
        <div className="text-xs text-slate-500">
          Showing {sortedStocks.length} stock{sortedStocks.length !== 1 ? 's' : ''}
          {activePreset && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-medium">
              <Sparkles className="w-3 h-3" />
              {PRESETS.find(p => p.id === activePreset)?.label}
            </span>
          )}
        </div>
      )}

      {/* Results table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <SortHeader label="Symbol" colKey="symbol" sortCol={sortCol} onClick={toggleSortCol} />
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sector</th>
                <SortHeader label="Price" colKey="price" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="Chg %" colKey="change_pct" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="MCap" colKey="market_cap" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="P/E" colKey="pe_ratio" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="P/B" colKey="pb_ratio" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="Div Yield" colKey="dividend_yield" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="ROE" colKey="roe" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="D/E" colKey="debt_to_equity" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <SortHeader label="EPS" colKey="eps" sortCol={sortCol} onClick={toggleSortCol} align="right" />
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">52W Range</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
              ) : sortedStocks.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-12 text-center text-slate-400">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No stocks match your criteria</p>
                    <p className="text-xs mt-1">Try adjusting your filters or using a different preset</p>
                  </td>
                </tr>
              ) : (
                sortedStocks.map(stock => (
                  <StockRow key={stock.symbol} stock={stock} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Sortable table header ───────────────────────────────────────────────────
function SortHeader({ label, colKey, sortCol, onClick, align = 'left' }) {
  const active = sortCol.key === colKey
  return (
    <th
      className={clsx(
        'px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 transition-colors whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      onClick={() => onClick(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortCol.asc ? <ChevronUp className="w-3 h-3 text-indigo-500" /> : <ChevronDown className="w-3 h-3 text-indigo-500" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  )
}

// ── Stock row ───────────────────────────────────────────────────────────────
function StockRow({ stock }) {
  const sym = stock.symbol.replace(/\.(NS|BO)$/, '')
  const chgPositive = stock.change_pct > 0
  const chgNegative = stock.change_pct < 0

  // 52W range bar
  const low = stock.fifty_two_week_low
  const high = stock.fifty_two_week_high
  const price = stock.price
  let rangePct = 0
  if (low !== null && high !== null && high > low && price !== null) {
    rangePct = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100))
  }

  return (
    <tr className="hover:bg-slate-50/70 transition-colors group">
      <td className="px-3 py-3">
        <Link
          to={`/stock/${sym}`}
          className="font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          {sym}
        </Link>
      </td>
      <td className="px-3 py-3 text-slate-700 max-w-[180px] truncate" title={stock.name}>
        {stock.name}
      </td>
      <td className="px-3 py-3">
        {stock.sector ? (
          <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 whitespace-nowrap">
            {stock.sector}
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        )}
      </td>
      <td className="px-3 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
        {formatPrice(stock.price, stock.symbol)}
      </td>
      <td className={clsx(
        'px-3 py-3 text-right font-medium whitespace-nowrap',
        chgPositive && 'text-emerald-600',
        chgNegative && 'text-rose-600',
        !chgPositive && !chgNegative && 'text-slate-500',
      )}>
        {stock.change_pct !== null ? `${stock.change_pct > 0 ? '+' : ''}${stock.change_pct.toFixed(2)}%` : '-'}
      </td>
      <td className="px-3 py-3 text-right text-slate-700 whitespace-nowrap">
        {formatMarketCap(stock.market_cap, stock.symbol)}
      </td>
      <td className="px-3 py-3 text-right text-slate-700">{formatNum(stock.pe_ratio)}</td>
      <td className="px-3 py-3 text-right text-slate-700">{formatNum(stock.pb_ratio)}</td>
      <td className="px-3 py-3 text-right text-slate-700">
        {stock.dividend_yield !== null ? formatPct(stock.dividend_yield) : '-'}
      </td>
      <td className={clsx(
        'px-3 py-3 text-right font-medium',
        stock.roe !== null && stock.roe >= 0.15 ? 'text-emerald-600' : 'text-slate-700',
      )}>
        {stock.roe !== null ? formatPct(stock.roe) : '-'}
      </td>
      <td className={clsx(
        'px-3 py-3 text-right font-medium',
        stock.debt_to_equity !== null && stock.debt_to_equity > 1 ? 'text-rose-600' : 'text-slate-700',
      )}>
        {formatNum(stock.debt_to_equity)}
      </td>
      <td className="px-3 py-3 text-right text-slate-700">{formatNum(stock.eps)}</td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        {low !== null && high !== null ? (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>{formatPrice(low, stock.symbol)}</span>
              <div className="w-16 h-1.5 bg-slate-200 rounded-full relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-indigo-400 rounded-full"
                  style={{ width: `${rangePct}%` }}
                />
              </div>
              <span>{formatPrice(high, stock.symbol)}</span>
            </div>
            {stock.pct_from_52w_high !== null && (
              <span className={clsx(
                'text-[10px] font-medium',
                Math.abs(stock.pct_from_52w_high) <= 5 ? 'text-emerald-600' : 'text-slate-400',
              )}>
                {stock.pct_from_52w_high != null ? stock.pct_from_52w_high.toFixed(1) : '--'}% from high
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-300">-</span>
        )}
      </td>
    </tr>
  )
}
