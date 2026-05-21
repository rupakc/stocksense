import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getEarnings, getDividends } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'
import { Calendar, Clock, TrendingUp, AlertTriangle, DollarSign, ChevronDown, ChevronUp } from 'lucide-react'

function curFor(symbol) {
  return (symbol?.endsWith('.NS') || symbol?.endsWith('.BO')) ? '₹' : '$'
}

function displaySym(symbol) {
  return symbol?.replace(/\.(NS|BO)$/, '') ?? symbol
}

function BeatRateBadge({ beatRate }) {
  if (beatRate === null) return null
  const color = beatRate >= 75
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : beatRate >= 50
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-rose-50 text-rose-700 border-rose-200'
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      Beat {beatRate}% of last 8 quarters
    </span>
  )
}

function EarningsHistoryTable({ history }) {
  if (!history || history.length === 0) return null
  const display = history.slice(0, 4)
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Recent Quarters</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-slate-400 border-b border-slate-100">
            <th className="text-left py-1">Date</th>
            <th className="text-right py-1">EPS Est</th>
            <th className="text-right py-1">EPS Actual</th>
            <th className="text-right py-1">Surprise</th>
          </tr>
        </thead>
        <tbody>
          {display.map((h, i) => {
            const isBeat = h.surprise_pct !== null && h.surprise_pct > 0
            const isMiss = h.surprise_pct !== null && h.surprise_pct < 0
            return (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-1 text-slate-600 tabular-nums">{h.date}</td>
                <td className="py-1 text-right tabular-nums text-slate-500">
                  {h.eps_estimate !== null ? h.eps_estimate.toFixed(2) : '--'}
                </td>
                <td className="py-1 text-right tabular-nums text-slate-700 font-medium">
                  {h.eps_actual !== null ? h.eps_actual.toFixed(2) : '--'}
                </td>
                <td className={`py-1 text-right tabular-nums font-semibold ${
                  isBeat ? 'text-emerald-600' : isMiss ? 'text-rose-600' : 'text-slate-400'
                }`}>
                  {h.surprise_pct !== null ? `${h.surprise_pct > 0 ? '+' : ''}${h.surprise_pct.toFixed(2)}%` : '--'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EarningsCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  const hasDate = !!item.next_earnings_date
  const dateStr = hasDate ? new Date(item.next_earnings_date).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : null

  const now = new Date()
  const earningsDate = hasDate ? new Date(item.next_earnings_date) : null
  const daysUntil = earningsDate ? Math.ceil((earningsDate - now) / (1000 * 60 * 60 * 24)) : null
  const isUpcoming = daysUntil !== null && daysUntil >= 0 && daysUntil <= 14
  const isPast = daysUntil !== null && daysUntil < 0
  const hasHistory = item.earnings_history && item.earnings_history.length > 0

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 transition-shadow hover:shadow-md ${
      isUpcoming ? 'border-amber-200' : 'border-slate-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-slate-900">{displaySym(item.symbol)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{item.name}</p>
          {item.sector && <p className="text-[10px] text-slate-400 mt-0.5">{item.sector}</p>}
        </div>
        {hasDate && (
          <div className={`text-right shrink-0 ${isUpcoming ? 'text-amber-600' : isPast ? 'text-slate-400' : 'text-slate-600'}`}>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">{dateStr}</span>
            </div>
            {daysUntil !== null && !isPast && (
              <p className={`text-[10px] font-semibold mt-1 ${isUpcoming ? 'text-amber-600' : 'text-slate-400'}`}>
                {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`}
              </p>
            )}
            {isPast && (
              <p className="text-[10px] text-slate-400 mt-1">{Math.abs(daysUntil)} days ago</p>
            )}
          </div>
        )}
        {!hasDate && (
          <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full">
            No date
          </span>
        )}
      </div>

      {/* Beat rate badge */}
      {item.beat_rate !== null && (
        <div className="mt-3">
          <BeatRateBadge beatRate={item.beat_rate} />
        </div>
      )}

      {(item.earnings_estimate || item.revenue_estimate) && (
        <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
          {item.earnings_estimate !== null && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">EPS Est.</p>
              <p className="text-sm font-semibold text-slate-800 tabular-nums mt-0.5">
                {curFor(item.symbol)}{typeof item.earnings_estimate === 'number' ? item.earnings_estimate.toFixed(2) : item.earnings_estimate}
              </p>
            </div>
          )}
          {item.revenue_estimate !== null && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Revenue Est.</p>
              <p className="text-sm font-semibold text-slate-800 tabular-nums mt-0.5">
                {curFor(item.symbol)}{typeof item.revenue_estimate === 'number'
                  ? ((item.symbol?.endsWith('.NS') || item.symbol?.endsWith('.BO'))
                    ? `${(item.revenue_estimate / 1e7).toFixed(1)  } Cr`
                    : `${(item.revenue_estimate / 1e9).toFixed(2)  }B`)
                  : item.revenue_estimate}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Expandable earnings history */}
      {hasHistory && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Hide' : 'Show'} earnings history
          </button>
          {expanded && <EarningsHistoryTable history={item.earnings_history} />}
        </>
      )}
    </div>
  )
}

function DividendCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  const hasExDate = !!item.ex_date
  const exDateStr = hasExDate ? new Date(item.ex_date).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : null

  const now = new Date()
  const exDate = hasExDate ? new Date(item.ex_date) : null
  const daysUntil = exDate ? Math.ceil((exDate - now) / (1000 * 60 * 60 * 24)) : null
  const isUpcoming = daysUntil !== null && daysUntil >= 0 && daysUntil <= 14

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 transition-shadow hover:shadow-md ${
      isUpcoming ? 'border-emerald-200' : 'border-slate-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-slate-900">{displaySym(item.symbol)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{item.name}</p>
        </div>
        {item.dividend_yield !== null && (
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-emerald-600 tabular-nums">
              {(item.dividend_yield * 100).toFixed(2)}%
            </p>
            <p className="text-[10px] text-slate-400">Yield</p>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
        {item.dividend_rate !== null && (
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Annual Rate</p>
            <p className="text-sm font-semibold text-slate-800 tabular-nums mt-0.5">
              {curFor(item.symbol)}{item.dividend_rate.toFixed(2)}
            </p>
          </div>
        )}
        {hasExDate && (
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Ex-Dividend Date</p>
            <p className={`text-sm font-semibold mt-0.5 ${isUpcoming ? 'text-emerald-600' : 'text-slate-800'}`}>
              {exDateStr}
              {daysUntil !== null && daysUntil >= 0 && (
                <span className="text-[10px] text-slate-400 ml-1">
                  ({daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`})
                </span>
              )}
            </p>
          </div>
        )}
        {item.payout_ratio !== null && (
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Payout Ratio</p>
            <p className="text-sm font-semibold text-slate-800 tabular-nums mt-0.5">
              {(item.payout_ratio * 100).toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      {/* Recent dividends history */}
      {item.recent_dividends && item.recent_dividends.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Hide' : 'Show'} recent dividends
          </button>
          {expanded && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-400 border-b border-slate-100">
                    <th className="text-left py-1">Date</th>
                    <th className="text-right py-1">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {item.recent_dividends.map((d, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1 text-slate-600 tabular-nums">{d.date}</td>
                      <td className="py-1 text-right tabular-nums text-slate-700 font-medium">{curFor(item.symbol)}{d.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function Earnings() {
  const [tab, setTab] = useState('earnings')
  const globalExchange = useExchangeStore((s) => s.selected)
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)

  const { data: rawEarnings, isLoading: earningsLoading, error: earningsError } = useQuery({
    queryKey: ['earnings'],
    queryFn: getEarnings,
    staleTime: 30 * 60 * 1000,
  })

  const { data: rawDividends, isLoading: dividendsLoading, error: dividendsError } = useQuery({
    queryKey: ['dividends'],
    queryFn: getDividends,
    staleTime: 30 * 60 * 1000,
    enabled: tab === 'dividends',
  })

  const earnings = rawEarnings?.filter(e => matchesSelected(e.symbol)) ?? null
  const dividends = rawDividends?.filter(d => matchesSelected(d.symbol)) ?? null

  const upcoming = earnings?.filter(e => {
    if (!e.next_earnings_date) return false
    const d = new Date(e.next_earnings_date)
    return d >= new Date(new Date().setHours(0, 0, 0, 0))
  }) || []

  const past = earnings?.filter(e => {
    if (!e.next_earnings_date) return false
    const d = new Date(e.next_earnings_date)
    return d < new Date(new Date().setHours(0, 0, 0, 0))
  }) || []

  const noDate = earnings?.filter(e => !e.next_earnings_date) || []

  const isLoading = tab === 'earnings' ? earningsLoading : dividendsLoading
  const error = tab === 'earnings' ? earningsError : dividendsError

  // Split dividends by upcoming ex-date vs past
  const upcomingDividends = dividends?.filter(d => {
    if (!d.ex_date) return false
    return new Date(d.ex_date) >= new Date(new Date().setHours(0, 0, 0, 0))
  }) || []
  const pastDividends = dividends?.filter(d => {
    if (!d.ex_date) return false
    return new Date(d.ex_date) < new Date(new Date().setHours(0, 0, 0, 0))
  }) || []
  const noDividendDate = dividends?.filter(d => !d.ex_date) || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Earnings & Dividends</h1>
        <p className="text-sm text-slate-500 mt-1">Track earnings announcements and dividend events for your watchlist</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('earnings')}
          className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all ${
            tab === 'earnings'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Earnings Calendar
          </span>
        </button>
        <button
          onClick={() => setTab('dividends')}
          className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all ${
            tab === 'dividends'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> Dividends
          </span>
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 text-rose-700 text-sm bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Failed to load data: {error.message}
        </div>
      )}

      {/* Earnings Calendar Tab */}
      {tab === 'earnings' && !isLoading && !error && (
        <>
          {earnings && earnings.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <Calendar className="w-7 h-7 text-indigo-500" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No earnings data</p>
              <p className="text-xs text-slate-400">Add stocks to your watchlist to see upcoming earnings</p>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-amber-500" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Upcoming ({upcoming.length})</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {upcoming.map(e => <EarningsCard key={e.symbol} item={e} />)}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Past ({past.length})</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {past.map(e => <EarningsCard key={e.symbol} item={e} />)}
              </div>
            </div>
          )}

          {noDate.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">No Date Available ({noDate.length})</p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {noDate.map(e => <EarningsCard key={e.symbol} item={e} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Dividends Tab */}
      {tab === 'dividends' && !isLoading && !error && (
        <>
          {dividends && dividends.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <DollarSign className="w-7 h-7 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No dividend data</p>
              <p className="text-xs text-slate-400">Add stocks to your watchlist to see dividend information</p>
            </div>
          )}

          {upcomingDividends.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-emerald-500" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Upcoming Ex-Dates ({upcomingDividends.length})</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {upcomingDividends.map(d => <DividendCard key={d.symbol} item={d} />)}
              </div>
            </div>
          )}

          {pastDividends.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Past ({pastDividends.length})</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pastDividends.map(d => <DividendCard key={d.symbol} item={d} />)}
              </div>
            </div>
          )}

          {noDividendDate.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                {upcomingDividends.length > 0 || pastDividends.length > 0 ? 'Other' : 'All'} Dividend Stocks ({noDividendDate.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {noDividendDate.map(d => <DividendCard key={d.symbol} item={d} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
