import { motion } from 'framer-motion'
import {
  Download,
  Lightbulb,
  Clock,
  ChevronRight,
  AlertTriangle,
  Info,
  type LucideIcon,
} from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  Account,
  Insight,
  InsightSeverity,
  PerformanceStats,
  RuleAdherenceStats,
  ReviewSummary,
  TradeListItem,
  AnalyticsFilter,
  DatePreset,
} from '@shared/types/index'
import { StatCard } from '../../components/analytics/StatCard'
import { Button, Select, Modal, useToast } from '../../components/ui'
import { cn } from '../../lib/cn'
import { eventBus } from '../../lib/event-bus'
import { formatCents, formatRMultiple, formatPercent, formatDate } from '../../lib/formatters'
import { ipc } from '../../lib/ipc'
import { staggerContainer, staggerItem, duration } from '../../lib/motion'
import { useReflectionStore } from '../../stores/reflection-store'
import { useSessionStore } from '../../stores/session-store'
import { ReflectionModal } from './ReflectionModal'

// ─── Date range helpers ───────────────────────────────────────────────────────

const DATE_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'all', label: 'All time' },
]

function computeDateRange(preset: DatePreset): { dateFrom: number | null; dateTo: number | null } {
  const now = new Date()
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  switch (preset) {
    case '7d':
      return { dateFrom: end - 7 * 86_400_000, dateTo: end }
    case '30d':
      return { dateFrom: end - 30 * 86_400_000, dateTo: end }
    case 'this_month':
      return { dateFrom: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1), dateTo: end }
    case 'last_month': {
      const firstThis = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      const firstLast = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
      return { dateFrom: firstLast, dateTo: firstThis }
    }
    default:
      return { dateFrom: null, dateTo: null }
  }
}

export function buildFilter(accountId: string | null, preset: DatePreset): AnalyticsFilter {
  const { dateFrom, dateTo } = computeDateRange(preset)
  return {
    accountIds: accountId ? [accountId] : 'all',
    dateFrom,
    dateTo,
    datePreset: preset,
    mode: 'all',
    pairIds: [],
    setupIds: [],
    killzoneIds: [],
    cleanOnly: false,
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface PeriodData {
  perf: PerformanceStats
  adherence: RuleAdherenceStats
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, icon: Icon }: { title: string; icon?: LucideIcon }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-text-muted" strokeWidth={1.5} />}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h2>
    </div>
  )
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div
      className="glass rounded-[14px] p-6 text-center text-body-sm text-text-muted"
      aria-label={text}
    >
      {text}
    </div>
  )
}

function formatStreak(perf: PerformanceStats): {
  value: string
  tone: 'positive' | 'negative' | 'default'
} {
  const { currentKind, currentLen } = perf.streaks
  if (currentKind === 'none' || currentLen === 0) return { value: '—', tone: 'default' }
  if (currentKind === 'win') return { value: `+${currentLen}W`, tone: 'positive' }
  return { value: `-${currentLen}L`, tone: 'negative' }
}

function PeriodSummarySection({ data, loading }: { data: PeriodData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass rounded-[14px] p-4 animate-pulse h-20" />
        ))}
      </div>
    )
  }

  if (!data || data.perf.totals.tradeCount === 0) {
    return <EmptyCard text="No closed trades in this period." />
  }

  const { totals } = data.perf
  const { score } = data.adherence
  const streak = formatStreak(data.perf)

  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
      data-testid="period-summary-grid"
    >
      <StatCard label="Closed trades" value={String(totals.tradeCount)} />
      <StatCard
        label="Win rate"
        value={formatPercent(totals.winRateBps)}
        tone={
          totals.winRateBps >= 5000
            ? 'positive'
            : totals.winRateBps >= 4000
              ? 'warning'
              : 'negative'
        }
      />
      <StatCard
        label="Expectancy"
        value={formatRMultiple(totals.expectancyR)}
        tone={totals.expectancyR > 0 ? 'positive' : totals.expectancyR < 0 ? 'negative' : 'default'}
      />
      <StatCard
        label="Gross P&L"
        value={formatCents(totals.netPnlCents)}
        tone={totals.netPnlCents > 0 ? 'positive' : totals.netPnlCents < 0 ? 'negative' : 'default'}
      />
      <StatCard
        label="Clean trades"
        value={formatPercent(score.scoreBps)}
        tone={score.scoreBps >= 7000 ? 'positive' : score.scoreBps >= 5000 ? 'warning' : 'negative'}
      />
      <StatCard label="Streak" value={streak.value} tone={streak.tone} />
    </div>
  )
}

