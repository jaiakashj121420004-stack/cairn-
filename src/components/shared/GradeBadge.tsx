import { cn } from '../../lib/cn'
import type { GradeLetter, TradeGrade } from '../../lib/trade-grade'

const STYLES: Record<GradeLetter, string> = {
  A: 'bg-accent-a/15 text-accent-a border-accent-a/30',
  B: 'bg-accent-a/10 text-accent-a/90 border-accent-a/20',
  C: 'bg-warning/15 text-warning border-warning/30',
  D: 'bg-warning/10 text-warning/90 border-warning/20',
  F: 'bg-danger/15 text-danger border-danger/30',
}

export function GradeBadge({
  grade,
  size = 'sm',
  title,
}: {
  grade: TradeGrade
  size?: 'sm' | 'lg'
  title?: string
}) {
  return (
    <span
      title={title ?? `Quality grade ${grade.letter} (${grade.score}/100)`}
      className={cn(
        'inline-flex items-center justify-center rounded-[6px] border font-mono font-bold',
        size === 'lg' ? 'h-8 w-8 text-body' : 'h-5 w-5 text-caption',
        STYLES[grade.letter],
      )}
    >
      {grade.letter}
    </span>
  )
}
