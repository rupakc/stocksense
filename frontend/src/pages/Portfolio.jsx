import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPortfolioAdvice } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw, Briefcase,
} from 'lucide-react'

// ── Advisor ────────────────────────────────────────────────────────────────
const SIGNAL_META = {
  BUY:   { textColor: 'text-emerald-700', bgColor: 'bg-emerald-50',  border: 'border-emerald-200', pill: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', Icon: TrendingUp  },
  HOLD:  { textColor: 'text-amber-700',   bgColor: 'bg-amber-50',    border: 'border-amber-200',   pill: 'bg-amber-100  text-amber-700',   bar: 'bg-amber-400',   Icon: Minus       },
  WATCH: { textColor: 'text-indigo-700',  bgColor: 'bg-indigo-50',   border: 'border-indigo-200',  pill: 'bg-indigo-100 text-indigo-700',  bar: 'bg-indigo-400',  Icon: Minus       },
  SELL:  { textColor: 'text-rose-700',    bgColor: 'bg-rose-50',     border: 'border-rose-200',    pill: 'bg-rose-100   text-rose-700',    bar: 'bg-rose-500',    Icon: TrendingDown },
}

const RISK_STYLE = {
  high:   'text-rose-600 bg-rose-50 border-rose-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low:    'text-emerald-600 bg-emerald-50 border-emerald-200',
}

function fmtCurrency(v, symbol) {
  const cur = (symbol?.endsWith('.NS') || symbol?.endsWith('.BO')) ? '₹' : '$'
  return `${cur}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
}

function ScoreBar({ value, barClass }) {
  const pct = Math.round(((value + 1) / 2) * 100)
  return (
    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function SignalBreakdown({ label, score }) {
  const barClass = score > 0.1 ? 'bg-emerald-400' : score < -0.1 ? 'bg-rose-400' : 'bg-amber-400'
  const textClass = score > 0.1 ? 'text-emerald-700' : score < -0.1 ? 'text-rose-700' : 'text-amber-700'
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-16 shrink-0">{label}</span>
      <ScoreBar value={score} barClass={barClass} />
      <span className={`text-[10px] font-mono w-10 text-right tabular-nums ${textClass}`}>
        {score >= 0 ? '+' : ''}{score.toFixed(2)}
      </span>
    </div>
  )
}

function AdvisoryCard({ rec }) {
  const meta = SIGNAL_META[rec.signal] ?? SIGNAL_META.HOLD
  const Icon = meta.Icon
  const compositeBar = rec.composite_score >= 0.3 ? 'bg-emerald-500' : rec.composite_score >= 0 ? 'bg-amber-400' : 'bg-rose-500'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className={`h-1 w-full ${meta.bar}`} />
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-900">{rec.symbol.replace(/\.(NS|BO)$/, '')}</p>
            <p className="text-xs text-slate-400 mt-0.5">{rec.symbol}</p>
            {rec.last_close !== null && (
              <p className="text-lg font-bold text-slate-900 tabular-nums mt-1">{fmtCurrency(rec.last_close, rec.symbol)}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${meta.pill}`}>
              <Icon className="w-3.5 h-3.5" />
              {rec.signal}
            </span>
            <span className="text-[10px] text-slate-400 capitalize">{rec.confidence} confidence</span>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
            <span className="uppercase tracking-widest">Composite Score</span>
            <span className={`font-semibold tabular-nums ${meta.textColor}`}>
              {rec.composite_score >= 0 ? '+' : ''}{rec.composite_score.toFixed(3)}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${compositeBar}`} style={{ width: `${((rec.composite_score + 1) / 2) * 100}%` }} />
          </div>
        </div>
        <div className="space-y-2">
          <SignalBreakdown label="Technical"  score={rec.technical_score} />
          <SignalBreakdown label="ML Predict" score={rec.prediction_score} />
          <SignalBreakdown label="Sentiment"  score={rec.sentiment_score} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {rec.rsi !== null && (
            <span className="inline-flex flex-col text-[10px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <span className="text-slate-400 uppercase tracking-widest">RSI</span>
              <span className={`font-bold ${rec.rsi < 35 ? 'text-emerald-600' : rec.rsi > 65 ? 'text-rose-600' : 'text-slate-700'}`}>{rec.rsi}</span>
            </span>
          )}
          {rec.predicted_7d_return !== null && (
            <span className="inline-flex flex-col text-[10px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <span className="text-slate-400 uppercase tracking-widest">7d Target</span>
              <span className={`font-bold ${rec.predicted_7d_return >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {rec.predicted_7d_return >= 0 ? '+' : ''}{rec.predicted_7d_return.toFixed(1)}%
              </span>
            </span>
          )}
          {rec.sentiment_label && (
            <span className="inline-flex flex-col text-[10px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <span className="text-slate-400 uppercase tracking-widest">Sentiment</span>
              <span className={`font-bold capitalize ${rec.sentiment_label === 'bullish' ? 'text-emerald-600' : rec.sentiment_label === 'bearish' ? 'text-rose-600' : 'text-slate-500'}`}>
                {rec.sentiment_label}
              </span>
            </span>
          )}
          {rec.risk_level && (
            <span className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border capitalize ${RISK_STYLE[rec.risk_level]}`}>
              {rec.risk_level} risk
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-3">{rec.rationale}</p>
      </div>
    </div>
  )
}

function SummaryTile({ signal, count }) {
  const meta = SIGNAL_META[signal] ?? SIGNAL_META.HOLD
  const Icon = meta.Icon
  return (
    <div className={`bg-white rounded-2xl border ${meta.border} shadow-sm p-4 text-center`}>
      <Icon className={`w-5 h-5 mx-auto mb-2 ${meta.textColor}`} />
      <p className={`text-2xl font-bold ${meta.textColor}`}>{count}</p>
      <p className={`text-xs font-semibold ${meta.textColor}`}>{signal}</p>
    </div>
  )
}

function AdvisorTab() {
  const globalExchange = useExchangeStore((s) => s.selected)
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)
  const { data: rawData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolioAdvice,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })

  const data = rawData?.filter(r => matchesSelected(r.symbol)) ?? null
  const counts = { BUY: 0, HOLD: 0, WATCH: 0, SELL: 0 }
  data?.forEach(r => { if (counts[r.signal] !== undefined) counts[r.signal]++ })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 shadow-sm shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-80 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 text-rose-700 text-sm bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Failed to load advisory: {error.message}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Briefcase className="w-7 h-7 text-indigo-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">No stocks in your watchlist</p>
            <p className="text-xs text-slate-400 mt-1">Add stocks to your watchlist to receive advisory signals</p>
          </div>
        </div>
      )}

      {data && data.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(counts).map(([sig, n]) => (
              <SummaryTile key={sig} signal={sig} count={n} />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map(rec => <AdvisoryCard key={rec.symbol} rec={rec} />)}
          </div>
        </>
      )}
    </div>
  )
}

export default function Portfolio() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Portfolio</h1>
        <p className="text-sm text-slate-500 mt-1">AI-powered advisory signals for your watchlist</p>
      </div>
      <AdvisorTab />
    </div>
  )
}
