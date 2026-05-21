import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Search, Loader2, Plus, X, TrendingUp, TrendingDown, Trophy, AlertTriangle, BarChart2 } from 'lucide-react'
import { searchSymbols, compareStocks } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']

function isIndian(sym) {
  return sym?.endsWith('.NS') || sym?.endsWith('.BO')
}

function curSym(sym) {
  return isIndian(sym) ? '₹' : '$'
}

function formatMarketCap(num, sym) {
  if (num === null) return '--'
  const c = curSym(sym)
  if (isIndian(sym)) {
    if (num >= 1e12) return `${c + (num / 1e7 / 1e5).toFixed(2)  }L Cr`
    if (num >= 1e7) return `${c + (num / 1e7).toFixed(2)  } Cr`
    if (num >= 1e5) return `${c + (num / 1e5).toFixed(2)  }L`
    return c + num.toLocaleString('en-IN')
  }
  if (num >= 1e12) return `${c + (num / 1e12).toFixed(2)  }T`
  if (num >= 1e9) return `${c + (num / 1e9).toFixed(2)  }B`
  if (num >= 1e6) return `${c + (num / 1e6).toFixed(2)  }M`
  return c + num.toLocaleString('en-US')
}

function fmtPct(val) {
  if (val === null) return '--'
  return `${(val * 100).toFixed(2)  }%`
}

function fmtNum(val, decimals = 2) {
  if (val === null) return '--'
  return Number(val).toFixed(decimals)
}

function shortName(sym) {
  return sym?.replace(/\.(NS|BO)$/, '') ?? sym
}

// ── Mini Symbol Search ───────────────────────────────────────────────────────