// ─── Insight card ─────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<
  InsightSeverity,
  { border: string; icon: LucideIcon; iconClass: string }
> = {
  high: { border: 'border-danger/30', icon: AlertTriangle, iconClass: 'text-danger' },
  medium: { border: 'border-warning/30', icon: Lightbulb, iconClass: 'text-warning' },
  low: { border: 'border-border', icon: Info, iconClass: 'text-text-muted' },
}

function InsightCard({
  insight,
  onDismiss,
  dismissing,
}: {
  insight: Insight
  onDismiss: (id: string) => void
  dismissing: boolean
}) {
  const { border, icon: Icon, iconClass } = SEVERITY_STYLES[insight.severity]
  return (
    <div
      data-testid={`insight-${insight.id}`}
      className={cn('glass rounded-[14px] p-4 border', border)}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconClass)} strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold text-text-primary mb-1">{insight.title}</p>
          <p className="text-caption text-text-secondary leading-relaxed">{insight.body}</p>
          <p className="mt-1.5 text-micro text-text-muted/50">
            Based on {insight.sampleSize} trade{insight.sampleSize !== 1 ? 's' : ''}.
          </p>
        </div>
        <button
          type="button"
          disabled={dismissing}
          onClick={() => onDismiss(insight.id)}
          className="shrink-0 rounded-[7px] px-2.5 py-1 text-micro font-medium text-text-muted border border-border hover:bg-surface-elevated hover:text-text-secondary transition-colors disabled:opacity-50"
        >
          Dismiss 7 d
        </button>
      </div>
    </div>
  )
}

// ─── Review item / modal ──────────────────────────────────────────────────────

function ReviewItem({
  review,
  onClick,
}: {
  review: ReviewSummary
  onClick: (r: ReviewSummary) => void
}) {
  const adherencePct = (review.adherenceScore / 100).toFixed(0)
  const periodLabel = `${review.periodStart} – ${review.periodEnd}`

  return (
    <button type="button" onClick={() => onClick(review)} className="group w-full text-left">
      <div className="glass rounded-[14px] p-4 transition-all duration-150 hover:bg-white/[0.04]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-body-sm font-medium text-text-primary capitalize">
                {review.periodType}
              </span>
              <span className="text-caption text-text-muted">{periodLabel}</span>
            </div>
            <p className="text-caption text-text-muted line-clamp-1">{review.topMistakes}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className={cn(
                'font-mono text-body-sm font-semibold',
                review.adherenceScore >= 70
                  ? 'text-accent-a'
                  : review.adherenceScore >= 50
                    ? 'text-warning'
                    : 'text-danger',
              )}
            >
              {adherencePct}%
            </span>
            <ChevronRight
              className="h-4 w-4 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5"
              strokeWidth={1.5}
            />
          </div>
        </div>
      </div>
    </button>
  )
}

