import type { GradeLetter, TradeGrade } from '@shared/types/index'
import { cn } from '../../lib/cn'

// A green, B/C neutral (not green), D/F amber/red — never alarming
const STYLES: Record<GradeLetter, string> = {
  A: 'bg-accent-a/15 text-accent-a border-accent-a/30',
  B: 'bg-white/[0.06] text-text-secondary border-border',
  C: 'bg-white/[0.04] text-text-muted border-border',
  D: 'bg-warning/15 text-warning border-warning/30',
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
