import { ChevronLeft, ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AnalyticsFilter, PerformanceStats, RuleAdherenceStats } from '@shared/types/index'
import { Button } from '../../../components/ui/button'
import { cn } from '../../../lib/cn'
import { formatCents, formatDate, formatPercent, formatRMultiple } from '../../../lib/formatters'
import { ipc } from '../../../lib/ipc'
import { getWeekRange } from '../../../lib/week-range'
import { DEFAULT_FILTER } from '../../../stores/analytics-store'
import type { WeekStartsOn } from '../../../lib/week-range'

/**
 * Data-backed weekly review (P3). The manual review form makes the trader type
 * their own adherence score; this reads the objective numbers the app already
 * has for the selected week (P&L, R, win-rate, discipline with week-over-week
 * trend, top rules broken) via the existing analytics IPCs — no new backend —
 * and hands the computed period + discipline score to "Write review for this
 * week" so the reflection starts from fact, not memory.
 */
export function WeeklyReview({
  accountId,
  onWriteReview,
}: {
  accountId: string | null
  onWriteReview: (range: { startIso: string; endIso: string; adherencePct: number }) => void
}) {
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(1)
  const [offset, setOffset] = useState(0)
  const [perf, setPerf] = useState<PerformanceStats | null>(null)
  const [adherence, setAdherence] = useState<RuleAdherenceStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void ipc.settings.get<string>('week_starts_on').then((r) => {
      if (r.ok && r.data === 'sunday') setWeekStartsOn(0)
    })
  }, [])

  const range = useMemo(
    () => getWeekRange(new Date(), weekStartsOn, offset),
    [weekStartsOn, offset],
  )

  const load = useCallback(() => {
    setLoading(true)
    const filter: AnalyticsFilter = {
      ...DEFAULT_FILTER,
      accountIds: accountId ? [accountId] : 'all',
      dateFrom: range.start,
      dateTo: range.end,
      datePreset: 'custom',
    }
    void Promise.all([ipc.analytics.performance(filter), ipc.analytics.adherence(filter)]).then(
      ([p, a]) => {
        setPerf(p.ok ? p.data : null)
        setAdherence(a.ok ? a.data : null)
        setLoading(false)
      },
    )
  }, [accountId, range.start, range.end])

  useEffect(() => {
    load()
  }, [load])

  const totals = perf?.totals
  const adherencePct = adherence ? Math.round(adherence.score.scoreBps / 100) : 0
  const periodLabel = offset === 0 ? 'This week' : offset === -1 ? 'Last week' : 'Week'

  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-surface-elevated p-4"
      data-testid="weekly-review"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-body font-semibold text-text-primary">Weekly review</h3>
          <p className="text-caption text-text-muted">
            {periodLabel} · {formatDate(range.start)} – {formatDate(range.end)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setOffset((o) => o - 1)}
            className="rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Next week"
            disabled={offset >= 0}
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            className="rounded-md p-1 text-text-muted transition-colors hover:text-text-primary disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-caption text-text-muted">Loading…</p>
      ) : !totals || totals.tradeCount === 0 ? (
        <p className="text-caption text-text-muted" data-testid="weekly-review-empty">
          No trades this week.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="Net P&L"
              value={formatCents(totals.netPnlCents)}
              tone={totals.netPnlCents >= 0 ? 'pos' : 'neg'}
            />
            <Stat
              label="Total R"
              value={formatRMultiple(totals.totalR)}
              tone={totals.totalR >= 0 ? 'pos' : 'neg'}
            />
            <Stat label="Win rate" value={formatPercent(totals.winRateBps)} />
            <Stat label="Expectancy" value={formatRMultiple(totals.expectancyR)} />
            <Stat label="Trades" value={String(totals.tradeCount)} />
            <Stat
              label="Discipline"
              value={formatPercent(adherence?.score.scoreBps ?? 0)}
              trend={adherence?.score.trendDirection}
            />
          </div>

          {adherence && adherence.topBroken.length > 0 && (
            <div>
              <p className="mb-2 text-caption uppercase tracking-wider text-text-muted">
                Top rules broken
              </p>
              <ul className="space-y-1">
                {adherence.topBroken.slice(0, 3).map((r) => (
                  <li key={r.ruleKey} className="flex items-center justify-between text-caption">
                    <span className="text-text-secondary">{r.ruleKey.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-text-muted">×{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onWriteReview({
                startIso: range.startIso,
                endIso: range.endIso,
                adherencePct,
              })
            }
          >
            Write review for this week
          </Button>
        </>
      )}
    </section>
  )
}

function Stat({
  label,
  value,
  tone,
  trend,
}: {
  label: string
  value: string
  tone?: 'pos' | 'neg'
  trend?: 'up' | 'down' | 'flat' | undefined
}) {
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : trend === 'flat' ? Minus : null
  return (
    <div>
      <p className="text-caption text-text-muted">{label}</p>
      <p
        className={cn(
          'font-mono text-body font-semibold',
          tone === 'pos' ? 'text-accent-a' : tone === 'neg' ? 'text-danger' : 'text-text-primary',
        )}
      >
        {value}
        {TrendIcon && (
          <TrendIcon className="ml-1 inline h-3 w-3 text-text-muted" strokeWidth={1.5} />
        )}
      </p>
    </div>
  )
}
