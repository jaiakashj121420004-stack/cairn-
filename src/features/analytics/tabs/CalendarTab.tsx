import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ipc } from '../../../lib/ipc'
import { useAnalyticsStore } from '../../../stores/analytics-store'
import { formatCents } from '../../../lib/formatters'
import { cn } from '../../../lib/cn'
import type { DailyPnlCell } from '@shared/types/index'

// ─── Calendar math helpers ────────────────────────────────────────────────────

/** Returns ISO date string YYYY-MM-DD in UTC for a given ms timestamp. */
function toUtcDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Returns the number of days in a UTC month (year, 0-indexed month). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** Returns the Monday-aligned (ISO week) day offset for the 1st of the month.
 *  0=Monday, 6=Sunday. */
function monthStartOffset(year: number, month: number): number {
  const dow = new Date(Date.UTC(year, month, 1)).getUTCDay() // 0=Sun, 1=Mon…
  return (dow + 6) % 7 // remap to Mon=0
}

interface DayCell {
  date: string // YYYY-MM-DD
  dayNum: number
  data: DailyPnlCell | null
}

function buildMonthGrid(year: number, month: number, cells: DailyPnlCell[]): DayCell[][] {
  const cellMap = new Map(cells.map((c) => [c.date, c]))
  const total = daysInMonth(year, month)
  const offset = monthStartOffset(year, month)

  const flat: (DayCell | null)[] = []
  for (let i = 0; i < offset; i++) flat.push(null)
  for (let d = 1; d <= total; d++) {
    const date = `${String(year)}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    flat.push({ date, dayNum: d, data: cellMap.get(date) ?? null })
  }
  // Pad to complete the last row
  while (flat.length % 7 !== 0) flat.push(null)

  const weeks: DayCell[][] = []
  for (let i = 0; i < flat.length; i += 7) {
    weeks.push(flat.slice(i, i + 7) as DayCell[])
  }
  return weeks
}

// ─── Color scale ──────────────────────────────────────────────────────────────

function cellBackground(pnlCents: number, maxAbsPnlCents: number): string {
  if (maxAbsPnlCents === 0) return ''
  const intensity = Math.min(Math.abs(pnlCents) / maxAbsPnlCents, 1)
  const opacity = 0.12 + intensity * 0.55 // 12%–67%
  if (pnlCents > 0) return `rgba(var(--color-accent-a-raw, 120 162 76) / ${opacity})`
  if (pnlCents < 0) return `rgba(var(--color-danger-raw, 220 80 80) / ${opacity})`
  return ''
}

// ─── Component ────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function CalendarTab() {
  const navigate = useNavigate()
  const { filter } = useAnalyticsStore()

  const now = new Date()
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(now.getUTCMonth())
  const [cells, setCells] = useState<DailyPnlCell[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    void ipc.analytics.performance(filter).then((r) => {
      if (r.ok) setCells(r.data.dailyHeatmap)
      setLoading(false)
    })
  }, [filter])

  useEffect(() => { load() }, [load])

  const grid = buildMonthGrid(year, month, cells)

  const maxAbsPnl = cells.reduce((m, c) => Math.max(m, Math.abs(c.pnlCents)), 0)

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
  }
  function goToday() {
    const n = new Date()
    setYear(n.getUTCFullYear())
    setMonth(n.getUTCMonth())
  }

  function handleDayClick(date: string) {
    void navigate(`/trades?date=${date}`)
  }

  const todayStr = toUtcDateString(Date.now())

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-h3 font-semibold text-text-primary">
          {MONTH_NAMES[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="rounded-[8px] border border-border px-3 py-1.5 text-caption text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Previous month"
            className="rounded-[8px] border border-border p-1.5 text-text-muted hover:border-border-strong hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Next month"
            className="rounded-[8px] border border-border p-1.5 text-text-muted hover:border-border-strong hover:text-text-primary transition-colors"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {loading && <div className="py-8 text-center text-caption text-text-muted">Loading…</div>}

      {!loading && (
        <div className="rounded-[12px] border border-border overflow-hidden">
          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-border bg-surface">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2 text-center text-caption font-medium text-text-muted">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {grid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((cell, di) => {
                if (!cell) {
                  return (
                    <div
                      key={`empty-${wi}-${di}`}
                      className="min-h-[72px] border-b border-r border-border bg-surface last:border-r-0"
                    />
                  )
                }

                const isToday = cell.date === todayStr
                const hasTrades = cell.data !== null && cell.data.tradeCount > 0
                const bgColor = hasTrades ? cellBackground(cell.data?.pnlCents ?? 0, maxAbsPnl) : ''
                const isHovered = hoveredDate === cell.date

                const winRatePct = cell.data && cell.data.tradeCount > 0
                  ? Math.round((cell.data.winCount / cell.data.tradeCount) * 100)
                  : null

                return (
                  <div
                    key={cell.date}
                    role="button"
                    tabIndex={hasTrades ? 0 : -1}
                    aria-label={
                      hasTrades
                        ? `${cell.date}: ${cell.data?.tradeCount ?? 0} trades, ${formatCents(cell.data?.pnlCents ?? 0)}`
                        : cell.date
                    }
                    onClick={() => hasTrades && handleDayClick(cell.date)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDayClick(cell.date) }}
                    onMouseEnter={() => setHoveredDate(cell.date)}
                    onMouseLeave={() => setHoveredDate(null)}
                    className={cn(
                      'relative min-h-[72px] border-b border-r border-border p-2 transition-colors last:border-r-0',
                      hasTrades ? 'cursor-pointer' : 'cursor-default',
                      wi === grid.length - 1 && 'border-b-0',
                    )}
                    style={{ backgroundColor: bgColor || undefined }}
                  >
                    {/* Date number */}
                    <span
                      className={cn(
                        'inline-flex h-5 w-5 items-center justify-center rounded-full text-caption font-medium',
                        isToday
                          ? 'bg-accent-a text-background font-semibold'
                          : hasTrades
                            ? 'text-text-primary'
                            : 'text-text-muted',
                      )}
                    >
                      {cell.dayNum}
                    </span>

                    {/* Trade count badge */}
                    {hasTrades && (
                      <div className="mt-1 space-y-0.5">
                        <p className={cn(
                          'text-micro font-mono font-semibold',
                          (cell.data?.pnlCents ?? 0) >= 0 ? 'text-accent-a' : 'text-danger',
                        )}>
                          {formatCents(cell.data?.pnlCents ?? 0)}
                        </p>
                        <p className="text-micro text-text-muted">
                          {cell.data?.tradeCount ?? 0} trade{(cell.data?.tradeCount ?? 0) !== 1 ? 's' : ''}
                        </p>
                      </div>
                    )}

                    {/* Hover tooltip */}
                    {hasTrades && isHovered && (
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-border bg-surface-elevated px-3 py-2 shadow-lg text-caption"
                      >
                        <p className="font-semibold text-text-primary mb-1">{cell.date}</p>
                        <p className="text-text-secondary">{cell.data?.tradeCount ?? 0} trade{(cell.data?.tradeCount ?? 0) !== 1 ? 's' : ''}</p>
                        {winRatePct !== null && (
                          <p className="text-text-secondary">Win rate: {winRatePct}%</p>
                        )}
                        <p className={cn(
                          'font-mono font-semibold',
                          (cell.data?.pnlCents ?? 0) >= 0 ? 'text-accent-a' : 'text-danger',
                        )}>
                          {formatCents(cell.data?.pnlCents ?? 0)}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
