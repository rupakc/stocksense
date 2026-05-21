import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTaxReport } from '../services/api'
import { FileText, Download, AlertTriangle, IndianRupee, Clock, TrendingUp, TrendingDown, Info } from 'lucide-react'

const FY_OPTIONS = [
  '2023-24',
  '2024-25',
  '2025-26',
  '2026-27',
]

function formatINR(value) {
  if (value === null || value === undefined || isNaN(value)) return '-'
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  return value < 0 ? `-₹${formatted}` : `₹${formatted}`
}

function exportCSV(data) {
  if (!data) return
  const rows = []
  rows.push(['Type', 'Symbol', 'Quantity', 'Buy Price', 'Buy Date', 'Sell Price', 'Sell Date', 'Holding Days', 'Gain/Loss'])

  ;(data.stcg_transactions || []).forEach(t => {
    rows.push(['STCG', t.symbol, t.quantity, t.buy_price, t.buy_date, t.sell_price, t.sell_date, t.holding_days, t.gain_loss])
  })
  ;(data.ltcg_transactions || []).forEach(t => {
    rows.push(['LTCG', t.symbol, t.quantity, t.buy_price, t.buy_date, t.sell_price, t.sell_date, t.holding_days, t.gain_loss])
  })
  ;(data.unrealized_holdings || []).forEach(t => {
    rows.push([`Unrealized (${  t.type  })`, t.symbol, t.quantity, t.buy_price, t.buy_date, '', '', t.holding_days, ''])
  })

  const csv = rows.map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tax-report-${data.financial_year}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function SummaryCard({ label, value, subtext, colorClass = 'text-slate-900', borderClass = 'border-slate-200' }) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-2xl border ${borderClass} dark:border-slate-700 shadow-sm p-4`}>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-1 ${colorClass}`}>{value}</p>
      {subtext && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtext}</p>}
    </div>
  )
}

