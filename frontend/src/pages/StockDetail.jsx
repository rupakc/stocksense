import { useState } from 'react'
import { useParams, Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { getQuote, getHistory, getPrediction, getSentiment, getOptionsChain, getIndices } from '../services/api'
import QuoteCard from '../components/QuoteCard'
import StockChart from '../components/StockChart'
import CandlestickChart from '../components/CandlestickChart'
import SentimentBadge from '../components/SentimentBadge'
import { ArrowLeft, BarChart3, LineChart, Link2, GitCompare } from 'lucide-react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { format } from 'date-fns'

function curSym(symbol) {
  return (symbol?.endsWith('.NS') || symbol?.endsWith('.BO')) ? '₹' : '$'
}

function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 ${className}`}>
      {title && <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-4">{title}</p>}
      {children}
    </div>
  )
}

function StatRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 tabular-nums">{value ?? '—'}</p>
    </div>
  )
}

function PcrBar({ pcr }) {
  if (pcr === null) return null
  const maxPcr = 3
  const callWidth = Math.round((1 / (1 + Math.min(pcr, maxPcr))) * 100)
  const putWidth = 100 - callWidth
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-6 text-right shrink-0">C</span>
      <div className="flex h-3 rounded-full overflow-hidden flex-1">
        <div className="bg-emerald-400 transition-all" style={{ width: `${callWidth}%` }} />
        <div className="bg-rose-400 transition-all" style={{ width: `${putWidth}%` }} />
      </div>
      <span className="text-[10px] text-slate-400 w-6 shrink-0">P</span>
      <span className="text-xs font-semibold text-slate-600 tabular-nums ml-1">{pcr}</span>
    </div>
  )
}

function OptionsTable({ rows, type, label }) {
  if (!rows || rows.length === 0) return null
  const colorClass = type === 'call' ? 'text-emerald-600' : 'text-rose-600'
  return (
    <div>
      <p className={`text-[10px] font-semibold ${colorClass} uppercase tracking-widest mb-2`}>{label}</p>
      <div className="overflow-x-auto text-xs">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] text-slate-400">
              <th className="text-left py-1 px-1.5">Strike</th>
              <th className="text-right py-1 px-1.5">LTP</th>
              <th className="text-right py-1 px-1.5">OI</th>
              <th className="text-right py-1 px-1.5">IV</th>
              <th className="text-right py-1 px-1.5">Delta</th>
              <th className="text-right py-1 px-1.5">Gamma</th>
              <th className="text-right py-1 px-1.5">Theta</th>
              <th className="text-right py-1 px-1.5">Vega</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r, i) => {
              const itmBg = r.itm ? (type === 'call' ? 'bg-emerald-50/60' : 'bg-rose-50/60') : ''
              return (
                <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50 ${itmBg}`}>
                  <td className="py-1 px-1.5 font-semibold tabular-nums">
                    {r.strike}
                    {r.itm && <span className="ml-1 text-[9px] font-bold text-slate-400">ITM</span>}
                  </td>
                  <td className="py-1 px-1.5 text-right tabular-nums">{r.lastPrice?.toFixed(2)}</td>
                  <td className="py-1 px-1.5 text-right tabular-nums">{r.openInterest?.toLocaleString()}</td>
                  <td className="py-1 px-1.5 text-right tabular-nums">{r.impliedVolatility !== null ? `${(r.impliedVolatility * 100).toFixed(1)  }%` : '--'}</td>
                  <td className="py-1 px-1.5 text-right tabular-nums">{r.delta !== null ? r.delta.toFixed(3) : '--'}</td>
                  <td className="py-1 px-1.5 text-right tabular-nums">{r.gamma !== null ? r.gamma.toFixed(4) : '--'}</td>
                  <td className="py-1 px-1.5 text-right tabular-nums">{r.theta !== null ? r.theta.toFixed(3) : '--'}</td>
                  <td className="py-1 px-1.5 text-right tabular-nums">{r.vega !== null ? r.vega.toFixed(3) : '--'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OptionsChainSection({ options }) {
  const [selectedExpiry, setSelectedExpiry] = useState(0)

  const chains = options.chains || []
  const activeChain = chains[selectedExpiry] || {
    expiration: options.expiration,
    calls: options.calls,
    puts: options.puts,
    total_call_oi: options.total_call_oi,
    total_put_oi: options.total_put_oi,
    put_call_ratio: options.put_call_ratio,
  }

  return (
    <Card title="Options Chain">
      {/* Expiry selector */}
      {chains.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {chains.map((chain, idx) => (
            <button
              key={chain.expiration}
              onClick={() => setSelectedExpiry(idx)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                selectedExpiry === idx
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {chain.expiration}
            </button>
          ))}
        </div>
      )}

      {/* Summary row */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <span className="text-xs text-slate-500">Expiry: <span className="font-semibold text-slate-700">{activeChain.expiration}</span></span>
        <span className="text-xs text-slate-500">Call OI: <span className="font-semibold">{activeChain.total_call_oi?.toLocaleString()}</span></span>
        <span className="text-xs text-slate-500">Put OI: <span className="font-semibold">{activeChain.total_put_oi?.toLocaleString()}</span></span>
        {activeChain.put_call_ratio !== null && (
          <span className="text-xs text-slate-500">
            PCR: <span className={`font-bold ${activeChain.put_call_ratio > 1 ? 'text-rose-600' : 'text-emerald-600'}`}>{activeChain.put_call_ratio}</span>
          </span>
        )}
      </div>

      {/* PCR visualization */}
      {activeChain.put_call_ratio !== null && (
        <div className="mb-4 max-w-sm">
          <PcrBar pcr={activeChain.put_call_ratio} />
        </div>
      )}

      {/* Options tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OptionsTable rows={activeChain.calls} type="call" label="Calls" />
        <OptionsTable rows={activeChain.puts} type="put" label="Puts" />
      </div>
    </Card>
  )
}

export default function StockDetail() {
  const { symbol } = useParams()
  const [chartType, setChartType] = useState('candlestick')
  const [period, setPeriod] = useState('1y')
  const [showCompare, setShowCompare] = useState(true)

  const { data: quote }      = useQuery({ queryKey: ['quote', symbol],      queryFn: () => getQuote(symbol) })
  const { data: history }    = useQuery({ queryKey: ['history', symbol, period], queryFn: () => getHistory(symbol, period) })
  const { data: prediction, isLoading: predLoading } = useQuery({ queryKey: ['prediction', symbol], queryFn: () => getPrediction(symbol), retry: false })
  const { data: sentiment }  = useQuery({ queryKey: ['sentiment', symbol],  queryFn: () => getSentiment(symbol) })
  const { data: options }    = useQuery({ queryKey: ['options', symbol],    queryFn: () => getOptionsChain(symbol), retry: false })
  const isIndian = symbol?.endsWith('.NS') || symbol?.endsWith('.BO')
  const benchmarkSymbol = isIndian ? '^NSEI' : '^GSPC'
  const benchmarkLabel = isIndian ? 'Nifty 50' : 'S&P 500'

  const { data: benchHist }  = useQuery({
    queryKey: ['history', benchmarkSymbol, period],
    queryFn: () => getHistory(benchmarkSymbol, period),
    enabled: showCompare,
  })

  const lastPred = prediction?.predictions?.slice(-1)[0]

  return (
    <div className="space-y-5">
      <Link
        to="/watchlist"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Watchlist
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuoteCard quote={quote} />

        {sentiment ? (
          <Card title="News Sentiment">
            <SentimentBadge label={sentiment.sentiment_label} score={sentiment.avg_sentiment_7d} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <StatRow label="7-day avg" value={`${sentiment.avg_sentiment_7d >= 0 ? '+' : ''}${sentiment.avg_sentiment_7d?.toFixed(3)}`} />
              <StatRow label="Articles (7d)" value={sentiment.article_count_7d} />
            </div>
            <div className="mt-4 space-y-2">
              {sentiment.top_headlines?.map((h, i) => (
                <p key={i} className="text-xs text-slate-500 line-clamp-1 leading-snug">· {h}</p>
              ))}
            </div>
          </Card>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm h-52 animate-pulse" />
        )}

        {prediction ? (
          <Card title="ML Prediction">
            {lastPred && (
              <>
                <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums mb-1">
                  {curSym(symbol)}{lastPred.predicted_close?.toFixed(2)}
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  Range: {curSym(symbol)}{lastPred.lower_bound?.toFixed(2)} – {curSym(symbol)}{lastPred.upper_bound?.toFixed(2)}
                </p>
              </>
            )}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <StatRow label="Model" value={prediction.model_name} />
              <StatRow label="Horizon" value={`${prediction.horizon_days}d`} />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Confidence</p>
                <p className={`text-sm font-semibold mt-0.5 capitalize ${
                  prediction.confidence === 'high' ? 'text-emerald-600' :
                  prediction.confidence === 'medium' ? 'text-amber-600' : 'text-rose-600'
                }`}>{prediction.confidence}</p>
              </div>
              {prediction.metrics?.mape !== null && (
                <StatRow label="MAPE" value={`${prediction.metrics.mape?.toFixed(2)}%`} />
              )}
            </div>
            {prediction.features_used?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">
                  Signals ({prediction.features_used.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {prediction.features_used.map((f) => (
                    <span key={f} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ) : predLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm h-52 animate-pulse" />
        ) : (
          <Card title="ML Prediction">
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <p className="text-sm text-slate-500">No prediction available yet</p>
              <p className="text-xs text-slate-400 mt-1">Add this stock to your watchlist to enable ML predictions</p>
            </div>
          </Card>
        )}
      </div>

      {/* Chart controls */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setChartType('candlestick')}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                chartType === 'candlestick' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Candlestick
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                chartType === 'line' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'
              }`}
            >
              <LineChart className="w-3.5 h-3.5" /> Line
            </button>
          </div>
          <div className="flex gap-1">
            {['1mo', '3mo', '6mo', '1y', '2y'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                  period === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {chartType === 'candlestick' ? (
          <CandlestickChart history={history ?? []} />
        ) : (
          <StockChart history={history ?? []} predictions={prediction?.predictions ?? []} currency={curSym(symbol)} />
        )}
      </Card>

      {/* Comparative Analysis */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-indigo-500" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Compare vs {benchmarkLabel}</p>
          </div>
          <button
            onClick={() => setShowCompare(v => !v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              showCompare ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            {showCompare ? 'Hide' : 'Show Comparison'}
          </button>
        </div>
        {showCompare && history && benchHist && (() => {
          const stockBase = history[0]?.close || 1
          const benchBase = benchHist[0]?.close || 1
          const combined = history.map((h, i) => {
            const benchPoint = benchHist[i]
            return {
              date: format(new Date(h.timestamp_utc), 'MMM dd'),
              stock: +(((h.close - stockBase) / stockBase) * 100).toFixed(2),
              bench: benchPoint ? +(((benchPoint.close - benchBase) / benchBase) * 100).toFixed(2) : null,
            }
          })
          return (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={combined} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={50} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl p-3 text-sm shadow-lg">
                      <p className="text-slate-500 text-xs mb-2">{label}</p>
                      {payload.map(p => (
                        <p key={p.dataKey} className="text-xs font-semibold" style={{ color: p.color }}>
                          {p.name}: {p.value >= 0 ? '+' : ''}{p.value}%
                        </p>
                      ))}
                    </div>
                  )
                }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                <Line type="monotone" dataKey="stock" name={symbol.replace(/\.(NS|BO)$/, '')} stroke="#6366f1" dot={false} strokeWidth={2} connectNulls />
                <Line type="monotone" dataKey="bench" name={benchmarkLabel} stroke="#f59e0b" dot={false} strokeWidth={2} connectNulls strokeDasharray="5 3" />
              </ComposedChart>
            </ResponsiveContainer>
          )
        })()}
        {showCompare && (!history || !benchHist) && (
          <div className="h-40 flex items-center justify-center text-sm text-slate-400">Loading comparison data...</div>
        )}
      </Card>

      {/* Options Chain */}
      {options && <OptionsChainSection options={options} />}

    </div>
  )
}
