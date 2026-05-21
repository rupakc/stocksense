import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Newspaper, Globe, Search, X, TrendingUp, TrendingDown, Minus,
  RefreshCw, AlertCircle, ExternalLink, Zap, Star, Clock, BarChart2,
  Bookmark, Filter,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import { getNews, searchWebNews, searchSymbols } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'

// ── Source type badge ─────────────────────────────────────────────────────────
const SOURCE_TYPE_META = {
  yfinance:   { label: 'Yahoo Finance', color: 'bg-violet-100 text-violet-700', icon: '📈' },
  google_rss: { label: 'Google News',   color: 'bg-blue-100 text-blue-700',    icon: '🔵' },
  ddg:        { label: 'Web Search',    color: 'bg-orange-100 text-orange-700', icon: '🔍' },
  bing_rss:   { label: 'Bing News',     color: 'bg-cyan-100 text-cyan-700',    icon: '🌐' },
  rss:        { label: 'RSS',           color: 'bg-slate-100 text-slate-600',  icon: '📡' },
}

function SourceBadge({ sourceType }) {
  const meta = SOURCE_TYPE_META[sourceType] ?? SOURCE_TYPE_META.rss
  return (
    <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', meta.color)}>
      {meta.label}
    </span>
  )
}

// ── Sentiment display ─────────────────────────────────────────────────────────
function SentimentDot({ score }) {
  if (score === null) return null
  const isUp = score > 0.05
  const isDn = score < -0.05
  return (
    <span className={clsx(
      'flex items-center gap-0.5 text-[11px] font-semibold',
      isUp ? 'text-emerald-600' : isDn ? 'text-rose-600' : 'text-slate-400'
    )}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : isDn ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {score > 0 ? '+' : ''}{score.toFixed(2)}
    </span>
  )
}

// ── Relevance bar ─────────────────────────────────────────────────────────────
function RelevanceBar({ score }) {
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-slate-300'
  return (
    <div className="flex items-center gap-1.5" title={`Relevance: ${pct}%`}>
      <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-400 tabular-nums">{pct}%</span>
    </div>
  )
}

// ── RSS news card (compact) ────────────────────────────────────────────────────
function RssCard({ article }) {
  const score = article.sentiment_compound
  const dotClass = score > 0.05 ? 'bg-emerald-500' : score < -0.05 ? 'bg-rose-500' : 'bg-slate-300'

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group"
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', dotClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug">
          {article.title}
        </p>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 flex-wrap">
          <span className="font-semibold text-slate-500">{article.source}</span>
          <span>·</span>
          <span>{format(new Date(article.published_at), 'MMM d, HH:mm')}</span>
          {score !== null && (
            <>
              <span>·</span>
              <SentimentDot score={score} />
            </>
          )}
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  )
}

// ── Web search news card (rich) ────────────────────────────────────────────────
function WebCard({ article }) {
  const score = article.sentiment_compound
  const isUp = score > 0.05
  const isDn = score < -0.05

  let relativeTime = ''
  try {
    relativeTime = formatDistanceToNow(new Date(article.published_at), { addSuffix: true })
  } catch {
    relativeTime = article.published_at?.slice(0, 10) ?? ''
  }

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all overflow-hidden flex flex-col"
    >
      {/* Thumbnail */}
      {article.thumbnail && (
        <div className="w-full h-36 overflow-hidden bg-slate-100 shrink-0">
          <img
            src={article.thumbnail}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { e.target.parentElement.style.display = 'none' }}
          />
        </div>
      )}

      {/* Content */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Source + time */}
        <div className="flex items-center gap-2 flex-wrap">
          <SourceBadge sourceType={article.source_type} />
          <span className="text-[10px] text-slate-400 font-medium">{article.source}</span>
          <span className="text-[10px] text-slate-300">·</span>
          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" /> {relativeTime}
          </span>
        </div>

        {/* Title */}
        <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors leading-snug line-clamp-3">
          {article.title}
        </p>

        {/* Summary */}
        {article.summary && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
            {article.summary}
          </p>
        )}

        {/* Footer: relevance + sentiment */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-medium">Relevance</span>
            <RelevanceBar score={article.relevance_score} />
          </div>
          <SentimentDot score={score} />
        </div>
      </div>
    </a>
  )
}

