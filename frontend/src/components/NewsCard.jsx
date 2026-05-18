import { format } from 'date-fns'
import clsx from 'clsx'
import { ExternalLink } from 'lucide-react'

export default function NewsCard({ article }) {
  const score = article.sentiment_compound
  const dotClass  = score > 0.05 ? 'bg-emerald-500' : score < -0.05 ? 'bg-rose-500' : 'bg-slate-300'
  const sentClass = score > 0.05 ? 'text-emerald-600' : score < -0.05 ? 'text-rose-600' : 'text-slate-400'

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all group"
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', dotClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug">
          {article.title}
        </p>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 flex-wrap">
          <span className="font-medium text-slate-500">{article.source}</span>
          <span>·</span>
          <span>{format(new Date(article.published_at), 'MMM d, HH:mm')}</span>
          {score !== null && (
            <>
              <span>·</span>
              <span className={sentClass}>{score > 0 ? '+' : ''}{score.toFixed(2)}</span>
            </>
          )}
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  )
}
