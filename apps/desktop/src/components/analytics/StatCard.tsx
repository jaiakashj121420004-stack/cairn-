import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { cn } from '../../lib/cn'

interface Props {
  label: string
  value: string
  sub?: string
  trend?: 'up' | 'down' | 'flat' | null
  tone?: 'default' | 'positive' | 'negative' | 'warning'
}

export function StatCard({ label, value, sub, trend, tone = 'default' }: Props) {
  const toneClass =
    tone === 'positive'
      ? 'text-accent-a'
      : tone === 'negative'
        ? 'text-danger'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-text-primary'
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : trend === 'flat' ? Minus : null
  return (
    <div className="glass rounded-[14px] p-4">
      <p className="mb-1 text-caption uppercase tracking-wider text-text-muted">{label}</p>
      <p className={cn('font-mono text-[22px] font-semibold', toneClass)}>{value}</p>
      <div className="mt-1 flex items-center gap-1 text-caption text-text-muted">
        {TrendIcon && <TrendIcon size={12} />}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}
