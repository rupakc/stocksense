import { useQuery } from '@tanstack/react-query'
import { getMFOverlap } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'
import { PieChart, TrendingUp, ChevronDown, ChevronUp, Building2, Globe } from 'lucide-react'
import { useState } from 'react'

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatAUM(crValue) {
  if (crValue === null) return '-'
  if (crValue >= 100000) return `₹${(crValue / 100000).toFixed(2)} L Cr`
  if (crValue >= 1000) return `₹${(crValue / 1000).toFixed(1)}K Cr`
  return `₹${crValue.toLocaleString('en-IN')} Cr`
}

const CATEGORY_COLORS = {
  'Large Cap':       'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Mid Cap':         'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'Small Cap':       'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'Flexi Cap':       'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'Multi Cap':       'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Large & Mid Cap': 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
}

function categoryBadgeClass(category) {
  return CATEGORY_COLORS[category] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm animate-pulse" />
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 dark:border-slate-700 animate-pulse">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16" />
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Summary Card ───────────────────────────────────────────────────────────────
function SummaryCard({ label, value, subtext, icon: Icon, iconBg, iconColor }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">{value}</p>
          {subtext && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtext}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Expandable Row ─────────────────────────────────────────────────────────────
function OverlapRow({ scheme }) {
  const [expanded, setExpanded] = useState(false)
  const overlapPct = scheme.overlap_pct ?? 0

  return (
    <>
      <tr
        className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            <button className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{scheme.scheme_name}</p>
              <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${categoryBadgeClass(scheme.category)}`}>
                {scheme.category}
              </span>
            </div>
          </div>
        </td>
        <td className="text-right px-3 py-3 text-sm tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {formatAUM(scheme.aum_cr)}
        </td>
        <td className="text-right px-3 py-3 text-sm tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {scheme.overlap_count} of {scheme.total_holdings}
        </td>
        <td className="text-right px-5 py-3">
          <div className="flex items-center justify-end gap-2">
            <div className="w-full max-w-[80px] h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${overlapPct >= 40 ? 'bg-rose-500' : overlapPct >= 20 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(overlapPct, 100)}%` }}
              />
            </div>
            <span className={`text-sm font-semibold tabular-nums ${overlapPct >= 40 ? 'text-rose-600' : overlapPct >= 20 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {overlapPct.toFixed(1)}%
            </span>
          </div>
        </td>
      </tr>

      {/* Expanded row: common stocks */}
      {expanded && scheme.common_stocks && scheme.common_stocks.length > 0 && (
        <tr className="bg-slate-50/50 dark:bg-slate-900/30">
          <td colSpan={4} className="px-5 py-3">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Common Holdings</p>
            <div className="flex flex-wrap gap-2">
              {scheme.common_stocks.map(stock => (
                <span
                  key={stock.symbol}
                  className="inline-flex items-center gap-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5"
                >
                  <span className="text-slate-800 dark:text-slate-200">{stock.symbol.replace(/\.(NS|BO)$/, '')}</span>
                  {stock.weight_pct !== null && (
                    <span className="text-slate-400 dark:text-slate-500 tabular-nums">{stock.weight_pct.toFixed(1)}%</span>
                  )}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Bar Chart for Popular Holdings ─────────────────────────────────────────────
function PopularHoldings({ holdings, totalSchemes }) {
  if (!holdings || holdings.length === 0) return null
  const maxCount = Math.max(...holdings.map(h => h.found_in_schemes))

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Most Popular Holdings</h3>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">Across {totalSchemes} schemes</span>
      </div>
      <div className="space-y-3">
        {holdings.map(h => {
          const pct = maxCount > 0 ? (h.found_in_schemes / maxCount) * 100 : 0
          return (
            <div key={h.symbol} className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 w-24 sm:w-32 truncate text-right">
                {h.symbol.replace(/\.(NS|BO)$/, '')}
              </span>
              <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 tabular-nums w-14 text-right">
                {h.found_in_schemes} / {totalSchemes}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Insights ───────────────────────────────────────────────────────────────────
function Insights({ overlaps, popularHoldings }) {
  const insights = []

  if (overlaps && overlaps.length > 0) {
    const highest = overlaps.reduce((a, b) => (a.overlap_pct > b.overlap_pct ? a : b))
    if (highest.overlap_pct >= 20) {
      insights.push(`High overlap with ${highest.scheme_name} (${highest.overlap_pct.toFixed(1)}%)`)
    }
  }

  if (popularHoldings && popularHoldings.length > 0) {
    const top = popularHoldings[0]
    if (top.found_in_schemes >= 3) {
      insights.push(`${top.symbol.replace(/\.(NS|BO)$/, '')} is an institutional favorite - found in ${top.found_in_schemes} schemes`)
    }
  }

  if (overlaps) {
    const highOverlap = overlaps.filter(o => o.overlap_pct >= 30)
    if (highOverlap.length >= 2) {
      insights.push(`${highOverlap.length} schemes have 30%+ overlap with your portfolio - consider diversifying`)
    }
  }

  if (insights.length === 0) return null

  return (
    <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">Insights</h3>
      </div>
      <ul className="space-y-1.5">
        {insights.map((insight, i) => (
          <li key={i} className="text-xs text-indigo-700 dark:text-indigo-400 flex items-start gap-2">
            <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
            {insight}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function MutualFunds() {
  const selected = useExchangeStore((s) => s.selected)
  const isNonIndian = selected === 'NASDAQ'

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mf-overlap'],
    queryFn: getMFOverlap,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: !isNonIndian,
  })

  const highestOverlap = data?.overlaps?.length
    ? Math.max(...data.overlaps.map(o => o.overlap_pct ?? 0))
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Mutual Fund Overlap</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">See how your portfolio stocks overlap with popular mutual fund schemes</p>
      </div>

      {/* Non-Indian exchange message */}
      {isNonIndian && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
            <Globe className="w-7 h-7 text-indigo-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Indian markets only</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Mutual fund overlap analysis is available for NSE/BSE stocks. Switch to an Indian market to use this feature.</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {!isNonIndian && isLoading && <LoadingSkeleton />}

      {/* Error */}
      {!isNonIndian && isError && (
        <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 shadow-sm">
          <PieChart className="w-4 h-4 shrink-0" />
          Failed to load mutual fund data: {error?.message || 'Unknown error'}
        </div>
      )}

      {/* Content */}
      {!isNonIndian && !isLoading && data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              label="Your Stocks"
              value={data.user_stock_count ?? 0}
              icon={PieChart}
              iconBg="bg-indigo-50 dark:bg-indigo-900/30"
              iconColor="text-indigo-600 dark:text-indigo-400"
            />
            <SummaryCard
              label="Schemes Analyzed"
              value={data.schemes_analyzed ?? 0}
              icon={Building2}
              iconBg="bg-blue-50 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
            />
            <SummaryCard
              label="Highest Overlap"
              value={`${highestOverlap.toFixed(1)}%`}
              icon={TrendingUp}
              iconBg="bg-amber-50 dark:bg-amber-900/30"
              iconColor="text-amber-600 dark:text-amber-400"
            />
          </div>

          {/* Overlap Table */}
          {data.overlaps && data.overlaps.length > 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                <PieChart className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Scheme Overlap</h3>
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{data.overlaps.length} scheme{data.overlaps.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700 text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
                      <th className="text-left px-5 py-3">Scheme</th>
                      <th className="text-right px-3 py-3">AUM</th>
                      <th className="text-right px-3 py-3">Overlap</th>
                      <th className="text-right px-5 py-3">Weight %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.overlaps
                      .sort((a, b) => (b.overlap_pct ?? 0) - (a.overlap_pct ?? 0))
                      .map((scheme, i) => (
                        <OverlapRow key={i} scheme={scheme} />
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                <PieChart className="w-7 h-7 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No overlap data available</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Add stocks to your portfolio to analyze mutual fund overlap</p>
              </div>
            </div>
          )}

          {/* Popular Holdings Bar Chart */}
          <PopularHoldings
            holdings={data.most_popular_holdings}
            totalSchemes={data.schemes_analyzed ?? 0}
          />

          {/* Insights */}
          <Insights
            overlaps={data.overlaps}
            popularHoldings={data.most_popular_holdings}
          />
        </>
      )}
    </div>
  )
}