// ── Sentiment summary panel ────────────────────────────────────────────────────
function SentimentSummary({ articles, symbol }) {
  if (!articles?.length) return null
  const scores = articles.map(a => a.sentiment_compound).filter(s => s !== null)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const bullish = scores.filter(s => s > 0.05).length
  const bearish = scores.filter(s => s < -0.05).length
  const neutral = scores.length - bullish - bearish
  const label   = avg > 0.05 ? 'Bullish' : avg < -0.05 ? 'Bearish' : 'Neutral'
  const labelColor = avg > 0.05 ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                   : avg < -0.05 ? 'text-rose-600 bg-rose-50 border-rose-200'
                   : 'text-slate-600 bg-slate-50 border-slate-200'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            News Sentiment — {symbol}
          </p>
          <div className="flex items-center gap-3">
            <span className={clsx('text-sm font-bold px-2.5 py-1 rounded-full border', labelColor)}>
              {label}
            </span>
            <span className="text-xs text-slate-500">
              avg score <span className={clsx('font-bold', avg > 0 ? 'text-emerald-600' : avg < 0 ? 'text-rose-600' : 'text-slate-500')}>
                {avg > 0 ? '+' : ''}{avg.toFixed(3)}
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-600">{bullish} bullish</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-300" />
            <span className="text-slate-600">{neutral} neutral</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-slate-600">{bearish} bearish</span>
          </div>
        </div>
      </div>

      {/* Bar */}
      {scores.length > 0 && (
        <div className="mt-3 flex h-1.5 rounded-full overflow-hidden bg-slate-100 gap-0.5">
          <div className="bg-emerald-500 rounded-l-full transition-all" style={{ width: `${bullish / scores.length * 100}%` }} />
          <div className="bg-slate-300 transition-all" style={{ width: `${neutral / scores.length * 100}%` }} />
          <div className="bg-rose-500 rounded-r-full transition-all" style={{ width: `${bearish / scores.length * 100}%` }} />
        </div>
      )}
    </div>
  )
}