function ReviewDetailModal({ review, onClose }: { review: ReviewSummary; onClose: () => void }) {
  const periodLabel = `${review.periodStart} – ${review.periodEnd}`

  return (
    <Modal
      open
      onClose={onClose}
      title={`${review.periodType.charAt(0).toUpperCase() + review.periodType.slice(1)} Review · ${periodLabel}`}
      maxWidth="520px"
    >
      <div className="space-y-4 p-1">
        <Field label="Adherence score">
          <span
            className={cn(
              'font-mono text-h3 font-semibold',
              review.adherenceScore >= 70
                ? 'text-accent-a'
                : review.adherenceScore >= 50
                  ? 'text-warning'
                  : 'text-danger',
            )}
          >
            {(review.adherenceScore / 100).toFixed(0)}%
          </span>
        </Field>
        <Field label="Top mistakes">
          <p className="text-body-sm text-text-secondary whitespace-pre-wrap">
            {review.topMistakes}
          </p>
        </Field>
        <Field label="Lesson for next period">
          <p className="text-body-sm text-text-secondary whitespace-pre-wrap">
            {review.lessonNextPeriod}
          </p>
        </Field>
        {review.ruleFocus && (
          <Field label="Rule focus">
            <p className="text-body-sm text-text-secondary">{review.ruleFocus}</p>
          </Field>
        )}
        {review.notes && (
          <Field label="Notes">
            <p className="text-body-sm text-text-secondary whitespace-pre-wrap">{review.notes}</p>
          </Field>
        )}
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-caption text-text-muted">{label}</p>
      {children}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ReviewPage() {
  const toast = useToast()
  const { selectedAccountId } = useSessionStore()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<string | null>(null)
  const [preset, setPreset] = useState<DatePreset>('30d')
  const [periodData, setPeriodData] = useState<PeriodData | null>(null)
  const [reviews, setReviews] = useState<ReviewSummary[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReview, setSelectedReview] = useState<ReviewSummary | null>(null)
  const [dismissing, setDismissing] = useState<string | null>(null)

  // Reflection queue (two-phase logging)
  const [awaiting, setAwaiting] = useState<TradeListItem[]>([])
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [reflectTrade, setReflectTrade] = useState<TradeListItem | null>(null)
  const refreshReflectionBadge = useReflectionStore((s) => s.refresh)
  const focusedRowRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    void ipc.accounts.list().then((r) => {
      if (!r.ok) return
      setAccounts(r.data)
      const active = selectedAccountId ?? r.data.find((a) => a.status === 'active')?.id ?? null
      setAccountId(active)
    })
  }, [selectedAccountId])

  useEffect(() => {
    const filter = buildFilter(accountId, preset)
    setLoading(true)
    void Promise.all([
      ipc.analytics.performance(filter),
      ipc.analytics.adherence(filter),
      ipc.analytics.listReviews(accountId),
    ]).then(([perfRes, adRes, revRes]) => {
      if (perfRes.ok && adRes.ok) {
        setPeriodData({ perf: perfRes.data, adherence: adRes.data })
      } else {
        setPeriodData(null)
      }
      if (revRes.ok) setReviews(revRes.data)
      setLoading(false)
    })
  }, [accountId, preset])

  const loadInsights = useCallback(() => {
    if (!accountId) return
    void ipc.insights.list(accountId).then((r) => {
      if (r.ok) setInsights(r.data)
    })
  }, [accountId])

  useEffect(() => {
    loadInsights()
  }, [loadInsights])

  const loadAwaiting = useCallback(() => {
    void ipc.trades.listAwaitingReflection(accountId).then((r) => {
      if (!r.ok) return
      setAwaiting(r.data)
      setFocusedIdx((i) => Math.min(i, Math.max(0, r.data.length - 1)))
    })
  }, [accountId])

  useEffect(() => {
    loadAwaiting()
  }, [loadAwaiting])

  // Keep the queue live as trades close (a reflection becomes owed) and as they
  // are reflected elsewhere.
  useEffect(() => {
    const offClosed = eventBus.on('trade.closed', () => loadAwaiting())
    const offReflected = eventBus.on('trade.reflected', () => loadAwaiting())
    return () => {
      offClosed()
      offReflected()
    }
  }, [loadAwaiting])

  // Keyboard navigation for the reflection queue: J/K move, R (or Enter) reflects
  // the focused trade. Disabled while the reflection modal is open or while typing.
  useEffect(() => {
    if (reflectTrade || awaiting.length === 0) return undefined
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIdx((i) => Math.min(awaiting.length - 1, i + 1))
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIdx((i) => Math.max(0, i - 1))
      } else if (e.key === 'r' || e.key === 'Enter') {
        const t = awaiting[focusedIdx]
        if (t) {
          e.preventDefault()
          setReflectTrade(t)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reflectTrade, awaiting, focusedIdx])

  // Keep the focused row in view as J/K move through a long queue.
  useEffect(() => {
    focusedRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [focusedIdx])

  function handleReflected() {
    setReflectTrade(null)
    loadAwaiting()
    void refreshReflectionBadge()
    loadInsights()
  }

  async function handleExportPdf() {
    const res = await ipc.data.exportPdf('cairn-review.pdf')
    if (res.ok && res.data) toast('PDF saved.', 'success')
    else if (res.ok) {
      /* cancelled */
    } else {
      toast('PDF export failed.', 'error')
    }
  }

  async function handleDismiss(insightId: string) {
    if (!accountId || dismissing) return
    setDismissing(insightId)
    const res = await ipc.insights.dismiss(accountId, insightId)
    setDismissing(null)
    if (res.ok) {
      setInsights((prev) => prev.filter((i) => i.id !== insightId))
    } else {
      toast('Could not dismiss insight.', 'error')
    }
  }

  const accountOptions = [
    { value: '', label: 'All accounts' },
    ...accounts.map((a) => ({ value: a.id, label: a.displayName })),
  ]

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b px-6 py-5" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-h2 font-semibold text-text-primary">Review</h1>
            <p className="mt-0.5 text-body-sm text-text-muted">
              Period summary and structured reflection.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              options={DATE_OPTIONS}
              value={preset}
              onChange={(v) => setPreset(v as DatePreset)}
            />
            <Select
              options={accountOptions}
              value={accountId ?? ''}
              onChange={(v) => setAccountId(v || null)}
            />
            <Button size="sm" variant="secondary" onClick={() => void handleExportPdf()}>
              <Download className="h-4 w-4" strokeWidth={1.5} />
              Export PDF
            </Button>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────── */}
      <motion.div
        className="flex-1 overflow-y-auto px-6 py-6 space-y-8"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* Period summary */}
        <motion.section variants={staggerItem} transition={{ duration: duration.base }}>
          <SectionHeader title="Period summary" />
          <PeriodSummarySection data={periodData} loading={loading} />
        </motion.section>

        {/* Trades awaiting reflection */}
        <motion.section variants={staggerItem} transition={{ duration: duration.base }}>
          <SectionHeader title="Trades awaiting reflection" icon={Clock} />
          {awaiting.length === 0 ? (
            <EmptyCard text="No trades awaiting reflection — you're caught up." />
          ) : (
            <div className="space-y-2" data-testid="reflection-queue">
              <p className="px-1 text-caption text-text-muted">
                {awaiting.length} closed trade{awaiting.length > 1 ? 's' : ''} awaiting reflection.
                Use <kbd className="font-mono text-text-secondary">J</kbd>/
                <kbd className="font-mono text-text-secondary">K</kbd> to move,{' '}
                <kbd className="font-mono text-text-secondary">R</kbd> to reflect.
              </p>
              {awaiting.map((t, i) => (
                <AwaitingRow
                  key={t.id}
                  trade={t}
                  focused={i === focusedIdx}
                  {...(i === focusedIdx ? { rowRef: focusedRowRef } : {})}
                  onClick={() => {
                    setFocusedIdx(i)
                    setReflectTrade(t)
                  }}
                />
              ))}
            </div>
          )}
        </motion.section>

        {/* Patterns (local insight engine) */}
        <motion.section variants={staggerItem} transition={{ duration: duration.base }}>
          <SectionHeader title="Patterns" icon={Lightbulb} />
          {insights.length === 0 ? (
            <EmptyCard text="No insights yet. Cairn needs at least 20 closed trades to start surfacing patterns." />
          ) : (
            <div className="space-y-3" data-testid="insights-list">
              {insights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onDismiss={(id) => void handleDismiss(id)}
                  dismissing={dismissing === insight.id}
                />
              ))}
            </div>
          )}
        </motion.section>

        {/* Recent reviews */}
        <motion.section variants={staggerItem} transition={{ duration: duration.base }}>
          <SectionHeader title="Recent reviews" />
          {reviews.length === 0 ? (
            <EmptyCard text="No reviews yet for this period." />
          ) : (
            <div className="space-y-2">
              {reviews.map((r) => (
                <ReviewItem key={r.id} review={r} onClick={setSelectedReview} />
              ))}
            </div>
          )}
        </motion.section>
      </motion.div>

      {/* Detail modal */}
      {selectedReview && (
        <ReviewDetailModal review={selectedReview} onClose={() => setSelectedReview(null)} />
      )}

      {/* Reflection (Phase 2) modal */}
      <ReflectionModal
        open={reflectTrade !== null}
        trade={reflectTrade}
        onClose={() => setReflectTrade(null)}
        onReflected={handleReflected}
      />
    </div>
  )
}

