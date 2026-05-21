import { useQuery } from '@tanstack/react-query'
import { getCorporateActions } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'
import { Calendar, DollarSign, Scissors, Filter } from 'lucide-react'
import { useState, useMemo } from 'react'

// ── Helpers ────────────────────────────────────────────────────────────────────
function isIndian(sym) {
  return sym?.endsWith('.NS') || sym?.endsWith('.BO')
}

function displaySym(sym) {
  return sym?.replace(/\.(NS|BO)$/, '') ?? sym
}

function curFor(sym) {
  return isIndian(sym) ? '₹' : '$'
}

function localeFor(sym) {
  return isIndian(sym) ? 'en-IN' : 'en-US'
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function isWithinMonths(dateStr, months) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return d >= cutoff
}

const TYPE_CONFIG = {
  Dividend:      { color: 'emerald', icon: DollarSign },
  'Stock Split': { color: 'blue',    icon: Scissors },
  Other:         { color: 'purple',  icon: Calendar },
}

function getTypeConfig(type) {
  if (type === 'Dividend') return TYPE_CONFIG.Dividend
  if (type === 'Stock Split' || type === 'Split') return TYPE_CONFIG['Stock Split']
  return TYPE_CONFIG.Other
}

const BADGE_CLASSES = {
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  blue:    'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  purple:  'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

const DOT_CLASSES = {
  emerald: 'bg-emerald-500',
  blue:    'bg-blue-500',
  purple:  'bg-purple-500',
}

const FILTER_TABS = ['All', 'Dividend', 'Stock Split', 'Other']

// ── Skeleton ───────────────────────────────────────────────────────────────────
function TimelineSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="w-24 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="w-3 h-3 rounded-full bg-slate-200 dark:bg-slate-700 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Summary Card ───────────────────────────────────────────────────────────────
function SummaryCard({ label, value, icon: Icon, iconBg, iconColor }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{value}</p>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CorporateActions() {
  const globalExchange = useExchangeStore((s) => s.selected)
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)
  const [activeFilter, setActiveFilter] = useState('All')
  const [symbolFilter, setSymbolFilter] = useState('')

  const { data: rawActions, isLoading, isError, error } = useQuery({
    queryKey: ['corporate-actions'],
    queryFn: getCorporateActions,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const actions = useMemo(() => rawActions?.filter(a => matchesSelected(a.symbol)) ?? null, [rawActions, matchesSelected, globalExchange])

  // Unique symbols for dropdown
  const symbols = useMemo(() => {
    if (!actions) return []
    return [...new Set(actions.map(a => a.symbol))].sort()
  }, [actions])

  // Filter actions
  const filtered = useMemo(() => {
    if (!actions) return []
    return actions.filter(a => {
      if (activeFilter === 'Dividend' && a.type !== 'Dividend') return false
      if (activeFilter === 'Stock Split' && a.type !== 'Stock Split' && a.type !== 'Split') return false
      if (activeFilter === 'Other' && a.type === 'Dividend' && a.type !== 'Stock Split') return false
      if (activeFilter === 'Other' && (a.type === 'Dividend' || a.type === 'Stock Split' || a.type === 'Split')) return false
      if (symbolFilter && a.symbol !== symbolFilter) return false
      return true
    }).sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [actions, activeFilter, symbolFilter])

  // Summary stats
  const stats = useMemo(() => {
    if (!actions) return { dividends: 0, splits: 0, total: 0 }
    const recent = actions.filter(a => isWithinMonths(a.date, 12))
    return {
      dividends: recent.filter(a => a.type === 'Dividend').reduce((sum, a) => sum + (a.value || 0), 0),
      splits: recent.filter(a => a.type === 'Stock Split' || a.type === 'Split').length,
      total: actions.length,
    }
  }, [actions])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Corporate Actions</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Dividends, stock splits, and other corporate events for your watchlist</p>
      </div>

      {/* Summary Cards */}
      {!isLoading && actions && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard
            label="Dividends (12M)"
            value={`${stats.dividends.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            icon={DollarSign}
            iconBg="bg-emerald-50 dark:bg-emerald-900/30"
            iconColor="text-emerald-600 dark:text-emerald-400"
          />
          <SummaryCard
            label="Stock Splits"
            value={stats.splits}
            icon={Scissors}
            iconBg="bg-blue-50 dark:bg-blue-900/30"
            iconColor="text-blue-600 dark:text-blue-400"
          />
          <SummaryCard
            label="Total Actions"
            value={stats.total}
            icon={Calendar}
            iconBg="bg-indigo-50 dark:bg-indigo-900/30"
            iconColor="text-indigo-600 dark:text-indigo-400"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Type toggles */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                activeFilter === tab
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Symbol filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={symbolFilter}
            onChange={e => setSymbolFilter(e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">All Symbols</option>
            {symbols.map(s => (
              <option key={s} value={s}>{displaySym(s)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 shadow-sm">
          <Calendar className="w-4 h-4 shrink-0" />
          Failed to load corporate actions: {error?.message || 'Unknown error'}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <TimelineSkeleton />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && !isError && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
            <Calendar className="w-7 h-7 text-indigo-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No corporate actions found</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {symbolFilter ? 'Try selecting a different symbol or clearing filters' : 'Add stocks to your watchlist to track corporate actions'}
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      {!isLoading && filtered.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[104px] top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700 sm:left-[120px]" />

            <div className="space-y-6">
              {filtered.map((action, i) => {
                const cfg = getTypeConfig(action.type)
                const Icon = cfg.icon
                return (
                  <div key={i} className="flex items-start gap-4 relative">
                    {/* Date */}
                    <div className="w-[88px] sm:w-[104px] text-right shrink-0">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{formatDate(action.date)}</p>
                    </div>

                    {/* Dot */}
                    <div className={`w-3 h-3 rounded-full ${DOT_CLASSES[cfg.color]} shrink-0 mt-0.5 ring-4 ring-white dark:ring-slate-800 relative z-10`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {displaySym(action.symbol)}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${BADGE_CLASSES[cfg.color]}`}>
                          <Icon className="w-3 h-3" />
                          {action.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{action.details}</p>
                      {action.value !== null && action.value > 0 && (
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5 tabular-nums">
                          {curFor(action.symbol)}{action.value.toLocaleString(localeFor(action.symbol), { maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Count footer */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
          Showing {filtered.length} action{filtered.length !== 1 ? 's' : ''}
          {symbolFilter && ` for ${displaySym(symbolFilter)}`}
        </p>
      )}
    </div>
  )
}
