import { useQuery } from '@tanstack/react-query'
import { getEconomicIndicators, getForexRates } from '../services/api'
import clsx from 'clsx'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ── Live ticker card ────────────────────────────────────────────────────────
function LiveCard({ label, data }) {
  if (!data?.price) return null
  const isUp   = (data.change_pct ?? 0) > 0
  const isDown = (data.change_pct ?? 0) < 0
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2 truncate">{label}</p>
      <p className="text-lg font-bold text-slate-900 tabular-nums leading-tight">
        {data.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </p>
      <div className={clsx(
        'flex items-center gap-1 mt-1 text-xs font-semibold',
        isUp ? 'text-emerald-600' : isDown ? 'text-rose-600' : 'text-slate-400'
      )}>
        {isUp ? <TrendingUp className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        {data.change_pct >= 0 ? '+' : ''}{data.change_pct?.toFixed(2)}%
      </div>
    </div>
  )
}

// ── World Bank indicator row ────────────────────────────────────────────────
function IndicatorRow({ item }) {
  if (item.error) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
        <p className="text-sm text-slate-700">{item.label}</p>
        <span className="text-xs text-slate-400 italic">Unavailable</span>
      </div>
    )
  }
  const latest = item.data?.[0]
  const prev   = item.data?.[1]
  const trend  = latest && prev && latest.value !== null && prev.value !== null
    ? latest.value - prev.value : null

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0 gap-4">
      <p className="text-sm text-slate-700 min-w-0 flex-1">{item.label}</p>
      <div className="flex items-center gap-3 shrink-0">
        {/* Spark — last 4 values */}
        <div className="hidden sm:flex items-end gap-0.5 h-6">
          {item.data?.slice(0, 4).reverse().map((d, i) => {
            const max = Math.max(...item.data.slice(0,4).map(x => Math.abs(x.value ?? 0)))
            const pct = max > 0 ? Math.abs(d.value ?? 0) / max : 0
            return (
              <div
                key={i}
                className={clsx(
                  'w-1.5 rounded-sm',
                  (d.value ?? 0) >= 0 ? 'bg-emerald-400' : 'bg-rose-400'
                )}
                style={{ height: `${Math.max(10, pct * 100)}%` }}
                title={`${d.year}: ${d.value}`}
              />
            )
          })}
        </div>
        {latest && (
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900 tabular-nums">
              {latest.value?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-slate-400">{latest.year}</p>
          </div>
        )}
        {trend !== null && (
          <div className={clsx(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded',
            trend >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
          )}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(2)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, children, cols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">{title}</h2>
      <div className={`grid ${cols} gap-3`}>{children}</div>
    </section>
  )
}

function WBSection({ title, items }) {
  if (!items?.length) return null
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="px-5">
        {items.map((item, i) => <IndicatorRow key={i} item={item} />)}
      </div>
    </div>
  )
}

// ── Skeleton loaders ────────────────────────────────────────────────────────
function SkeletonGrid({ n = 8, cols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' }) {
  return (
    <div className={`grid ${cols} gap-3`}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-20 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse" />
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function EconomicIndicators() {
  const { data: indicators, isLoading: wbLoading } = useQuery({
    queryKey: ['economic'],
    queryFn: getEconomicIndicators,
  })
  const { data: live, isLoading: liveLoading } = useQuery({
    queryKey: ['forex'],
    queryFn: getForexRates,
    refetchInterval: 5 * 60 * 1000,   // refresh every 5 min
  })

  // Group live data by category
  const liveGroups = live
    ? Object.entries(live).reduce((acc, [label, data]) => {
        const cat = data.category ?? 'Other'
        if (!acc[cat]) acc[cat] = []
        acc[cat].push([label, data])
        return acc
      }, {})
    : {}

  const LIVE_SECTION_COLS = {
    'Forex':           'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    'Commodities':     'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    'Indian Indices':  'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
    'Global Indices':  'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Economic Indicators</h1>
        <p className="text-sm text-slate-500 mt-1">
          Live market data · World Bank macro indicators · Refreshes every 5 min
        </p>
      </div>

      {/* ── Live market data ── */}
      {liveLoading ? (
        <>
          <SkeletonGrid n={5} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />
          <SkeletonGrid n={8} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" />
        </>
      ) : (
        Object.entries(liveGroups).map(([category, entries]) => (
          <Section key={category} title={category} cols={LIVE_SECTION_COLS[category]}>
            {entries.map(([label, data]) => (
              <LiveCard key={label} label={label} data={data} />
            ))}
          </Section>
        ))
      )}

      {/* ── World Bank indicators ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
          World Bank — Annual Macro Data
        </h2>
        {wbLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse" />
            ))}
          </div>
        ) : indicators && (
          <div className="space-y-4">
            {Object.entries(indicators).map(([category, items]) => (
              <WBSection key={category} title={category} items={items} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
