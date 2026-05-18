import clsx from 'clsx'
import { TrendingUp, TrendingDown } from 'lucide-react'

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 tabular-nums">{value ?? '—'}</p>
    </div>
  )
}

function cur(symbol) {
  return (symbol?.endsWith('.NS') || symbol?.endsWith('.BO')) ? '₹' : '$'
}

export default function QuoteCard({ quote }) {
  if (!quote) {return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse h-52" />
  )}
  const isUp = quote.change >= 0
  const c = cur(quote.symbol)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4 gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{quote.symbol}</p>
          <p className="text-sm text-slate-600 mt-0.5 leading-snug">{quote.name}</p>
        </div>
        <span className={clsx(
          'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full shrink-0',
          isUp ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        )}>
          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isUp ? '+' : ''}{quote.change_pct?.toFixed(2)}%
        </span>
      </div>

      <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums mb-0.5">
        {c}{quote.current_price?.toFixed(2)}
      </p>
      <p className={clsx('text-sm font-medium tabular-nums mb-5', isUp ? 'text-emerald-600' : 'text-rose-600')}>
        {isUp ? '▲' : '▼'} {c}{Math.abs(quote.change)?.toFixed(2)}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100">
        <Stat label="Day High" value={`${c}${quote.day_high?.toFixed(2)}`} />
        <Stat label="Day Low"  value={`${c}${quote.day_low?.toFixed(2)}`} />
        <Stat label="P/E"      value={quote.pe_ratio?.toFixed(1) ?? 'N/A'} />
        <Stat label="52W High" value={`${c}${quote.week_52_high?.toFixed(2)}`} />
        <Stat label="52W Low"  value={`${c}${quote.week_52_low?.toFixed(2)}`} />
        <Stat label="Volume"   value={quote.volume?.toLocaleString()} />
      </div>
    </div>
  )
}
