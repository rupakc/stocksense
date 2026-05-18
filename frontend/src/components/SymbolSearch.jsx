import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Loader2, Plus, X } from 'lucide-react'
import { searchSymbols } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'

const EXCHANGES = ['NSE', 'BSE', 'NASDAQ']

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function SymbolSearch({ onAdd, isAdding }) {
  const globalExchange = useExchangeStore((s) => s.selected)
  const [query, setQuery]       = useState('')
  const [exchange, setExchange] = useState(() => {
    if (globalExchange && globalExchange !== 'ALL') return globalExchange
    return 'NSE'
  })
  const [results, setResults]   = useState([])
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [activeIdx, setActiveIdx] = useState(-1)

  const inputRef    = useRef(null)
  const dropdownRef = useRef(null)
  const debouncedQ  = useDebounce(query, 220)

  useEffect(() => {
    if (globalExchange && globalExchange !== 'ALL') setExchange(globalExchange)
  }, [globalExchange])

  useEffect(() => {
    if (!debouncedQ.trim() || selected) { setResults([]); setOpen(false); return }
    let cancelled = false
    setLoading(true)
    searchSymbols(debouncedQ, exchange)
      .then(data => { if (cancelled) return; setResults(data); setOpen(data.length > 0); setActiveIdx(-1) })
      .catch(() => setResults([]))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedQ, selected, exchange])

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
    setSelected(item); setQuery(item.symbol); setOpen(false); setResults([])
    inputRef.current?.focus()
  }, [])

  const clear = () => {
    setSelected(null); setQuery(''); setResults([]); setOpen(false)
    inputRef.current?.focus()
  }

  const handleAdd = () => {
    const sym = selected?.symbol ?? query.trim().toUpperCase()
    if (!sym) return
    onAdd(sym, exchange)
    clear()
  }

  const handleKeyDown = (e) => {
    if (!open) { if (e.key === 'Enter') handleAdd(); return }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); activeIdx >= 0 && results[activeIdx] ? choose(results[activeIdx]) : handleAdd() }
    else if (e.key === 'Escape') setOpen(false)
  }

  const badgeColor = exchange === 'NASDAQ'
    ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-slate-100 text-slate-600 border-slate-200'

  return (
    <div className="flex gap-2 items-start">
      {/* Exchange toggle */}
      <div className="flex rounded-xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
        {EXCHANGES.map(ex => (
          <button
            key={ex}
            onClick={() => { setExchange(ex); setResults([]); setSelected(null) }}
            className={`px-3 py-2.5 text-xs font-semibold transition-colors ${
              exchange === ex
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="relative flex-1">
        <div className={`flex items-center gap-2 bg-white border rounded-xl px-3 py-2.5 transition-all ${
          open
            ? 'border-indigo-400 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]'
            : 'border-slate-200 hover:border-slate-300 shadow-sm'
        }`}>
          {loading
            ? <Loader2 className="w-4 h-4 text-slate-400 shrink-0 animate-spin" />
            : <Search className="w-4 h-4 text-slate-400 shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 min-w-0"
            placeholder={exchange === 'NASDAQ' ? 'Search NASDAQ symbol or company…' : 'Search NSE symbol or company…'}
            value={query}
            onChange={e => { setSelected(null); setQuery(e.target.value.toUpperCase()) }}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          {query && (
            <button onClick={clear} className="text-slate-400 hover:text-slate-600 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {open && (
          <div
            ref={dropdownRef}
            className="absolute z-50 left-0 right-0 top-[calc(100%+6px)] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
          >
            <ul className="max-h-64 overflow-y-auto py-1">
              {results.map((item, idx) => (
                <li key={item.symbol}>
                  <button
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                      idx === activeIdx ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                    onMouseDown={e => { e.preventDefault(); choose(item) }}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{item.symbol}</p>
                      <p className="text-xs text-slate-400 truncate">{item.name}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0 ${badgeColor}`}>
                      {exchange}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selected && (
          <p className="mt-1.5 text-xs text-slate-500 px-1">{selected.name}</p>
        )}
      </div>

      <button
        onClick={handleAdd}
        disabled={isAdding || !query.trim()}
        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm disabled:opacity-40 shrink-0"
      >
        {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Add
      </button>
    </div>
  )
}
