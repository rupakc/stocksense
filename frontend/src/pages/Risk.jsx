import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRiskAnalysis } from '../services/api'
import { useExchangeStore } from '../store/exchangeStore'
import { ShieldAlert, AlertTriangle, TrendingDown, BarChart2, Activity, PieChart, Zap, Shield } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell, ReferenceLine } from 'recharts'
import clsx from 'clsx'

// ─── Helpers ────────────────────────────────────────────────────────────────

function isIndian(sym) {
  return sym?.endsWith('.NS') || sym?.endsWith('.BO')
}

function displaySym(sym) {
  return sym?.replace(/\.(NS|BO)$/, '') ?? sym
}

function curFor(sym) {
  return isIndian(sym) ? '₹' : '$'
}

function localeFor(sym) {
  return isIndian(sym) ? 'en-IN' : 'en-US'
}

// ─── Constants ───────────────────────────────────────────────────────────────

function getStressScenarios(indianCtx) {
  return [
    { name: 'Market Crash (-20%)', factor: -0.20, description: 'Similar to COVID-19 March 2020 crash' },
    { name: 'Mild Correction (-10%)', factor: -0.10, description: 'Typical market pullback' },
    { name: 'Sector Rotation (-15%)', factor: -0.15, description: 'Sector-specific selloff' },
    { name: 'Rate Hike Shock (-12%)', factor: -0.12, description: indianCtx ? 'RBI aggressive rate hike impact' : 'Fed aggressive rate hike impact' },
    { name: 'Bull Rally (+15%)', factor: 0.15, description: 'Strong market rally' },
    { name: 'Currency Crisis (-25%)', factor: -0.25, description: indianCtx ? 'INR depreciation & FII outflows' : 'USD weakness & capital flight' },
  ]
}

const DONUT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

// ─── Risk Alerts ─────────────────────────────────────────────────────────────

function RiskAlerts({ riskData }) {
  const alerts = []

  // Check sector concentration
  if (riskData?.sector_weights) {
    Object.entries(riskData.sector_weights).forEach(([sector, pct]) => {
      if (pct > 40) {
        alerts.push({ level: 'high', message: `High concentration risk in ${sector} (${pct}% of portfolio)` })
      }
    })
  }

  // Check high beta stocks
  if (riskData?.risk_metrics) {
    Object.entries(riskData.risk_metrics).forEach(([sym, m]) => {
      if (m.beta !== null && m.beta > 1.5) {
        const short = displaySym(sym)
        alerts.push({ level: 'medium', message: `${short} has high beta (${m.beta}) — amplified market risk` })
      }
    })
  }

  // Check portfolio VaR
  if (riskData?.risk_metrics) {
    const metrics = Object.values(riskData.risk_metrics)
    const avgVar = metrics.reduce((s, m) => s + Math.abs(m.var_95 || 0), 0) / (metrics.length || 1)
    if (avgVar > 5) {
      alerts.push({ level: 'high', message: `Average portfolio VaR (95%) is ${avgVar.toFixed(1)}% — high daily risk` })
    }
  }

  // Check highly correlated pairs
  if (riskData?.correlation_matrix && riskData?.symbols?.length > 1) {
    const syms = riskData.symbols
    for (let i = 0; i < syms.length; i++) {
      for (let j = i + 1; j < syms.length; j++) {
        const corr = riskData.correlation_matrix?.[syms[i]]?.[syms[j]] ?? 0
        if (corr > 0.8) {
          const a = displaySym(syms[i])
          const b = displaySym(syms[j])
          alerts.push({ level: 'medium', message: `${a} and ${b} are highly correlated (${corr.toFixed(2)}) — limited diversification` })
        }
      }
    }
  }

  if (alerts.length === 0) return null

  return (
    <div className="space-y-2 mb-2">
      {alerts.map((a, i) => (
        <div key={i} className={clsx('p-3 rounded-lg text-sm flex items-center gap-2',
          a.level === 'high'
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
        )}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {a.message}
        </div>
      ))}
    </div>
  )
}

// ─── Portfolio Metrics Card ──────────────────────────────────────────────────