// ── Symbol combobox for company search ────────────────────────────────────────
function SymbolPicker({ value, onChange, exchange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const { data: suggestions = [] } = useQuery({
    queryKey: ['symbol-search', query, exchange],
    queryFn: () => searchSymbols(query, exchange || undefined),
    enabled: query.length >= 1,
    staleTime: 30_000,
  })

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (sym, name) => {
    onChange(sym, name)
    setQuery(name || sym)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative w-full max-w-xs">
      <div className={clsx(
        'flex items-center gap-2 px-3 py-2 bg-white border rounded-xl transition-colors',
        open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'
      )}>
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
          placeholder="Search company (e.g. RELIANCE)"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {value && (
          <button onClick={() => { onChange('', ''); setQuery('') }} className="text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden max-h-64 overflow-y-auto">
          {suggestions.map(s => (
            <button
              key={s.symbol}
              onClick={() => select(s.symbol, s.name)}
              className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 flex items-center justify-between gap-4 text-sm border-b border-slate-50 last:border-0"
            >
              <span className="font-bold text-slate-800">{s.symbol}</span>
              <span className="text-xs text-slate-500 truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ n = 6, card = false }) {
  return (
    <div className={card ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-2.5'}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={clsx(
          'bg-white rounded-xl border border-slate-200 animate-pulse',
          card ? 'h-64' : 'h-20'
        )} />
      ))}
    </div>
  )
}

const INDIAN_SOURCES = ['Google News India', 'Google News NSE', 'LiveMint Markets', 'NDTV Profit']

function articleMatchesExchange(article, selected, matchesSelected) {
  if (selected === 'ALL') return true
  const syms = article.related_symbols
  if (syms?.length > 0) return syms.some(s => matchesSelected(s))
  const isIndianSource = INDIAN_SOURCES.includes(article.source)
  if (selected === 'NSE' || selected === 'BSE') return isIndianSource
  if (selected === 'NASDAQ') return !isIndianSource
  return true
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewsFeed() {
  const globalExchange = useExchangeStore((s) => s.selected)
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)
  const [tab, setTab] = useState('market')        // 'market' | 'company'
  const [symbol, setSymbol] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [sentimentFilter, setSentimentFilter] = useState('all')
  const [sortBy, setSortBy] = useState('latest')
  const [bookmarks, setBookmarks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('news-bookmarks') || '[]') } catch { return [] }
  })
  const [showBookmarked, setShowBookmarked] = useState(false)

  const toggleBookmark = (id) => {
    setBookmarks(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      localStorage.setItem('news-bookmarks', JSON.stringify(next))
      return next
    })
  }

  // Market news (RSS-based, cached)
  const { data: marketArticles = [], isLoading: marketLoading } = useQuery({
    queryKey: ['news'],
    queryFn: () => getNews(null, 50),
    refetchInterval: 15 * 60 * 1000,
  })

  // Company web search — only fires when symbol is set
  const {
    data: webArticles = [],
    isLoading: webLoading,
    isError: webError,
    error: webErrorMsg,
    refetch: refetchWeb,
    isFetching: webFetching,
  } = useQuery({
    queryKey: ['web-news', symbol, globalExchange],
    queryFn: () => searchWebNews(symbol, 30, globalExchange !== 'ALL' ? globalExchange : 'NSE'),
    enabled: !!symbol && tab === 'company',
    staleTime: 10 * 60 * 1000,   // cache 10 min
  })

  const handleSymbolChange = (sym, name) => {
    setSymbol(sym)
    setCompanyName(name || sym)
  }

  const tabs = [
    { id: 'market',  label: 'Market News',    icon: Newspaper },
    { id: 'company', label: 'Company Search',  icon: Globe     },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">News</h1>
        <p className="text-sm text-slate-500 mt-1">
          Market-wide RSS feeds &amp; real-time internet search for company-specific news
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              tab === id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Market News tab ── */}
      {tab === 'market' && (() => {
        const filtered = marketArticles.filter(a => {
          if (!articleMatchesExchange(a, globalExchange, matchesSelected)) return false
          if (showBookmarked && !bookmarks.includes(a.id)) return false
          const s = a.sentiment_compound ?? 0
          if (sentimentFilter === 'positive' && s <= 0.05) return false
          if (sentimentFilter === 'negative' && s >= -0.05) return false
          if (sentimentFilter === 'neutral' && (s > 0.05 || s < -0.05)) return false
          return true
        }).sort((a, b) => {
          if (sortBy === 'relevance') return Math.abs(b.sentiment_compound || 0) - Math.abs(a.sentiment_compound || 0)
          return 0
        })
        const exchangeFiltered = marketArticles.filter(a => articleMatchesExchange(a, globalExchange, matchesSelected))
        const positive = exchangeFiltered.filter(a => (a.sentiment_compound ?? 0) > 0.05).length
        const negative = exchangeFiltered.filter(a => (a.sentiment_compound ?? 0) < -0.05).length
        const neutral = exchangeFiltered.length - positive - negative
        const total = exchangeFiltered.length || 1
        return (
          <>
            {marketArticles.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Market Sentiment</span>
                  <div className="flex gap-3 text-xs">
                    <span className="text-emerald-600">+{positive}</span>
                    <span className="text-slate-500">{neutral}</span>
                    <span className="text-rose-600">-{negative}</span>
                  </div>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 gap-0.5">
                  <div style={{ width: `${positive/total*100}%` }} className="bg-emerald-500" />
                  <div style={{ width: `${neutral/total*100}%` }} className="bg-slate-400" />
                  <div style={{ width: `${negative/total*100}%` }} className="bg-rose-500" />
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                {['all', 'positive', 'negative', 'neutral'].map(f => (
                  <button key={f} onClick={() => setSentimentFilter(f)}
                    className={clsx('text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors',
                      sentimentFilter === f ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                    )}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
                <span className="hidden sm:inline text-slate-300 dark:text-slate-600">|</span>
                <button onClick={() => setShowBookmarked(b => !b)}
                  className={clsx('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors',
                    showBookmarked ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                  )}>
                  <Bookmark className="w-3 h-3" /> Saved ({bookmarks.length})
                </button>
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 self-start sm:self-auto">
                <option value="latest">Latest first</option>
                <option value="relevance">Strongest sentiment</option>
              </select>
            </div>
            {marketLoading
              ? <Skeleton n={8} />
              : filtered.length === 0
                ? (
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center py-20 gap-3">
                    <Newspaper className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      {showBookmarked ? 'No bookmarked articles' : 'No articles match filters'}
                    </p>
                  </div>
                )
                : (
                  <div className="space-y-2.5">
                    {filtered.map(a => (
                      <div key={a.id} className="relative group/bm">
                        <RssCard article={a} />
                        <button onClick={() => toggleBookmark(a.id)}
                          className="absolute top-3 right-3 p-1 rounded-lg opacity-0 group-hover/bm:opacity-100 transition-opacity hover:bg-slate-100 dark:hover:bg-slate-700"
                          title={bookmarks.includes(a.id) ? 'Remove bookmark' : 'Bookmark'}>
                          <Bookmark className={clsx('w-4 h-4', bookmarks.includes(a.id) ? 'fill-amber-500 text-amber-500' : 'text-slate-400')} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
            }
          </>
        )
      })()}

      {/* ── Company Search tab ── */}
      {tab === 'company' && (
        <div className="space-y-5">
          {/* Search bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 mb-1">Search company news from the internet</p>
                <p className="text-xs text-slate-500 mb-3">
                  Fetches the latest news from Yahoo Finance, Google News, DuckDuckGo &amp; Bing — scored by relevance to stock price prediction.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <SymbolPicker value={symbol} onChange={handleSymbolChange} exchange={globalExchange !== 'ALL' ? globalExchange : undefined} />
                  {symbol && (
                    <button
                      onClick={() => refetchWeb()}
                      disabled={webFetching}
                      className="flex items-center gap-2 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={clsx('w-4 h-4', webFetching && 'animate-spin')} />
                      {webFetching ? 'Searching…' : 'Refresh'}
                    </button>
                  )}
                </div>
              </div>

              {/* Source legend */}
              <div className="hidden sm:block shrink-0 space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Sources</p>
                {Object.entries(SOURCE_TYPE_META).filter(([k]) => k !== 'rss').map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', v.color)}>{v.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Empty state before search */}
          {!symbol && (
            <div className="bg-white rounded-2xl border border-slate-200 border-dashed flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Globe className="w-6 h-6 text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">Search for a company above</p>
              <p className="text-xs text-slate-400 text-center max-w-xs">
                We&apos;ll scan Yahoo Finance, Google News, DuckDuckGo and Bing for the most relevant news for that stock
              </p>
            </div>
          )}

          {/* Loading */}
          {symbol && webLoading && <Skeleton n={6} card />}

          {/* Error */}
          {symbol && webError && (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-rose-700">Search failed</p>
                <p className="text-xs text-rose-600 mt-0.5">
                  {webErrorMsg?.response?.data?.detail ?? 'Could not fetch news. Try again.'}
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {symbol && !webLoading && webArticles.length > 0 && (
            <>
              {/* Sentiment summary */}
              <SentimentSummary articles={webArticles} symbol={companyName || symbol} />

              {/* Source breakdown */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-slate-500">
                  <span className="font-bold text-slate-800">{webArticles.length}</span> articles found for <span className="font-bold text-indigo-600">{companyName || symbol}</span>
                </span>
                {Object.entries(
                  webArticles.reduce((acc, a) => { acc[a.source_type] = (acc[a.source_type] || 0) + 1; return acc }, {})
                ).map(([type, count]) => (
                  <span key={type} className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', SOURCE_TYPE_META[type]?.color ?? 'bg-slate-100 text-slate-600')}>
                    {count} from {SOURCE_TYPE_META[type]?.label ?? type}
                  </span>
                ))}
              </div>

              {/* Sort by relevance pills */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {webArticles.map(a => <WebCard key={a.id} article={a} />)}
              </div>

              <p className="text-xs text-slate-400 text-center pt-2">
                Articles ranked by relevance to stock price prediction · For informational purposes only
              </p>
            </>
          )}

          {/* No results */}
          {symbol && !webLoading && !webError && webArticles.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-16 gap-3">
              <BarChart2 className="w-8 h-8 text-slate-300" />
              <p className="text-sm text-slate-500">No relevant articles found for {symbol}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