function TransactionsTable({ title, entries, icon: Icon, iconColor }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">No transactions found</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{entries.length} transaction{entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-700 text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
              <th className="text-left px-5 py-3">Symbol</th>
              <th className="text-right px-3 py-3">Qty</th>
              <th className="text-right px-3 py-3">Buy Price</th>
              <th className="text-right px-3 py-3">Sell Price</th>
              <th className="text-right px-3 py-3">Buy Date</th>
              <th className="text-right px-3 py-3">Sell Date</th>
              <th className="text-right px-3 py-3">Days</th>
              <th className="text-right px-5 py-3">Gain/Loss</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((t, i) => {
              const isGain = t.gain_loss >= 0
              return (
                <tr key={i} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">{t.symbol?.replace(/\.(NS|BO)$/, '')}</td>
                  <td className="text-right px-3 py-3 tabular-nums text-slate-700 dark:text-slate-300">{t.quantity}</td>
                  <td className="text-right px-3 py-3 tabular-nums text-slate-700 dark:text-slate-300">{formatINR(t.buy_price)}</td>
                  <td className="text-right px-3 py-3 tabular-nums text-slate-700 dark:text-slate-300">{formatINR(t.sell_price)}</td>
                  <td className="text-right px-3 py-3 text-slate-500 dark:text-slate-400">{t.buy_date || '-'}</td>
                  <td className="text-right px-3 py-3 text-slate-500 dark:text-slate-400">{t.sell_date || '-'}</td>
                  <td className="text-right px-3 py-3 tabular-nums text-slate-500 dark:text-slate-400">{t.holding_days}</td>
                  <td className={`text-right px-5 py-3 tabular-nums font-semibold ${isGain ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isGain ? '+' : ''}{formatINR(t.gain_loss)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UnrealizedTable({ entries }) {
  if (!entries || entries.length === 0) return null

  const stcgEntries = entries.filter(e => e.type === 'STCG')
  const ltcgEntries = entries.filter(e => e.type === 'LTCG')

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <Clock className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Unrealized Holdings</h3>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{entries.length} holding{entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-700 text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
              <th className="text-left px-5 py-3">Symbol</th>
              <th className="text-right px-3 py-3">Qty</th>
              <th className="text-right px-3 py-3">Buy Price</th>
              <th className="text-right px-3 py-3">Buy Date</th>
              <th className="text-right px-3 py-3">Days Held</th>
              <th className="text-right px-5 py-3">Category</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((t, i) => (
              <tr key={i} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">{t.symbol?.replace(/\.(NS|BO)$/, '')}</td>
                <td className="text-right px-3 py-3 tabular-nums text-slate-700 dark:text-slate-300">{t.quantity}</td>
                <td className="text-right px-3 py-3 tabular-nums text-slate-700 dark:text-slate-300">{formatINR(t.buy_price)}</td>
                <td className="text-right px-3 py-3 text-slate-500 dark:text-slate-400">{t.buy_date || '-'}</td>
                <td className="text-right px-3 py-3 tabular-nums text-slate-500 dark:text-slate-400">{t.holding_days}</td>
                <td className="text-right px-5 py-3">
                  <span className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                    t.type === 'LTCG'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  }`}>
                    {t.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(stcgEntries.length > 0 || ltcgEntries.length > 0) && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>{stcgEntries.length} short-term</span>
          <span>{ltcgEntries.length} long-term</span>
        </div>
      )}
    </div>
  )
}

export default function TaxReport() {
  const [fy, setFy] = useState(FY_OPTIONS[FY_OPTIONS.length - 2]) // Default to second-last (current likely FY)

  const { data, isLoading, error } = useQuery({
    queryKey: ['tax-report', fy],
    queryFn: () => getTaxReport(fy),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const summary = data?.summary

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Tax Report</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Capital gains tax estimation for Indian equities</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={fy}
            onChange={e => setFy(e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl px-4 py-2 shadow-sm"
          >
            {FY_OPTIONS.map(f => (
              <option key={f} value={f}>FY {f}</option>
            ))}
          </select>
          {data && (
            <button
              onClick={() => exportCSV(data)}
              className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 shadow-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Failed to load tax report: {error.message}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <SummaryCard
              label="Short Term Capital Gains"
              value={formatINR(summary.total_stcg)}
              subtext={`Tax rate: ${summary.stcg_rate}`}
              colorClass={summary.total_stcg >= 0 ? 'text-emerald-600' : 'text-rose-600'}
              borderClass={summary.total_stcg >= 0 ? 'border-emerald-200' : 'border-rose-200'}
            />
            <SummaryCard
              label="Long Term Capital Gains"
              value={formatINR(summary.total_ltcg)}
              subtext={`Tax rate: ${summary.ltcg_rate}`}
              colorClass={summary.total_ltcg >= 0 ? 'text-emerald-600' : 'text-rose-600'}
              borderClass={summary.total_ltcg >= 0 ? 'border-emerald-200' : 'border-rose-200'}
            />
            <SummaryCard
              label="LTCG Exemption"
              value={formatINR(summary.ltcg_exemption)}
              subtext="Per financial year"
            />
            <SummaryCard
              label="Estimated STCG Tax"
              value={formatINR(summary.estimated_stcg_tax)}
              subtext={`@ ${summary.stcg_rate}`}
              colorClass="text-amber-600"
              borderClass="border-amber-200"
            />
            <SummaryCard
              label="Estimated LTCG Tax"
              value={formatINR(summary.estimated_ltcg_tax)}
              subtext={`On taxable: ${formatINR(summary.ltcg_taxable)}`}
              colorClass="text-amber-600"
              borderClass="border-amber-200"
            />
            <SummaryCard
              label="Total Estimated Tax"
              value={formatINR(summary.total_estimated_tax)}
              subtext={`FY ${data.financial_year}`}
              colorClass="text-rose-600"
              borderClass="border-rose-300"
            />
          </div>

          {/* Transactions Tables */}
          <TransactionsTable
            title="Short Term Capital Gains (STCG)"
            entries={data.stcg_transactions}
            icon={TrendingDown}
            iconColor="text-amber-500"
          />
          <TransactionsTable
            title="Long Term Capital Gains (LTCG)"
            entries={data.ltcg_transactions}
            icon={TrendingUp}
            iconColor="text-emerald-500"
          />

          {/* Unrealized */}
          <UnrealizedTable entries={data.unrealized_holdings} />

          {/* Tax Notes */}
          {data.tax_notes && data.tax_notes.length > 0 && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">Tax Notes</h3>
              </div>
              <ul className="space-y-1.5">
                {data.tax_notes.map((note, i) => (
                  <li key={i} className="text-xs text-indigo-700 dark:text-indigo-400 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* No data state */}
      {data && !summary && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
            <FileText className="w-7 h-7 text-indigo-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No tax data available</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Add holdings with buy/sell dates to generate tax reports</p>
          </div>
        </div>
      )}
    </div>
  )
}