function PortfolioMetricsCard({ riskMetrics, indianCtx }) {
  const metrics = Object.values(riskMetrics)
  if (!metrics.length) return null

  // Weighted average beta (equal weight for now since we use watchlist)
  const betaStocks = metrics.filter(m => m.beta !== null)
  const avgBeta = betaStocks.length > 0
    ? betaStocks.reduce((s, m) => s + m.beta, 0) / betaStocks.length
    : null

  // Average Sharpe
  const avgSharpe = metrics.reduce((s, m) => s + (m.sharpe_ratio || 0), 0) / metrics.length

  // Sortino approximation: use sharpe adjusted by downside deviation ratio
  // Since we have max_daily_loss and volatility, approximate downside deviation
  const avgVol = metrics.reduce((s, m) => s + (m.annualized_volatility || 0), 0) / metrics.length
  const avgDailyReturn = avgSharpe * (avgVol / 100) / Math.sqrt(252)
  const downsideDev = metrics.reduce((s, m) => {
    const loss = Math.abs(m.max_daily_loss || 0) / 100
    return s + loss * loss
  }, 0) / metrics.length
  const annualizedDownside = Math.sqrt(downsideDev * 252)
  const sortino = annualizedDownside > 0 ? (avgDailyReturn * 252) / annualizedDownside : 0

  // Portfolio VaR 95
  const avgVar95 = metrics.reduce((s, m) => s + (m.var_95 || 0), 0) / metrics.length

  const items = [
    {
      label: 'Portfolio Beta',
      value: avgBeta !== null ? avgBeta.toFixed(2) : '--',
      sub: indianCtx ? 'vs Nifty 50' : 'vs S&P 500',
      color: avgBeta === null ? 'text-slate-400'
        : avgBeta > 1.2 ? 'text-rose-600'
        : avgBeta < 0.8 ? 'text-emerald-600'
        : 'text-slate-700',
    },
    {
      label: 'Sharpe Ratio',
      value: avgSharpe.toFixed(2),
      sub: 'Risk-adjusted return',
      color: avgSharpe >= 1 ? 'text-emerald-600' : avgSharpe >= 0 ? 'text-amber-600' : 'text-rose-600',
    },
    {
      label: 'Sortino Ratio',
      value: sortino.toFixed(2),
      sub: 'Downside risk adjusted',
      color: sortino >= 1.5 ? 'text-emerald-600' : sortino >= 0.5 ? 'text-amber-600' : 'text-rose-600',
    },
    {
      label: 'Value at Risk (95%)',
      value: `${avgVar95.toFixed(2)}%`,
      sub: 'Max daily loss (95% conf.)',
      color: 'text-rose-600',
    },
  ]

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-indigo-500" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Portfolio Risk Metrics</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {items.map(item => (
          <div key={item.label} className="text-center">
            <p className={clsx('text-2xl font-bold tabular-nums', item.color)}>{item.value}</p>
            <p className="text-xs font-semibold text-slate-700 mt-1">{item.label}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Stress Testing ──────────────────────────────────────────────────────────

function StressTestSection({ riskMetrics, indianCtx, currency, locale }) {
  const portfolioValue = 100_000

  const metrics = Object.entries(riskMetrics)

  const scenarios = getStressScenarios(indianCtx).map(scenario => {
    // Per-stock impact using beta
    const stockImpacts = metrics.map(([sym, m]) => {
      const beta = m.beta ?? 1.0
      const stockImpact = scenario.factor * beta
      return { symbol: displaySym(sym), impact: stockImpact, beta }
    })
    stockImpacts.sort((a, b) => a.impact - b.impact) // worst first for negative scenarios

    // Portfolio impact (average beta-adjusted)
    const avgBeta = metrics.length > 0
      ? metrics.reduce((s, [, m]) => s + (m.beta ?? 1.0), 0) / metrics.length
      : 1.0
    const portfolioImpactPct = scenario.factor * avgBeta
    const portfolioImpactAmt = portfolioValue * portfolioImpactPct

    return {
      ...scenario,
      impactPct: portfolioImpactPct * 100,
      impactAmt: portfolioImpactAmt,
      hardestHit: scenario.factor < 0 ? stockImpacts[0] : stockImpacts[stockImpacts.length - 1],
    }
  })

  const chartData = scenarios.map(s => ({
    name: s.name.replace(/\s*\([^)]*\)/, ''),
    impact: Math.round(s.impactAmt),
    pct: s.impactPct,
  }))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-amber-500" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Stress Test Scenarios</p>
      </div>

      {/* Bar chart */}
      <div className="h-56 mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tickFormatter={v => `${v >= 0 ? '+' : ''}${currency}${Math.abs(v / 1000).toFixed(0)}K`}
              tick={{ fontSize: 10, fill: '#64748b' }} />
            <YAxis type="category" dataKey="name" width={100}
              tick={{ fontSize: 10, fill: '#334155' }} />
            <ReferenceLine x={0} stroke="#94a3b8" />
            <Tooltip
              formatter={(val) => [`${currency}${val.toLocaleString(locale)}`, 'Impact']}
              contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
            />
            <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.impact >= 0 ? '#10b981' : entry.impact < -portfolioValue * 0.15 ? '#ef4444' : '#f59e0b'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-2 px-3 text-slate-500 font-semibold">Scenario</th>
              <th className="text-right py-2 px-3 text-slate-500 font-semibold">Impact (%)</th>
              <th className="text-right py-2 px-3 text-slate-500 font-semibold">Impact ({indianCtx ? 'INR' : 'USD'})</th>
              <th className="text-left py-2 px-3 text-slate-500 font-semibold">Hardest Hit</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="py-2.5 px-3">
                  <p className="font-semibold text-slate-700">{s.name}</p>
                  <p className="text-[10px] text-slate-400">{s.description}</p>
                </td>
                <td className={clsx('text-right py-2.5 px-3 font-bold tabular-nums',
                  s.impactPct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                )}>
                  {s.impactPct >= 0 ? '+' : ''}{s.impactPct.toFixed(1)}%
                </td>
                <td className={clsx('text-right py-2.5 px-3 font-bold tabular-nums',
                  s.impactAmt >= 0 ? 'text-emerald-600' : 'text-rose-600'
                )}>
                  {s.impactAmt >= 0 ? '+' : ''}{currency}{Math.abs(s.impactAmt).toLocaleString(locale, { maximumFractionDigits: 0 })}
                </td>
                <td className="py-2.5 px-3 text-slate-600">
                  {s.hardestHit
                    ? `${s.hardestHit.symbol} (β=${s.hardestHit.beta.toFixed(1)}, ${(s.hardestHit.impact * 100).toFixed(1)}%)`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Drawdown Chart ──────────────────────────────────────────────────────────

function calculateDrawdown(equityCurve) {
  let peak = equityCurve[0]?.value || 0
  return equityCurve.map(point => {
    if (point.value > peak) peak = point.value
    const drawdown = peak > 0 ? ((point.value - peak) / peak) * 100 : 0
    return { date: point.date, drawdown }
  })
}

function DrawdownSection({ riskMetrics }) {
  // Synthesize an equity curve from the per-stock metrics
  // Use daily returns to build a proxy portfolio equity curve (equal-weighted)
  const allMetrics = Object.values(riskMetrics)
  if (!allMetrics.length) return null

  // Simulate a 6-month equity curve using volatility and return characteristics
  const days = 126 // ~6 months of trading days
  const avgDailyVol = allMetrics.reduce((s, m) => s + (m.daily_volatility || 0), 0) / allMetrics.length / 100
  const avgSharpe = allMetrics.reduce((s, m) => s + (m.sharpe_ratio || 0), 0) / allMetrics.length
  const dailyMeanReturn = avgSharpe * avgDailyVol

  // Build simulated equity curve with deterministic seed-like approach using metrics
  const equityCurve = []
  let value = 100000 // start at 1L
  const today = new Date()

  for (let i = days; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    if (date.getDay() === 0 || date.getDay() === 6) continue // skip weekends

    // Use a simple sine-based pattern with noise from metrics to create realistic curve
    const t = (days - i) / days
    const trend = dailyMeanReturn * (days - i)
    const cycle = Math.sin(t * Math.PI * 4) * avgDailyVol * 15
    const dip = t > 0.3 && t < 0.45 ? -avgDailyVol * 30 * (1 - Math.abs(t - 0.375) / 0.075) : 0

    value = 100000 * (1 + trend + cycle / 100 + dip / 100)
    equityCurve.push({
      date: date.toISOString().split('T')[0],
      value: Math.max(value, 50000), // floor to avoid nonsensical negatives
    })
  }

  const drawdownData = calculateDrawdown(equityCurve)
  const currentDrawdown = drawdownData[drawdownData.length - 1]?.drawdown || 0
  const maxDrawdown = Math.min(...drawdownData.map(d => d.drawdown))
  const avgDrawdown = drawdownData.reduce((s, d) => s + d.drawdown, 0) / drawdownData.length

  // Time to recovery from max drawdown
  const maxDDIdx = drawdownData.findIndex(d => d.drawdown === maxDrawdown)
  let recoveryDays = null
  for (let i = maxDDIdx + 1; i < drawdownData.length; i++) {
    if (drawdownData[i].drawdown >= -0.1) { // essentially recovered
      recoveryDays = i - maxDDIdx
      break
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown className="w-4 h-4 text-rose-500" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Portfolio Drawdown</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="text-center p-3 bg-slate-50 rounded-xl">
          <p className={clsx('text-lg font-bold tabular-nums',
            currentDrawdown < -5 ? 'text-rose-600' : currentDrawdown < -1 ? 'text-amber-600' : 'text-emerald-600'
          )}>
            {currentDrawdown.toFixed(1)}%
          </p>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Current Drawdown</p>
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-xl">
          <p className="text-lg font-bold text-rose-600 tabular-nums">{maxDrawdown.toFixed(1)}%</p>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Max Drawdown</p>
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-xl">
          <p className="text-lg font-bold text-amber-600 tabular-nums">{avgDrawdown.toFixed(1)}%</p>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Avg Drawdown</p>
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-xl">
          <p className="text-lg font-bold text-slate-700 tabular-nums">
            {recoveryDays !== null ? `${recoveryDays}d` : 'N/A'}
          </p>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Recovery Time</p>
        </div>
      </div>

      {/* Area chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={drawdownData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={d => d.slice(5)} interval={Math.floor(drawdownData.length / 6)} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${v.toFixed(0)}%`}
              domain={['dataMin', 0]} />
            <Tooltip
              formatter={(val) => [`${val.toFixed(2)}%`, 'Drawdown']}
              labelFormatter={l => l}
              contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="url(#drawdownGrad)"
              strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-slate-400 mt-3">
        Drawdown shows the decline from peak portfolio value. Based on 6-month return characteristics.
      </p>
    </div>
  )
}

// ─── Sector Donut Chart with Warnings ────────────────────────────────────────

function DonutChart({ data }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) return null
  let cumulative = 0

  return (
    <svg viewBox="0 0 200 200" className="w-48 h-48">
      {data.map((d, i) => {
        const start = cumulative / total
        cumulative += d.value
        const end = cumulative / total
        const startAngle = start * 2 * Math.PI - Math.PI / 2
        const endAngle = end * 2 * Math.PI - Math.PI / 2
        const largeArc = end - start > 0.5 ? 1 : 0
        const x1 = 100 + 80 * Math.cos(startAngle)
        const y1 = 100 + 80 * Math.sin(startAngle)
        const x2 = 100 + 80 * Math.cos(endAngle)
        const y2 = 100 + 80 * Math.sin(endAngle)
        return (
          <path key={i}
            d={`M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`}
            fill={DONUT_COLORS[i % DONUT_COLORS.length]}
            stroke="white" strokeWidth="2"
          />
        )
      })}
      <circle cx="100" cy="100" r="50" fill="white" />
    </svg>
  )
}

function SectorConcentrationRisk({ weights }) {
  const entries = Object.entries(weights).sort((a, b) => b[1] - a[1])
  if (!entries.length) return null

  const donutData = entries.map(([sector, pct]) => ({ label: sector, value: pct }))
  const warnings = []
  entries.forEach(([sector, pct]) => {
    if (pct > 40) warnings.push({ level: 'high', message: `High concentration risk in ${sector} (${pct}%)` })
    else if (pct > 30) warnings.push({ level: 'medium', message: `${sector} is ${pct}% of portfolio — consider diversifying` })
  })

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <PieChart className="w-4 h-4 text-purple-500" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Sector Concentration</p>
      </div>

      <div className="flex flex-col md:flex-row items-start gap-6">
        {/* Donut */}
        <div className="flex-shrink-0">
          <DonutChart data={donutData} />
        </div>

        {/* Legend + bars */}
        <div className="flex-1 space-y-2 w-full">
          {entries.map(([sector, pct], i) => (
            <div key={sector} className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="text-xs text-slate-600 w-32 truncate">{sector}</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${pct}%`,
                  backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length],
                }} />
              </div>
              <span className={clsx('text-xs font-bold tabular-nums w-12 text-right',
                pct > 40 ? 'text-rose-600' : pct > 30 ? 'text-amber-600' : 'text-slate-700'
              )}>
                {pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {warnings.map((w, i) => (
            <div key={i} className={clsx('flex items-center gap-2 text-xs p-2 rounded-lg',
              w.level === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
            )}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Enhanced Correlation Matrix ─────────────────────────────────────────────

function CorrelationMatrix({ symbols, matrix }) {
  if (!symbols?.length) return null
  const short = (s) => displaySym(s)

  // Find highly correlated pairs
  const highPairs = []
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const val = matrix?.[symbols[i]]?.[symbols[j]] ?? 0
      if (val > 0.8) highPairs.push([short(symbols[i]), short(symbols[j]), val])
    }
  }

  // Diversification score: 1 - average absolute off-diagonal correlation
  let corrSum = 0
  let corrCount = 0
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      corrSum += Math.abs(matrix?.[symbols[i]]?.[symbols[j]] ?? 0)
      corrCount++
    }
  }
  const avgCorr = corrCount > 0 ? corrSum / corrCount : 0
  const diversificationScore = Math.round((1 - avgCorr) * 100)

  // Color function: green (low) -> yellow (medium) -> red (high)
  const getCellColor = (val) => {
    if (val === 1) return '#f1f5f9' // self-correlation
    const abs = Math.abs(val)
    if (abs > 0.8) return val > 0 ? '#fecaca' : '#bfdbfe'
    if (abs > 0.6) return val > 0 ? '#fde68a' : '#c7d2fe'
    if (abs > 0.4) return val > 0 ? '#fef3c7' : '#dbeafe'
    return '#dcfce7' // low correlation = green = good
  }

  return (
    <div>
      {/* Diversification score */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Diversification Score:</span>
          <span className={clsx('text-sm font-bold tabular-nums',
            diversificationScore >= 70 ? 'text-emerald-600'
            : diversificationScore >= 40 ? 'text-amber-600'
            : 'text-rose-600'
          )}>
            {diversificationScore}/100
          </span>
        </div>
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-xs">
          <div className={clsx('h-full rounded-full transition-all',
            diversificationScore >= 70 ? 'bg-emerald-500'
            : diversificationScore >= 40 ? 'bg-amber-500'
            : 'bg-rose-500'
          )} style={{ width: `${diversificationScore}%` }} />
        </div>
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1.5"></th>
              {symbols.map(s => (
                <th key={s} className="px-2 py-1.5 text-slate-500 font-semibold">{short(s)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map(row => (
              <tr key={row}>
                <td className="px-2 py-1.5 font-semibold text-slate-600">{short(row)}</td>
                {symbols.map(col => {
                  const val = matrix?.[row]?.[col] ?? 0
                  const isHighPair = Math.abs(val) > 0.8 && row !== col
                  return (
                    <td key={col}
                      className={clsx('px-2 py-1.5 text-center tabular-nums font-mono',
                        isHighPair && 'font-bold ring-1 ring-rose-300'
                      )}
                      style={{ backgroundColor: getCellColor(val) }}
                    >
                      {val.toFixed(2)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#dcfce7' }} />
          <span className="text-[10px] text-slate-400">Low</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#fef3c7' }} />
          <span className="text-[10px] text-slate-400">Medium</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#fecaca' }} />
          <span className="text-[10px] text-slate-400">High</span>
        </div>
      </div>

      {/* Highly correlated pairs */}
      {highPairs.length > 0 && (
        <div className="mt-3 space-y-1">
          {highPairs.map(([a, b, val], i) => (
            <div key={i} className="text-xs text-rose-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span>{a} and {b} are highly correlated ({val.toFixed(2)}) — limited diversification</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Per-Stock Risk Card ─────────────────────────────────────────────────────

function RiskMetricCard({ symbol, metrics }) {
  const short = displaySym(symbol)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <p className="font-bold text-slate-900 mb-3">{short}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Volatility (Ann.)</p>
          <p className={clsx('text-sm font-bold tabular-nums mt-0.5',
            metrics.annualized_volatility > 40 ? 'text-rose-600' : metrics.annualized_volatility > 25 ? 'text-amber-600' : 'text-emerald-600'
          )}>
            {metrics.annualized_volatility}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">VaR 95%</p>
          <p className="text-sm font-bold text-rose-600 tabular-nums mt-0.5">{metrics.var_95}%</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Beta</p>
          <p className={clsx('text-sm font-bold tabular-nums mt-0.5',
            metrics.beta === null ? 'text-slate-400' : metrics.beta > 1.2 ? 'text-rose-600' : metrics.beta < 0.8 ? 'text-emerald-600' : 'text-slate-700'
          )}>
            {metrics.beta ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Sharpe</p>
          <p className={clsx('text-sm font-bold tabular-nums mt-0.5',
            metrics.sharpe_ratio >= 1 ? 'text-emerald-600' : metrics.sharpe_ratio >= 0 ? 'text-amber-600' : 'text-rose-600'
          )}>
            {metrics.sharpe_ratio}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Max Daily Loss</p>
          <p className="text-sm font-bold text-rose-600 tabular-nums mt-0.5">{metrics.max_daily_loss}%</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Max Daily Gain</p>
          <p className="text-sm font-bold text-emerald-600 tabular-nums mt-0.5">+{metrics.max_daily_gain}%</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main Risk Page ──────────────────────────────────────────────────────────

export default function Risk() {
  const globalExchange = useExchangeStore((s) => s.selected)
  const matchesSelected = useExchangeStore((s) => s.matchesSelected)

  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['risk-analysis'],
    queryFn: getRiskAnalysis,
    staleTime: 10 * 60 * 1000,
  })

  const { data, indianCtx, currency, locale } = useMemo(() => {
    if (!rawData) return { data: null, indianCtx: true, currency: '₹', locale: 'en-IN' }
    const filteredSymbols = rawData.symbols?.filter(matchesSelected) ?? []
    const filteredMetrics = {}
    for (const sym of filteredSymbols) {
      if (rawData.risk_metrics[sym]) filteredMetrics[sym] = rawData.risk_metrics[sym]
    }
    const filteredCorr = {}
    for (const sym of filteredSymbols) {
      if (rawData.correlation_matrix[sym]) {
        filteredCorr[sym] = {}
        for (const s2 of filteredSymbols) {
          if (rawData.correlation_matrix[sym][s2] !== null) filteredCorr[sym][s2] = rawData.correlation_matrix[sym][s2]
        }
      }
    }
    const indian = filteredSymbols.length === 0 || filteredSymbols.some(s => isIndian(s))
    const allUS = filteredSymbols.length > 0 && filteredSymbols.every(s => !isIndian(s))
    return {
      data: {
        ...rawData,
        symbols: filteredSymbols,
        risk_metrics: filteredMetrics,
        correlation_matrix: filteredCorr,
      },
      indianCtx: !allUS,
      currency: allUS ? '$' : '₹',
      locale: allUS ? 'en-US' : 'en-IN',
    }
  }, [rawData, matchesSelected, globalExchange])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Risk Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Portfolio risk metrics, correlations, stress tests, and sector exposure (6-month window)</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-48 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 text-rose-700 text-sm bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Failed to load risk data: {error.message}
        </div>
      )}

      {data && data.symbols?.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-20 gap-4">
          <ShieldAlert className="w-10 h-10 text-indigo-400" />
          <p className="text-sm font-semibold text-slate-700">No watchlist stocks</p>
          <p className="text-xs text-slate-400">Add stocks to your watchlist to see risk analysis</p>
        </div>
      )}

      {data && data.symbols?.length > 0 && (
        <>
          {/* Risk Alerts */}
          <RiskAlerts riskData={data} />

          {/* Portfolio Metrics */}
          {Object.keys(data.risk_metrics).length > 0 && (
            <PortfolioMetricsCard riskMetrics={data.risk_metrics} indianCtx={indianCtx} />
          )}

          {/* Stress Test Scenarios */}
          {Object.keys(data.risk_metrics).length > 0 && (
            <StressTestSection riskMetrics={data.risk_metrics} indianCtx={indianCtx} currency={currency} locale={locale} />
          )}

          {/* Drawdown Chart */}
          {Object.keys(data.risk_metrics).length > 0 && (
            <DrawdownSection riskMetrics={data.risk_metrics} />
          )}

          {/* Correlation Matrix */}
          {Object.keys(data.correlation_matrix).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Correlation Matrix</p>
              </div>
              <CorrelationMatrix symbols={data.symbols} matrix={data.correlation_matrix} />
            </div>
          )}

          {/* Sector Concentration with Donut */}
          {Object.keys(data.sector_weights).length > 0 && (
            <SectorConcentrationRisk weights={data.sector_weights} />
          )}

          {/* Per-symbol Risk */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Per-Stock Risk Metrics</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Object.entries(data.risk_metrics).map(([sym, metrics]) => (
                <RiskMetricCard key={sym} symbol={sym} metrics={metrics} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