function MiniSymbolSearch({ onSelect, placeholder, exchange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const debouncedQ = useDebounce(query, 220)

  useEffect(() => {
    if (!debouncedQ.trim()) { setResults([]); setOpen(false); return }
    let cancelled = false
    setLoading(true)
    searchSymbols(debouncedQ, exchange || undefined)
      .then(data => { if (!cancelled) { setResults(data); setOpen(data.length > 0); setActiveIdx(-1) } })
      .catch(() => setResults([]))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedQ, exchange])

  useEffect(() => {
    function handle(e) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const choose = useCallback((item) => {
    onSelect(item.symbol)
    setQuery('')
    setResults([])
    setOpen(false)
  }, [onSelect])

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' && query.trim()) {
        onSelect(query.trim().toUpperCase())
        setQuery('')
      }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && results[activeIdx]) choose(results[activeIdx])
      else if (query.trim()) { onSelect(query.trim().toUpperCase()); setQuery('') }
    }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 bg-white border rounded-xl px-3 py-2 transition-all ${
        open ? 'border-indigo-400 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]' : 'border-slate-200 hover:border-slate-300 shadow-sm'
      }`}>
        {loading
          ? <Loader2 className="w-4 h-4 text-slate-400 shrink-0 animate-spin" />
          : <Search className="w-4 h-4 text-slate-400 shrink-0" />
        }
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 min-w-0"
          placeholder={placeholder || 'Search symbol...'}
          value={query}
          onChange={e => setQuery(e.target.value.toUpperCase())}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>

      {open && (
        <div ref={dropdownRef} className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <ul className="max-h-52 overflow-y-auto py-1">
            {results.map((item, idx) => (
              <li key={item.symbol}>
                <button
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                    idx === activeIdx ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                  onMouseDown={e => { e.preventDefault(); choose(item) }}
                  onMouseEnter={() => setActiveIdx(idx)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{item.symbol}</p>
                    <p className="text-xs text-slate-400 truncate">{item.name}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0 ${
                    item.exchange === 'NASDAQ' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}>{item.exchange || 'NSE'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Price Comparison Chart ───────────────────────────────────────────────────

function PriceComparisonChart({ stocks }) {
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const width = 700, height = 350, pad = { top: 20, right: 20, bottom: 40, left: 55 }
  const cw = width - pad.left - pad.right
  const ch = height - pad.top - pad.bottom

  const { allDates, series, yMin, yMax } = useMemo(() => {
    const dateSet = new Set()
    const ser = stocks.map((s, i) => {
      const map = {}
      for (const pt of s.price_history || []) {
        map[pt.date] = pt.pct_change
        dateSet.add(pt.date)
      }
      return { symbol: s.symbol, name: s.name, color: COLORS[i % COLORS.length], map }
    })
    const dates = [...dateSet].sort()
    let mn = 0, mx = 0
    for (const s of ser) {
      for (const d of dates) {
        const v = s.map[d]
        if (v !== null) { mn = Math.min(mn, v); mx = Math.max(mx, v) }
      }
    }
    const margin = Math.max(Math.abs(mx - mn) * 0.1, 2)
    return { allDates: dates, series: ser, yMin: mn - margin, yMax: mx + margin }
  }, [stocks])

  if (allDates.length < 2) return null

  const xScale = (i) => pad.left + (i / (allDates.length - 1)) * cw
  const yScale = (v) => pad.top + ch - ((v - yMin) / (yMax - yMin)) * ch

  const paths = series.map(s => {
    const points = []
    for (let i = 0; i < allDates.length; i++) {
      const v = s.map[allDates[i]]
      if (v !== null) points.push(`${i === 0 || points.length === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`)
    }
    return { ...s, d: points.join(' ') }
  })

  // Y-axis ticks
  const yTicks = []
  const yStep = Math.max(Math.ceil((yMax - yMin) / 6), 1)
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(v)

  // X-axis ticks (show ~6 dates)
  const xStep = Math.max(Math.floor(allDates.length / 6), 1)
  const xTicks = []
  for (let i = 0; i < allDates.length; i += xStep) xTicks.push(i)

  const handleMouseMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = rect.width / width
    const mx = (e.clientX - rect.left) / scaleX
    const idx = Math.round(((mx - pad.left) / cw) * (allDates.length - 1))
    if (idx < 0 || idx >= allDates.length) { setTooltip(null); return }
    const date = allDates[idx]
    const vals = series.map(s => ({ symbol: s.symbol, name: s.name, color: s.color, val: s.map[date] }))
    setTooltip({ x: xScale(idx), date, vals })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">Price Performance (1Y, % Change)</h3>
      <div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          className="max-w-[700px]"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Grid */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={pad.left} x2={width - pad.right} y1={yScale(v)} y2={yScale(v)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={pad.left - 8} y={yScale(v) + 4} textAnchor="end" className="text-[10px] fill-slate-400">{v}%</text>
            </g>
          ))}
          {/* Zero line */}
          <line x1={pad.left} x2={width - pad.right} y1={yScale(0)} y2={yScale(0)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4,3" />

          {/* X ticks */}
          {xTicks.map(i => (
            <text key={i} x={xScale(i)} y={height - 8} textAnchor="middle" className="text-[10px] fill-slate-400">
              {allDates[i]?.slice(5)}
            </text>
          ))}

          {/* Lines */}
          {paths.map(p => (
            <path key={p.symbol} d={p.d} fill="none" stroke={p.color} strokeWidth={2} strokeLinejoin="round" />
          ))}

          {/* Tooltip line */}
          {tooltip && (
            <line x1={tooltip.x} x2={tooltip.x} y1={pad.top} y2={pad.top + ch} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3" />
          )}
        </svg>
      </div>

      {/* Tooltip card */}
      {tooltip && (
        <div className="mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
          <p className="font-semibold text-slate-600 mb-1">{tooltip.date}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {tooltip.vals.map(v => (
              <span key={v.symbol} style={{ color: v.color }} className="font-medium">
                {shortName(v.symbol)}: {v.val !== null ? `${v.val.toFixed(2)  }%` : '--'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3">
        {series.map(s => (
          <div key={s.symbol} className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-slate-600 font-medium">{shortName(s.symbol)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Radar Chart ──────────────────────────────────────────────────────────────

function RadarChart({ stocks }) {
  const metrics = [
    { key: 'roe', label: 'ROE', higher_better: true },
    { key: 'profit_margin', label: 'Margin', higher_better: true },
    { key: 'revenue_growth', label: 'Growth', higher_better: true },
    { key: 'dividend_yield', label: 'Yield', higher_better: true },
    { key: 'pe_ratio', label: 'Value', higher_better: false },
    { key: 'debt_to_equity', label: 'Low Debt', higher_better: false },
  ]

  const cx = 180, cy = 170, r = 120
  const levels = 5

  // Normalize each metric to 0-100
  const normalized = useMemo(() => {
    return stocks.map((s, si) => {
      const vals = metrics.map(m => {
        const raw = s[m.key]
        if (raw === null) return 50 // neutral default
        const allVals = stocks.map(st => st[m.key]).filter(v => v !== null)
        if (allVals.length < 2) return 50
        const min = Math.min(...allVals)
        const max = Math.max(...allVals)
        if (max === min) return 50
        let norm = ((raw - min) / (max - min)) * 100
        if (!m.higher_better) norm = 100 - norm
        return Math.max(5, Math.min(95, norm))
      })
      return { symbol: s.symbol, color: COLORS[si % COLORS.length], vals }
    })
  }, [stocks])

  const angle = (i) => (Math.PI * 2 * i / metrics.length) - Math.PI / 2
  const px = (i, pct) => cx + Math.cos(angle(i)) * r * (pct / 100)
  const py = (i, pct) => cy + Math.sin(angle(i)) * r * (pct / 100)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">Key Metrics Comparison</h3>
      <div className="flex justify-center">
        <svg viewBox="0 0 360 360" width="100%" className="max-w-[360px]">
          {/* Grid levels */}
          {Array.from({ length: levels }, (_, li) => {
            const pct = ((li + 1) / levels) * 100
            const pts = metrics.map((_, i) => `${px(i, pct).toFixed(1)},${py(i, pct).toFixed(1)}`).join(' ')
            return <polygon key={li} points={pts} fill="none" stroke="#e2e8f0" strokeWidth={1} />
          })}

          {/* Axis lines */}
          {metrics.map((m, i) => (
            <line key={i} x1={cx} y1={cy} x2={px(i, 100)} y2={py(i, 100)} stroke="#e2e8f0" strokeWidth={1} />
          ))}

          {/* Data polygons */}
          {normalized.map(n => {
            const pts = n.vals.map((v, i) => `${px(i, v).toFixed(1)},${py(i, v).toFixed(1)}`).join(' ')
            return (
              <g key={n.symbol}>
                <polygon points={pts} fill={n.color} fillOpacity={0.12} stroke={n.color} strokeWidth={2} />
                {n.vals.map((v, i) => (
                  <circle key={i} cx={px(i, v)} cy={py(i, v)} r={3} fill={n.color} />
                ))}
              </g>
            )
          })}

          {/* Labels */}
          {metrics.map((m, i) => {
            const lx = px(i, 118)
            const ly = py(i, 118)
            return (
              <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="text-[11px] fill-slate-600 font-medium">
                {m.label}
              </text>
            )
          })}
        </svg>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-3">
        {normalized.map(n => (
          <div key={n.symbol} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: n.color }} />
            <span className="text-xs text-slate-600 font-medium">{shortName(n.symbol)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Fundamentals Table ───────────────────────────────────────────────────────

const METRIC_CATEGORIES = [
  {
    label: 'Valuation',
    metrics: [
      { key: 'pe_ratio', label: 'P/E Ratio', fmt: fmtNum },
      { key: 'forward_pe', label: 'Forward P/E', fmt: fmtNum },
      { key: 'pb_ratio', label: 'P/B Ratio', fmt: fmtNum },
      { key: 'ps_ratio', label: 'P/S Ratio', fmt: fmtNum },
      { key: 'ev_ebitda', label: 'EV/EBITDA', fmt: fmtNum },
    ],
  },
  {
    label: 'Profitability',
    metrics: [
      { key: 'roe', label: 'ROE', fmt: fmtPct },
      { key: 'roa', label: 'ROA', fmt: fmtPct },
      { key: 'profit_margin', label: 'Profit Margin', fmt: fmtPct },
      { key: 'operating_margin', label: 'Operating Margin', fmt: fmtPct },
    ],
  },
  {
    label: 'Growth',
    metrics: [
      { key: 'revenue_growth', label: 'Revenue Growth', fmt: fmtPct },
      { key: 'earnings_growth', label: 'Earnings Growth', fmt: fmtPct },
    ],
  },
  {
    label: 'Financial Health',
    metrics: [
      { key: 'debt_to_equity', label: 'Debt/Equity', fmt: fmtNum },
      { key: 'current_ratio', label: 'Current Ratio', fmt: fmtNum },
    ],
  },
  {
    label: 'Market',
    metrics: [
      { key: 'beta', label: 'Beta', fmt: fmtNum },
      { key: 'fifty_two_week_high', label: '52W High', fmt: (v) => v !== null ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--' },
      { key: 'fifty_two_week_low', label: '52W Low', fmt: (v) => v !== null ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--' },
      { key: 'avg_volume', label: 'Avg Volume', fmt: (v) => v !== null ? Number(v).toLocaleString() : '--' },
    ],
  },
  {
    label: 'Income',
    metrics: [
      { key: 'dividend_yield', label: 'Dividend Yield', fmt: fmtPct },
      { key: 'eps', label: 'EPS', fmt: fmtNum },
      { key: 'book_value', label: 'Book Value', fmt: fmtNum },
    ],
  },
]

function getCellColor(rankings, metricKey, symbol, stockCount) {
  const r = rankings?.[metricKey]?.[symbol]
  if (r === null) return ''
  if (r === 1) return 'bg-emerald-50 text-emerald-800'
  if (r === stockCount) return 'bg-rose-50 text-rose-700'
  return ''
}

function FundamentalsTable({ stocks, rankings }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Fundamentals Comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 min-w-[160px]">Metric</th>
              {stocks.map((s, i) => (
                <th key={s.symbol} className="text-right px-4 py-2.5 min-w-[120px]">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs font-semibold text-slate-700">{shortName(s.symbol)}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Price & Market Cap header row */}
            <tr className="border-b border-slate-100">
              <td className="px-4 py-2.5 text-xs font-medium text-slate-600">Price</td>
              {stocks.map(s => (
                <td key={s.symbol} className="px-4 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                  {s.price !== null ? curSym(s.symbol) + Number(s.price).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--'}
                </td>
              ))}
            </tr>
            <tr className="border-b border-slate-100">
              <td className="px-4 py-2.5 text-xs font-medium text-slate-600">Market Cap</td>
              {stocks.map(s => (
                <td key={s.symbol} className="px-4 py-2.5 text-right font-medium text-slate-700 tabular-nums">
                  {formatMarketCap(s.market_cap, s.symbol)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-slate-100">
              <td className="px-4 py-2.5 text-xs font-medium text-slate-600">Sector</td>
              {stocks.map(s => (
                <td key={s.symbol} className="px-4 py-2.5 text-right text-xs text-slate-500">{s.sector || '--'}</td>
              ))}
            </tr>

            {METRIC_CATEGORIES.map(cat => (
              <CategoryRows key={cat.label} cat={cat} stocks={stocks} rankings={rankings} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CategoryRows({ cat, stocks, rankings }) {
  return (
    <>
      <tr className="bg-slate-50/60">
        <td colSpan={stocks.length + 1} className="px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          {cat.label}
        </td>
      </tr>
      {cat.metrics.map(m => (
        <tr key={m.key} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
          <td className="px-4 py-2.5 text-xs font-medium text-slate-600">{m.label}</td>
          {stocks.map(s => (
            <td
              key={s.symbol}
              className={`px-4 py-2.5 text-right text-sm tabular-nums font-medium ${getCellColor(rankings, m.key, s.symbol, stocks.length)}`}
            >
              {m.fmt(s[m.key])}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ── Summary Verdict ──────────────────────────────────────────────────────────

function SummaryVerdict({ stocks, rankings }) {
  const scoreMap = {}
  for (const s of stocks) scoreMap[s.symbol] = { first: 0, last: 0 }

  for (const [, metricRanks] of Object.entries(rankings)) {
    const maxRank = Math.max(...Object.values(metricRanks))
    for (const [sym, rank] of Object.entries(metricRanks)) {
      if (!scoreMap[sym]) continue
      if (rank === 1) scoreMap[sym].first += 1
      if (rank === maxRank && maxRank > 1) scoreMap[sym].last += 1
    }
  }

  const sorted = [...stocks].sort((a, b) => (scoreMap[b.symbol]?.first || 0) - (scoreMap[a.symbol]?.first || 0))
  const winner = sorted[0]

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">Summary Verdict</h3>

      {winner && (
        <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <Trophy className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-900">
              Overall Winner: {shortName(winner.symbol)}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Ranked #1 in {scoreMap[winner.symbol]?.first || 0} of {Object.keys(rankings).length} key metrics
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((s, si) => {
          const sc = scoreMap[s.symbol] || { first: 0, last: 0 }
          const strengths = []
          const weaknesses = []
          for (const [metric, metricRanks] of Object.entries(rankings)) {
            const maxRank = Math.max(...Object.values(metricRanks))
            if (metricRanks[s.symbol] === 1) strengths.push(metric)
            if (metricRanks[s.symbol] === maxRank && maxRank > 1) weaknesses.push(metric)
          }
          const metricLabel = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

          return (
            <div key={s.symbol} className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[si % COLORS.length] }} />
                <p className="text-sm font-bold text-slate-800">{shortName(s.symbol)}</p>
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md ml-auto">
                  #{si + 1}
                </span>
              </div>
              {strengths.length > 0 && (
                <div className="mb-1.5">
                  <p className="text-[10px] font-semibold text-emerald-600 uppercase mb-0.5">Strengths</p>
                  <div className="flex flex-wrap gap-1">
                    {strengths.map(k => (
                      <span key={k} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                        {metricLabel(k)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {weaknesses.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-rose-600 uppercase mb-0.5">Weaknesses</p>
                  <div className="flex flex-wrap gap-1">
                    {weaknesses.map(k => (
                      <span key={k} className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-md">
                        {metricLabel(k)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Compare() {
  const globalExchange = useExchangeStore((s) => s.selected)
  const [searchParams, setSearchParams] = useSearchParams()
  const [symbols, setSymbols] = useState(() => {
    const sp = searchParams.get('symbols')
    if (sp) return sp.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5)
    return ['', '']
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  // If URL has pre-populated symbols, auto-fetch on mount
  const didAutoFetch = useRef(false)
  useEffect(() => {
    if (didAutoFetch.current) return
    const valid = symbols.filter(Boolean)
    if (valid.length >= 2) {
      didAutoFetch.current = true
      doCompare(valid)
    }
  }, [])

  const addSlot = () => {
    if (symbols.length < 5) setSymbols(prev => [...prev, ''])
  }

  const removeSlot = (idx) => {
    if (symbols.length <= 2) return
    setSymbols(prev => prev.filter((_, i) => i !== idx))
  }

  const updateSymbol = (idx, val) => {
    setSymbols(prev => prev.map((s, i) => i === idx ? val : s))
  }

  const doCompare = async (syms) => {
    const valid = (syms || symbols).filter(Boolean)
    if (valid.length < 2) { setError('Select at least 2 symbols'); return }
    setLoading(true)
    setError(null)
    setData(null)

    // Update URL
    setSearchParams({ symbols: valid.join(',') }, { replace: true })

    try {
      const result = await compareStocks(valid.join(','))
      setData(result)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to fetch comparison data'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-indigo-600" />
          Peer Comparison
        </h1>
        <p className="text-sm text-slate-500 mt-1">Compare up to 5 stocks side by side</p>
      </div>

      {/* Symbol Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {symbols.map((sym, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 w-5 shrink-0">#{idx + 1}</span>
              {sym ? (
                <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-sm font-semibold text-slate-800 flex-1">{shortName(sym)}</span>
                  <button onClick={() => updateSymbol(idx, '')} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex-1">
                  <MiniSymbolSearch
                    onSelect={(s) => updateSymbol(idx, s)}
                    placeholder={`Stock ${idx + 1}...`}
                    exchange={globalExchange !== 'ALL' ? globalExchange : undefined}
                  />
                </div>
              )}
              {symbols.length > 2 && (
                <button onClick={() => removeSlot(idx)} className="text-slate-300 hover:text-rose-500 transition-colors shrink-0" title="Remove">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4">
          {symbols.length < 5 && (
            <button
              onClick={addSlot}
              className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Stock
            </button>
          )}
          <button
            onClick={() => doCompare()}
            disabled={loading || symbols.filter(Boolean).length < 2}
            className="ml-auto flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm disabled:opacity-40 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
            Compare
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <span className="ml-3 text-sm text-slate-500">Fetching comparison data...</span>
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <div className="space-y-6">
          {/* Charts row */}
          <div className="grid gap-6 md:grid-cols-2">
            <PriceComparisonChart stocks={data.stocks} />
            <RadarChart stocks={data.stocks} />
          </div>

          {/* Fundamentals Table */}
          <FundamentalsTable stocks={data.stocks} rankings={data.rankings} />

          {/* Summary */}
          <SummaryVerdict stocks={data.stocks} rankings={data.rankings} />
        </div>
      )}
    </div>
  )
}
