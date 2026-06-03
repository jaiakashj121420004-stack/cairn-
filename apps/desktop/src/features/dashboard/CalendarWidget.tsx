import { CalendarDays } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DailyPnlCell } from '@shared/types/index'
import { cn } from '../../lib/cn'
import { ipc } from '../../lib/ipc'
import { useAnalyticsStore } from '../../stores/analytics-store'

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function monthStartOffset(year: number, month: number) {
  const dow = new Date(Date.UTC(year, month, 1)).getUTCDay()
  return (dow + 6) % 7 // Mon=0
}

export function CalendarWidget() {
  const navigate = useNavigate()
  const { filter } = useAnalyticsStore()
  const [cells, setCells] = useState<DailyPnlCell[]>([])

  useEffect(() => {
    void ipc.analytics.performance(filter).then((r) => {
      if (r.ok) setCells(r.data.dailyHeatmap)
    })
  }, [filter])

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const total = daysInMonth(year, month)
  const offset = monthStartOffset(year, month)

  const cellMap = new Map(cells.map((c) => [c.date, c]))

  const squares: { date: string; pnlCents: number | null }[] = []
  for (let i = 0; i < offset; i++) squares.push({ date: '', pnlCents: null })
  for (let d = 1; d <= total; d++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const cell = cellMap.get(date)
    squares.push({ date, pnlCents: cell ? cell.pnlCents : 0 })
  }
  while (squares.length % 7 !== 0) squares.push({ date: '', pnlCents: null })

  const maxAbs = cells.reduce((m, c) => Math.max(m, Math.abs(c.pnlCents)), 0)

  function squareBg(pnl: number | null): string {
    if (pnl === null) return 'transparent'
    if (pnl === 0) return 'var(--color-surface-elevated)'
    const intensity = maxAbs > 0 ? Math.min(Math.abs(pnl) / maxAbs, 1) : 0
    const opacity = 0.15 + intensity * 0.6
    return pnl > 0
      ? `hsla(var(--accent-a-h, 80) var(--accent-a-s, 50%) var(--accent-a-l, 55%) / ${opacity})`
      : `hsla(var(--danger-h, 0) var(--danger-s, 65%) var(--danger-l, 55%) / ${opacity})`
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAY_LABELS.map((l, i) => (
          <div key={i} className="text-center text-micro text-text-muted/50 font-medium pb-0.5">
            {l}
          </div>
        ))}
        {squares.map((sq, i) => (
          <div
            key={i}
            role={sq.date ? 'button' : undefined}
            tabIndex={sq.date && sq.pnlCents !== 0 ? 0 : -1}
            title={sq.date || undefined}
            onClick={() => sq.date && void navigate(`/trades?date=${sq.date}`)}
            onKeyDown={(e) => {
              if (sq.date && (e.key === 'Enter' || e.key === ' '))
                void navigate(`/trades?date=${sq.date}`)
            }}
            className={cn(
              'aspect-square rounded-[3px]',
              sq.date ? 'cursor-pointer hover:ring-1 hover:ring-border-strong' : '',
            )}
            style={{ backgroundColor: squareBg(sq.pnlCents) }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => void navigate('/analytics?tab=calendar')}
        className="flex items-center gap-1.5 text-caption text-text-muted hover:text-accent-a transition-colors"
      >
        <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} />
        View full calendar
      </button>
    </div>
  )
}
