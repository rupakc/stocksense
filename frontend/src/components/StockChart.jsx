import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { format } from 'date-fns'

function CustomTooltip({ active, payload, label, currency = '₹' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-sm shadow-lg">
      <p className="text-slate-500 text-xs mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-xs font-semibold" style={{ color: p.color }}>
          {p.name}: {currency}{Number(p.value).toFixed(2)}
        </p>
      ))}
    </div>
  )
}

export default function StockChart({ history = [], predictions = [], currency = '₹' }) {
  const histData = history.map((h) => ({
    date:  format(new Date(h.timestamp_utc), 'MMM dd'),
    close: parseFloat(h.close.toFixed(2)),
  }))

  const predData = predictions.map((p) => ({
    date:      format(new Date(p.date), 'MMM dd'),
    predicted: p.predicted_close,
    upper:     p.upper_bound,
    lower:     p.lower_bound,
  }))

  const lastHistDate = histData.at(-1)?.date
  const combined = [...histData, ...predData]

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart data={combined} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${currency}${v}`}
          width={70}
        />
        <Tooltip content={<CustomTooltip currency={currency} />} />
        <Legend
          wrapperStyle={{ fontSize: '12px', color: '#64748b', paddingTop: '12px' }}
        />
        {lastHistDate && (
          <ReferenceLine
            x={lastHistDate}
            stroke="#c7d2fe"
            strokeDasharray="4 4"
            label={{ value: 'Today', fill: '#6366f1', fontSize: 10 }}
          />
        )}
        <Line
          type="monotone"
          dataKey="close"
          name="Actual"
          stroke="#6366f1"
          dot={false}
          strokeWidth={2}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="upper"
          name="Upper Bound"
          stroke="none"
          fill="#10b981"
          fillOpacity={0.10}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="lower"
          name="Lower Bound"
          stroke="none"
          fill="#10b981"
          fillOpacity={0}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="predicted"
          name="Predicted"
          stroke="#10b981"
          dot={false}
          strokeWidth={2}
          strokeDasharray="5 3"
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
