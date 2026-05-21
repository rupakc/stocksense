import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Trash2, TrendingUp, TrendingDown, Download } from 'lucide-react'
import { getWatchlist, addToWatchlist, removeFromWatchlist, getQuote, getQuotesBatch } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'
import SymbolSearch from '../components/SymbolSearch'
import { useToast } from '../components/Toast'

function currencySymbol(symbol) {
  return (symbol?.endsWith('.NS') || symbol?.endsWith('.BO')) ? '₹' : '$'
}

function displayName(symbol) {
  return symbol?.replace(/\.(NS|BO)$/, '') ?? symbol
}

function exchangeBadge(s) {
  const ex = s.exchange || (s.symbol?.endsWith('.NS') ? 'NSE' : s.symbol?.endsWith('.BO') ? 'BSE' : 'NASDAQ')
  const color = ex === 'NASDAQ' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${color}`}>{ex}</span>
}

function WatchlistRow({ s, onRemove }) {
  const { data: quote } = useQuery({
    queryKey: ['quote', s.symbol],
    queryFn: () => getQuote(s.symbol),
    refetchInterval: 60000,
  })
  const isUp = (quote?.change ?? 0) >= 0
  const cur = currencySymbol(s.symbol)

  return (
    <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 hover:bg-slate-50 transition-colors group">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isUp ? 'bg-emerald-50' : 'bg-rose-50'}`}>
          {isUp
            ? <TrendingUp className="w-4 h-4 text-emerald-600" />
            : <TrendingDown className="w-4 h-4 text-rose-600" />
          }
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={`/stock/${encodeURIComponent(s.symbol)}`}
              className="font-semibold text-sm text-slate-800 hover:text-indigo-600 transition-colors"
            >
              {displayName(s.symbol)}
            </Link>
            {exchangeBadge(s)}
          </div>
          <p className="text-xs text-slate-400 truncate max-w-[130px] sm:max-w-[200px]">{s.name ?? s.sector ?? ''}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {quote ? (
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900 tabular-nums">{cur}{quote.current_price?.toFixed(2)}</p>
            <p className={`text-xs font-medium tabular-nums ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
              {isUp ? '+' : ''}{quote.change_pct?.toFixed(2)}%
            </p>
          </div>
        ) : (
          <div className="text-right space-y-1.5">
            <div className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
            <div className="h-3 w-10 bg-slate-100 rounded animate-pulse ml-auto" />
          </div>
        )}
        <button
          onClick={() => onRemove(s.symbol)}
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-all"
          aria-label="Remove"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function exportCsv(watchlist, quotes) {
  const rows = [['Symbol', 'Name', 'Sector', 'Exchange', 'Price', 'Change %', 'Day High', 'Day Low', 'Volume']]
  watchlist.forEach(s => {
    const q = quotes?.[s.symbol]
    rows.push([
      s.symbol, s.name || '', s.sector || '', s.exchange,
      q?.current_price?.toFixed(2) || '', q?.change_pct?.toFixed(2) || '',
      q?.day_high || '', q?.day_low || '', q?.volume || '',
    ])
  })
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stocksense-watchlist-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Watchlist() {
  const qc = useQueryClient()
  const toast = useToast()
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)
  const selectedExchange = useExchangeStore((s) => s.selected)
  const { data: watchlist = [] } = useQuery({ queryKey: ['watchlist'], queryFn: getWatchlist })

  const filtered = watchlist.filter(s => matchesSelected(s.symbol))
  const symbols = filtered.map(s => s.symbol)
  const { data: batchQuotes } = useQuery({
    queryKey: ['watchlist-quotes', symbols.join(',')],
    queryFn: () => getQuotesBatch(symbols),
    enabled: symbols.length > 0,
  })

  const add = useMutation({
    mutationFn: ({ symbol, exchange }) => addToWatchlist(symbol, exchange),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
      toast('Stock added to watchlist', 'success')
    },
    onError: (err) => toast(err?.response?.data?.detail || 'Could not add symbol', 'error'),
  })
  const remove = useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
      toast('Removed from watchlist', 'success')
    },
    onError: () => toast('Failed to remove stock', 'error'),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Watchlist</h1>
          <p className="text-sm text-slate-500 mt-1">Search and track NSE & NASDAQ stocks with live quotes</p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={() => exportCsv(filtered, batchQuotes)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-50 shadow-sm shrink-0"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Add a Stock</p>
        <SymbolSearch onAdd={(sym, exchange) => add.mutate({ symbol: sym, exchange })} isAdding={add.isPending} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {filtered.map((s) => (
              <WatchlistRow key={s.symbol} s={s} onRemove={(sym) => remove.mutate(sym)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <TrendingUp className="w-7 h-7 text-indigo-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {watchlist.length > 0 ? `No stocks for ${selectedExchange}` : 'No stocks tracked yet'}
              </p>
              <p className="text-xs text-slate-400 mt-1">Search for an NSE or NASDAQ symbol above to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
