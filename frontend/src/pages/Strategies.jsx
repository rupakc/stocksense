import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  BarChart2, Activity, Zap, AlertCircle, RefreshCw, X,
  Target, ShieldAlert, Clock, Info, Settings2, Calendar
} from 'lucide-react'
import clsx from 'clsx'
import { getStrategies, getStrategySignals, runBacktest, compareStrategies } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'

function isIndian(sym) {
  return sym?.endsWith('.NS') || sym?.endsWith('.BO')
}

function curFor(sym) {
  return isIndian(sym) ? '₹' : '$'
}

function localeFor(sym) {
  return isIndian(sym) ? 'en-IN' : 'en-US'
}

function fmtCurrency(val, sym) {
  return `${curFor(sym)}${Number(val).toLocaleString(localeFor(sym), { maximumFractionDigits: 2 })}`
}

// ── Strategy parameter definitions ────────────────────────────────────────────
const STRATEGY_PARAMS = {
  'golden_cross': [
    { key: 'fast_period', label: 'Fast MA', default: 50, min: 5, max: 100, step: 1 },
    { key: 'slow_period', label: 'Slow MA', default: 200, min: 50, max: 500, step: 1 },
  ],
  'rsi_mean_reversion': [
    { key: 'rsi_oversold', label: 'Oversold', default: 30, min: 10, max: 45, step: 1 },
    { key: 'rsi_overbought', label: 'Overbought', default: 70, min: 55, max: 90, step: 1 },
    { key: 'rsi_period', label: 'RSI Period', default: 14, min: 5, max: 50, step: 1 },
  ],
  'bollinger_breakout': [
    { key: 'bb_period', label: 'Period', default: 20, min: 5, max: 50, step: 1 },
    { key: 'bb_std', label: 'Std Dev', default: 2, min: 1, max: 4, step: 0.5 },
  ],
  'macd_momentum': [
    { key: 'fast', label: 'Fast EMA', default: 12, min: 5, max: 30, step: 1 },
    { key: 'slow', label: 'Slow EMA', default: 26, min: 15, max: 60, step: 1 },
    { key: 'signal', label: 'Signal', default: 9, min: 3, max: 20, step: 1 },
  ],
  'ema_ribbon': [
    { key: 'fast', label: 'Fast EMA', default: 9, min: 3, max: 30, step: 1 },
    { key: 'mid', label: 'Mid EMA', default: 21, min: 10, max: 50, step: 1 },
    { key: 'slow', label: 'Slow EMA', default: 55, min: 30, max: 100, step: 1 },
  ],
  'volume_breakout': [
    { key: 'vol_multiple', label: 'Vol Multiple', default: 2.0, min: 1.0, max: 5.0, step: 0.5 },
    { key: 'price_change_pct', label: 'Price Change %', default: 2.0, min: 0.5, max: 5.0, step: 0.5 },
  ],
  'donchian_breakout': [
    { key: 'entry_period', label: 'Entry Period', default: 20, min: 5, max: 50, step: 1 },
  ],
  'supertrend': [
    { key: 'atr_period', label: 'ATR Period', default: 10, min: 5, max: 30, step: 1 },
    { key: 'multiplier', label: 'Multiplier', default: 3.0, min: 1.0, max: 5.0, step: 0.5 },
  ],
}

// ── Colour maps ──────────────────────────────────────────────────────────────
const COLOR_MAP = {
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500'  },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500'  },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500'    },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500'   },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500'},
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500'  },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',   badge: 'bg-cyan-100 text-cyan-700',   dot: 'bg-cyan-500'    },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',   badge: 'bg-rose-100 text-rose-700',   dot: 'bg-rose-500'    },
}

const SIGNAL_STYLES = {
  BUY:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: TrendingUp,   dot: 'bg-emerald-500' },
  SELL: { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    icon: TrendingDown, dot: 'bg-rose-500'    },
  HOLD: { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',   icon: Minus,        dot: 'bg-slate-400'   },
}

const RISK_STYLES = {
  Low:    'text-emerald-600 bg-emerald-50 border-emerald-200',
  Medium: 'text-amber-600 bg-amber-50 border-amber-200',
  High:   'text-rose-600 bg-rose-50 border-rose-200',
}

