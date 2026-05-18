import clsx from 'clsx'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const CONFIG = {
  bullish: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: TrendingUp },
  bearish: { cls: 'bg-rose-50    text-rose-700    border-rose-200',    Icon: TrendingDown },
  neutral: { cls: 'bg-slate-100  text-slate-600   border-slate-200',   Icon: Minus },
}

export default function SentimentBadge({ label, score }) {
  const { cls, Icon } = CONFIG[label] ?? CONFIG.neutral
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border capitalize',
      cls
    )}>
      <Icon className="w-3.5 h-3.5" />
      {label}
      {score !== null && (
        <span className="opacity-60 font-normal">({score > 0 ? '+' : ''}{score?.toFixed(3)})</span>
      )}
    </span>
  )
}