function AwaitingRow({
  trade,
  focused,
  rowRef,
  onClick,
}: {
  trade: TradeListItem
  focused: boolean
  rowRef?: React.Ref<HTMLButtonElement>
  onClick: () => void
}) {
  const r = trade.pnlR
  const closedOn = trade.exitTime ?? trade.updatedAt
  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onClick}
      aria-current={focused}
      className={cn(
        'group w-full text-left rounded-[12px] glass p-4 transition-all duration-150 hover:bg-white/[0.04]',
        focused && 'ring-1 ring-accent-a/60',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-medium text-text-primary">{trade.pairSymbol}</span>
            <span
              className={cn(
                'text-caption font-medium uppercase',
                trade.direction === 'long' ? 'text-accent-a' : 'text-danger',
              )}
            >
              {trade.direction}
            </span>
            <span className="text-caption text-text-muted">{formatDate(closedOn)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {r !== null && (
            <span
              className={cn(
                'font-mono text-body-sm font-semibold',
                r >= 0 ? 'text-accent-a' : 'text-danger',
              )}
            >
              {formatRMultiple(r)}
            </span>
          )}
          <span className="rounded-[7px] border border-border px-2.5 py-1 text-micro font-medium text-text-secondary group-hover:border-accent-a/50 group-hover:text-accent-a">
            Reflect
          </span>
          <ChevronRight
            className="h-4 w-4 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5"
            strokeWidth={1.5}
          />
        </div>
      </div>
    </button>
  )
}