// ── Strategy selector card ────────────────────────────────────────────────────
function StrategyCard({ strategy, selected, onClick }) {
  const c = COLOR_MAP[strategy.color] ?? COLOR_MAP.indigo
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left rounded-xl border p-4 transition-all duration-150',
        selected
          ? `${c.bg} ${c.border} shadow-sm ring-2 ring-offset-1 ring-current ${c.text}`
          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={clsx('text-[10px] font-semibold uppercase tracking-widest mb-1',
            selected ? c.text : 'text-slate-400')}>{strategy.category}</p>
          <p className={clsx('text-sm font-bold leading-tight',
            selected ? c.text : 'text-slate-800')}>{strategy.name}</p>
        </div>
        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 mt-0.5',
          selected ? c.badge : 'bg-slate-50 text-slate-500 border-slate-200',
          RISK_STYLES[strategy.risk_level] && selected ? '' : ''
        )}>
          {strategy.risk_level} risk
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mt-2 line-clamp-2 leading-relaxed">
        {strategy.best_for}
      </p>
      <p className={clsx('text-[10px] mt-2 flex items-center gap-1',
        selected ? c.text : 'text-slate-400')}>
        <Clock className="w-3 h-3" /> {strategy.time_horizon}
      </p>
    </button>
  )
}

// ── Strategy info panel ──────────────────────────────────────────────────────
function StrategyInfoPanel({ strategy }) {
  const c = COLOR_MAP[strategy.color] ?? COLOR_MAP.indigo
  return (
    <div className={clsx('rounded-2xl border p-5 space-y-3', c.bg, c.border)}>
      <div className="flex items-start gap-3">
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', c.badge)}>
          <Activity className="w-4 h-4" />
        </div>
        <div>
          <h2 className={clsx('font-bold text-base', c.text)}>{strategy.name}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{strategy.category} · {strategy.time_horizon}</p>
        </div>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed">{strategy.description}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {Object.entries(strategy.parameters).map(([k, v]) => (
          <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-mono">
            {k.replace(/_/g, ' ')}: <span className="font-bold">{v}</span>
          </span>
        ))}
        <span className={clsx('text-[11px] px-2 py-0.5 rounded-full border font-semibold',
          RISK_STYLES[strategy.risk_level])}>
          {strategy.risk_level} Risk
        </span>
      </div>
    </div>
  )
}

// ── Signal strength bar ───────────────────────────────────────────────────────
function StrengthBar({ value, signal }) {
  const colors = { BUY: 'bg-emerald-500', SELL: 'bg-rose-500', HOLD: 'bg-slate-400' }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', colors[signal] ?? 'bg-slate-400')}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-500 w-8 text-right">{Math.round(value * 100)}%</span>
    </div>
  )
}

// ── Key metric chip ───────────────────────────────────────────────────────────
function MetricChip({ label, value }) {
  if (value === null || value === undefined) return null
  const display = typeof value === 'boolean'
    ? (value ? 'Yes' : 'No')
    : typeof value === 'number'
      ? (Math.abs(value) > 1000 ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 }))
      : String(value)
  return (
    <div className="text-center px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">{label.replace(/_/g, ' ')}</p>
      <p className="text-xs font-bold text-slate-800 mt-0.5 tabular-nums">{display}</p>
    </div>
  )
}

// ── Signal card ───────────────────────────────────────────────────────────────
function SignalCard({ signal: s, onBacktest, onCompare }) {
  const [expanded, setExpanded] = useState(false)
  const st = SIGNAL_STYLES[s.signal] ?? SIGNAL_STYLES.HOLD
  const SignalIcon = st.icon
  const rr = s.entry_price && s.target_price && s.stop_loss
    ? Math.abs(s.target_price - s.entry_price) / Math.abs(s.entry_price - s.stop_loss)
    : null

  return (
    <div className={clsx('bg-white rounded-xl border transition-shadow hover:shadow-md', st.border)}>
      {/* Top stripe */}
      <div className={clsx('h-0.5 rounded-t-xl', st.dot)} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="font-bold text-slate-900 text-base">{s.symbol}</p>
            {s.last_close && (
              <p className="text-xs text-slate-500 tabular-nums">
                {fmtCurrency(s.last_close, s.symbol)}
              </p>
            )}
          </div>
          <div className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold', st.bg, st.text, st.border)}>
            <SignalIcon className="w-3.5 h-3.5" />
            {s.signal}
          </div>
        </div>

        {/* Strength */}
        <StrengthBar value={s.strength} signal={s.signal} />

        {/* Entry / SL / Target */}
        {(s.entry_price || s.stop_loss || s.target_price) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mt-3">
            {s.entry_price && (
              <div className="text-center bg-slate-50 rounded-lg p-2 border border-slate-100">
                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Entry</p>
                <p className="text-xs font-bold text-slate-800 tabular-nums mt-0.5">
                  {curFor(s.symbol)}{s.entry_price.toLocaleString(localeFor(s.symbol), { maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
            {s.stop_loss && (
              <div className="text-center bg-rose-50 rounded-lg p-2 border border-rose-100">
                <p className="text-[9px] uppercase tracking-wider text-rose-400 font-semibold">Stop</p>
                <p className="text-xs font-bold text-rose-700 tabular-nums mt-0.5">
                  {curFor(s.symbol)}{s.stop_loss.toLocaleString(localeFor(s.symbol), { maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
            {s.target_price && (
              <div className="text-center bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                <p className="text-[9px] uppercase tracking-wider text-emerald-500 font-semibold">Target</p>
                <p className="text-xs font-bold text-emerald-700 tabular-nums mt-0.5">
                  {curFor(s.symbol)}{s.target_price.toLocaleString(localeFor(s.symbol), { maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
          </div>
        )}

        {/* R:R ratio */}
        {rr && (
          <p className="text-[10px] text-slate-500 mt-2 text-right">
            R:R ≈ <span className={clsx('font-bold', rr >= 2 ? 'text-emerald-600' : 'text-amber-600')}>1:{rr.toFixed(1)}</span>
          </p>
        )}

        {/* Rationale toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full mt-3 flex items-center justify-between text-[11px] text-slate-500 hover:text-slate-700 transition-colors"
        >
          <span className="font-medium">Rationale &amp; Metrics</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {expanded && (
          <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-600 leading-relaxed">{s.rationale}</p>
            {s.key_metrics && Object.keys(s.key_metrics).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(s.key_metrics).map(([k, v]) => (
                  <MetricChip key={k} label={k} value={v} />
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => onBacktest(s.symbol)}
                className="flex-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg py-2 transition-colors border border-indigo-100"
              >
                Backtest →
              </button>
              <button
                onClick={() => onBacktest(s.symbol, /* compare */ true)}
                className="flex-1 text-xs font-semibold text-slate-600 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg py-2 transition-colors border border-slate-200"
              >
                Compare All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Equity curve mini-chart (SVG sparkline) ───────────────────────────────────
function EquityCurve({ data }) {
  if (!data?.length) return null
  const w = 400, h = 80
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  const lastY = h - ((data[data.length - 1] - min) / range) * h
  const color = data[data.length - 1] >= data[0] ? '#059669' : '#e11d48'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <line x1="0" y1={h} x2={w} y2={h} stroke="#e2e8f0" strokeWidth="1" />
    </svg>
  )
}

// ── Backtest modal ────────────────────────────────────────────────────────────
function BacktestModal({ symbol, strategyId, onClose }) {
  const [period, setPeriod] = useState(365)
  const [dateMode, setDateMode] = useState('period') // 'period' | 'custom'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [includeCosts, setIncludeCosts] = useState(true)
  const [showParams, setShowParams] = useState(false)

  // Strategy parameter state: initialize from STRATEGY_PARAMS defaults
  const paramDefs = STRATEGY_PARAMS[strategyId] || []
  const [customParams, setCustomParams] = useState(() => {
    const defaults = {}
    for (const p of paramDefs) defaults[p.key] = p.default
    return defaults
  })

  // Check if user changed any params from defaults
  const hasCustomParams = useMemo(() => {
    return paramDefs.some(p => customParams[p.key] !== p.default)
  }, [customParams, paramDefs])

  const backtestOpts = useMemo(() => {
    const opts = { includeCosts }
    if (dateMode === 'custom' && startDate && endDate) {
      opts.startDate = startDate
      opts.endDate = endDate
    } else {
      opts.lookbackDays = period
    }
    if (hasCustomParams) {
      opts.params = { ...customParams }
    }
    return opts
  }, [period, dateMode, startDate, endDate, includeCosts, customParams, hasCustomParams])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['backtest', strategyId, symbol, backtestOpts],
    queryFn: () => runBacktest(strategyId, symbol, backtestOpts),
    retry: false,
  })

  const isWin = data && data.total_return_pct >= 0
  const beatsBH = data && data.total_return_pct > data.buy_and_hold_return_pct

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="font-bold text-slate-900">Backtest: {symbol}</h2>
            <p className="text-xs text-slate-500">
              Simulated {curFor(symbol)}{isIndian(symbol) ? '1L' : '100K'} initial capital
              {dateMode === 'custom' && startDate && endDate
                ? ` · ${startDate} to ${endDate}`
                : ` · Last ${period} days`}
              {includeCosts ? ' · Costs included' : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Date mode toggle */}
          <div className="flex gap-2 mb-1">
            <button
              onClick={() => setDateMode('period')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5',
                dateMode === 'period'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              )}
            >
              <Clock className="w-3 h-3" /> Period
            </button>
            <button
              onClick={() => setDateMode('custom')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5',
                dateMode === 'custom'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              )}
            >
              <Calendar className="w-3 h-3" /> Custom Range
            </button>
          </div>

          {/* Period selector or custom date pickers */}
          {dateMode === 'custom' ? (
            <div className="flex gap-3 items-center">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">Start</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">End</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {[180, 365, 730].map(d => (
                <button
                  key={d}
                  onClick={() => setPeriod(d)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                    period === d
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  )}
                >
                  {d === 180 ? '6 months' : d === 365 ? '1 year' : '2 years'}
                </button>
              ))}
            </div>
          )}

          {/* Transaction cost toggle + strategy params */}
          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCosts}
                onChange={e => setIncludeCosts(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Include transaction costs
            </label>
            {paramDefs.length > 0 && (
              <button
                onClick={() => setShowParams(p => !p)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                  showParams
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                )}
              >
                <Settings2 className="w-3 h-3" />
                {showParams ? 'Hide' : 'Tune'} Parameters
              </button>
            )}
          </div>

          {/* Strategy parameter inputs */}
          {showParams && paramDefs.length > 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Strategy Parameters</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {paramDefs.map(p => (
                  <div key={p.key}>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-1">
                      {p.label}
                      <span className="text-slate-400 font-normal ml-1">(default: {p.default})</span>
                    </label>
                    <input
                      type="number"
                      min={p.min}
                      max={p.max}
                      step={p.step || 1}
                      value={customParams[p.key]}
                      onChange={e => setCustomParams(prev => ({
                        ...prev,
                        [p.key]: parseFloat(e.target.value) || p.default,
                      }))}
                      className={clsx(
                        'w-full border rounded-lg px-2.5 py-1.5 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-300',
                        customParams[p.key] !== p.default
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-slate-200 text-slate-700'
                      )}
                    />
                  </div>
                ))}
              </div>
              {hasCustomParams && (
                <button
                  onClick={() => {
                    const defaults = {}
                    for (const p of paramDefs) defaults[p.key] = p.default
                    setCustomParams(defaults)
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-700 underline"
                >
                  Reset to defaults
                </button>
              )}
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-sm">Running backtest…</p>
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
              <p className="text-sm text-rose-700">{error?.response?.data?.detail ?? 'Backtest failed.'}</p>
            </div>
          )}

          {data && (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Strategy Return', value: `${data.total_return_pct > 0 ? '+' : ''}${data.total_return_pct}%`, color: isWin ? 'text-emerald-600' : 'text-rose-600' },
                  { label: 'Buy & Hold', value: `${data.buy_and_hold_return_pct > 0 ? '+' : ''}${data.buy_and_hold_return_pct}%`, color: data.buy_and_hold_return_pct > 0 ? 'text-emerald-600' : 'text-rose-600' },
                  { label: 'Win Rate', value: `${data.win_rate}%`, color: data.win_rate >= 50 ? 'text-emerald-600' : 'text-rose-600' },
                  { label: 'Sharpe Ratio', value: data.sharpe_ratio.toFixed(2), color: data.sharpe_ratio >= 1 ? 'text-emerald-600' : data.sharpe_ratio >= 0 ? 'text-amber-600' : 'text-rose-600' },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-slate-50 rounded-xl border border-slate-100 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{kpi.label}</p>
                    <p className={clsx('text-base font-bold mt-1 tabular-nums', kpi.color)}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Second row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Trades', value: data.total_trades },
                  { label: 'Wins / Losses', value: `${data.winning_trades} / ${data.losing_trades}` },
                  { label: 'Max Drawdown', value: `-${data.max_drawdown_pct}%`, color: 'text-rose-600' },
                  { label: 'Final Equity', value: `${curFor(symbol)}${Math.round(data.final_equity).toLocaleString(localeFor(symbol))}` },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-slate-50 rounded-xl border border-slate-100 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{kpi.label}</p>
                    <p className={clsx('text-sm font-bold mt-1 tabular-nums', kpi.color ?? 'text-slate-800')}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Transaction costs row */}
              {data.total_transaction_costs > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-amber-700 font-medium">Total Transaction Costs</span>
                  <span className="text-xs font-bold text-amber-800 tabular-nums">
                    {curFor(symbol)}{Math.round(data.total_transaction_costs).toLocaleString(localeFor(symbol))}
                  </span>
                </div>
              )}

              {/* Beat BH badge */}
              <div className={clsx(
                'flex items-center gap-2 rounded-xl px-4 py-3 border text-sm font-semibold',
                beatsBH ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
              )}>
                {beatsBH ? <TrendingUp className="w-4 h-4 shrink-0" /> : <TrendingDown className="w-4 h-4 shrink-0" />}
                {beatsBH
                  ? `Strategy outperformed buy & hold by ${(data.total_return_pct - data.buy_and_hold_return_pct).toFixed(2)}%`
                  : `Strategy underperformed buy & hold by ${(data.buy_and_hold_return_pct - data.total_return_pct).toFixed(2)}%`}
              </div>

              {/* Equity curve */}
              {data.equity_curve?.length > 1 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Equity Curve</p>
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                    <EquityCurve data={data.equity_curve} />
                  </div>
                </div>
              )}

              {/* Trade log */}
              {data.trades?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Recent Trades ({data.trades.length})
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {['Entry Date', 'Exit Date', `Entry ${curFor(symbol)}`, `Exit ${curFor(symbol)}`, 'Return', 'P&L'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-slate-500 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.trades.map((t, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-600 tabular-nums">{t.entry_date}</td>
                            <td className="px-3 py-2 text-slate-600 tabular-nums">
                              {t.exit_date === 'open'
                                ? <span className="text-amber-600 font-semibold">Open</span>
                                : t.exit_date}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{curFor(symbol)}{t.entry_price.toLocaleString(localeFor(symbol))}</td>
                            <td className="px-3 py-2 tabular-nums">{curFor(symbol)}{t.exit_price.toLocaleString(localeFor(symbol))}</td>
                            <td className={clsx('px-3 py-2 font-bold tabular-nums',
                              t.return_pct > 0 ? 'text-emerald-600' : t.return_pct < 0 ? 'text-rose-600' : 'text-amber-600')}>
                              {t.return_pct > 0 ? '+' : ''}{t.return_pct}%
                            </td>
                            <td className={clsx('px-3 py-2 font-semibold tabular-nums',
                              t.pnl > 0 ? 'text-emerald-600' : t.pnl < 0 ? 'text-rose-600' : 'text-slate-500')}>
                              {t.pnl > 0 ? '+' : ''}{curFor(symbol)}{Math.round(t.pnl).toLocaleString(localeFor(symbol))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Signal summary bar ────────────────────────────────────────────────────────
function SignalSummary({ signals }) {
  const counts = signals.reduce((a, s) => { a[s.signal] = (a[s.signal] || 0) + 1; return a }, {})
  const total  = signals.length
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Signal Summary</p>
      <div className="flex gap-4 flex-wrap">
        {[
          { label: 'BUY',  count: counts.BUY  ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-500' },
          { label: 'HOLD', count: counts.HOLD ?? 0, color: 'text-slate-500',   bg: 'bg-slate-400'   },
          { label: 'SELL', count: counts.SELL ?? 0, color: 'text-rose-600',    bg: 'bg-rose-500'    },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <div className={clsx('w-2.5 h-2.5 rounded-full', s.bg)} />
            <span className={clsx('text-sm font-bold tabular-nums', s.color)}>{s.count}</span>
            <span className="text-xs text-slate-400">{s.label}</span>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden flex">
          {[
            { sig: 'BUY',  color: 'bg-emerald-500' },
            { sig: 'HOLD', color: 'bg-slate-300'   },
            { sig: 'SELL', color: 'bg-rose-500'    },
          ].map(({ sig, color }) => {
            const pct = ((counts[sig] ?? 0) / total) * 100
            return pct > 0 ? (
              <div key={sig} className={clsx('h-full transition-all', color)} style={{ width: `${pct}%` }} />
            ) : null
          })}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Strategies() {
  const globalExchange = useExchangeStore((s) => s.selected)
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)
  const [selectedId, setSelectedId] = useState(null)
  const [backtestState, setBacktestState] = useState(null) // { symbol, strategyId }

  const { data: strategies, isLoading: loadingStrategies } = useQuery({
    queryKey: ['strategies'],
    queryFn: getStrategies,
    staleTime: Infinity,
  })

  const {
    data: signalsData,
    isLoading: loadingSignals,
    isError: signalError,
    error: signalErrorMsg,
    refetch: refetchSignals,
  } = useQuery({
    queryKey: ['strategy-signals', selectedId],
    queryFn: () => getStrategySignals(selectedId),
    enabled: !!selectedId,
    staleTime: 5 * 60 * 1000,
  })

  const selectedStrategy = strategies?.find(s => s.id === selectedId)

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Trading Strategies</h1>
          <p className="text-sm text-slate-500 mt-1">
            Select a strategy to generate buy/sell/hold signals for your watchlist
          </p>
        </div>
        {selectedId && signalsData && (
          <button
            onClick={() => refetchSignals()}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Refresh Signals
          </button>
        )}
      </div>

      {/* Strategy grid */}
      {loadingStrategies ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {strategies?.map(s => (
            <StrategyCard
              key={s.id}
              strategy={s}
              selected={selectedId === s.id}
              onClick={() => setSelectedId(s.id)}
            />
          ))}
        </div>
      )}

      {/* Strategy info */}
      {selectedStrategy && <StrategyInfoPanel strategy={selectedStrategy} />}

      {/* Signals section */}
      {selectedId && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
              Watchlist Signals
            </h2>
            {loadingSignals && <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />}
          </div>

          {loadingSignals && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-48 bg-white rounded-xl border border-slate-200 animate-pulse" />
              ))}
            </div>
          )}

          {signalError && (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
              <p className="text-sm text-rose-700">
                {signalErrorMsg?.response?.data?.detail ?? 'Failed to load signals. Ensure your watchlist has stocks.'}
              </p>
            </div>
          )}

          {signalsData && (() => {
            const filteredSignals = signalsData.signals.filter(s => matchesSelected(s.symbol))
            return (
            <>
              <SignalSummary signals={filteredSignals} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSignals.map(sig => (
                  <SignalCard
                    key={sig.symbol}
                    signal={sig}
                    onBacktest={(sym, compare) => setBacktestState({ symbol: sym, strategyId: selectedId, compare })}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-400 text-center pt-2">
                Signals generated {new Date(signalsData.generated_at).toLocaleTimeString()} ·
                For educational purposes only · Not financial advice
              </p>
            </>
            )
          })()}

          {!loadingSignals && !signalError && !signalsData && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <BarChart2 className="w-10 h-10" />
              <p className="text-sm">Select a strategy above to see signals</p>
            </div>
          )}
        </div>
      )}

      {!selectedId && !loadingStrategies && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-200 border-dashed">
          <Activity className="w-10 h-10" />
          <p className="text-base font-medium text-slate-600">Choose a strategy above</p>
          <p className="text-sm">We&apos;ll apply it to every stock in your watchlist and show buy/sell/hold signals</p>
        </div>
      )}

      {/* Backtest modal */}
      {backtestState && !backtestState.compare && (
        <BacktestModal
          symbol={backtestState.symbol}
          strategyId={backtestState.strategyId}
          onClose={() => setBacktestState(null)}
        />
      )}

      {/* Compare modal */}
      {backtestState?.compare && (
        <CompareModal
          symbol={backtestState.symbol}
          onClose={() => setBacktestState(null)}
        />
      )}
    </div>
  )
}

// ── Compare modal ────────────────────────────────────────────────────────────
function CompareModal({ symbol, onClose }) {
  const [period, setPeriod] = useState(365)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['compare', symbol, period],
    queryFn: () => compareStrategies(symbol, period),
    retry: false,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="font-bold text-slate-900">Compare All Strategies: {symbol}</h2>
            <p className="text-xs text-slate-500">All 8 strategies backtested side-by-side</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex gap-2">
            {[180, 365, 730].map(d => (
              <button key={d} onClick={() => setPeriod(d)}
                className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                  period === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200')}>
                {d === 180 ? '6mo' : d === 365 ? '1yr' : '2yr'}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12 gap-3 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-sm">Running all backtests... this may take a minute</p>
            </div>
          )}

          {isError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
              Failed to run comparison
            </div>
          )}

          {data?.strategies?.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-slate-500 font-semibold">#</th>
                    <th className="text-left px-4 py-2.5 text-slate-500 font-semibold">Strategy</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-semibold">Return</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-semibold">B&H</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-semibold">Alpha</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-semibold">Sharpe</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-semibold">Max DD</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-semibold">Win Rate</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-semibold">Trades</th>
                    <th className="text-right px-4 py-2.5 text-slate-500 font-semibold">Final {curFor(symbol)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.strategies.map((s, i) => {
                    const alpha = s.total_return_pct - s.buy_and_hold_return_pct
                    return (
                      <tr key={s.strategy_id} className={clsx('border-b border-slate-100 hover:bg-slate-50',
                        i === 0 && 'bg-emerald-50/50')}>
                        <td className="px-4 py-2.5 font-bold text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{s.strategy_name}</td>
                        <td className={clsx('px-4 py-2.5 text-right font-bold tabular-nums',
                          s.total_return_pct >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {s.total_return_pct > 0 ? '+' : ''}{s.total_return_pct}%
                        </td>
                        <td className={clsx('px-4 py-2.5 text-right tabular-nums',
                          s.buy_and_hold_return_pct >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {s.buy_and_hold_return_pct > 0 ? '+' : ''}{s.buy_and_hold_return_pct}%
                        </td>
                        <td className={clsx('px-4 py-2.5 text-right font-bold tabular-nums',
                          alpha >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {alpha > 0 ? '+' : ''}{alpha.toFixed(2)}%
                        </td>
                        <td className={clsx('px-4 py-2.5 text-right tabular-nums',
                          s.sharpe_ratio >= 1 ? 'text-emerald-600' : s.sharpe_ratio >= 0 ? 'text-amber-600' : 'text-rose-600')}>
                          {s.sharpe_ratio.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-rose-600 tabular-nums">-{s.max_drawdown_pct}%</td>
                        <td className={clsx('px-4 py-2.5 text-right tabular-nums',
                          s.win_rate >= 50 ? 'text-emerald-600' : 'text-rose-600')}>
                          {s.win_rate}%
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{s.total_trades}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                          {curFor(symbol)}{Math.round(s.final_equity).toLocaleString(localeFor(symbol))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data?.strategies?.length > 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
              <p className="text-xs font-semibold text-slate-500 mb-2">Equity Curves Overlay</p>
              <CompareEquityCurves strategies={data.strategies} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const COMPARE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

function CompareEquityCurves({ strategies }) {
  const maxLen = Math.max(...strategies.map(s => s.equity_curve?.length ?? 0))
  if (maxLen < 2) return <p className="text-xs text-slate-400">No equity data</p>

  const w = 600, h = 120
  const allVals = strategies.flatMap(s => s.equity_curve ?? [])
  const min = Math.min(...allVals)
  const max = Math.max(...allVals)
  const range = max - min || 1

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none">
        {strategies.map((s, si) => {
          const data = s.equity_curve ?? []
          if (data.length < 2) return null
          const pts = data.map((v, i) => {
            const x = (i / (data.length - 1)) * w
            const y = h - ((v - min) / range) * h
            return `${x},${y}`
          }).join(' ')
          return <polyline key={si} points={pts} fill="none" stroke={COMPARE_COLORS[si % COMPARE_COLORS.length]}
            strokeWidth="1.5" strokeLinejoin="round" opacity="0.8" />
        })}
      </svg>
      <div className="flex flex-wrap gap-3 mt-2">
        {strategies.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <span className="w-3 h-0.5 rounded" style={{ backgroundColor: COMPARE_COLORS[i % COMPARE_COLORS.length] }} />
            {s.strategy_name}
          </span>
        ))}
      </div>
    </div>
  )
}
