import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Download, Lightbulb, Clock, ChevronRight, type LucideIcon } from 'lucide-react'
import { Button, Select, Modal, useToast } from '../../components/ui'
import { StatCard } from '../../components/analytics/StatCard'
import { ipc } from '../../lib/ipc'
import { useSessionStore } from '../../stores/session-store'
import { staggerContainer, staggerItem, duration } from '../../lib/motion'
import { formatCents, formatRMultiple, formatPercent } from '../../lib/formatters'
import { cn } from '../../lib/cn'
import type {
  Account,
  PerformanceStats,
  RuleAdherenceStats,
  ReviewSummary,
  AnalyticsFilter,
  DatePreset,
} from '@shared/types/index'

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
    <div className="glass rounded-[14px] p-6 text-center text-body-sm text-text-muted" aria-label={text}>
      {text}
    </div>
  )
}

function formatStreak(perf: PerformanceStats): { value: string; tone: 'positive' | 'negative' | 'default' } {
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
    return (
      <EmptyCard text="No closed trades in this period." />
    )
  }

  const { totals } = data.perf
  const { score } = data.adherence
  const streak = formatStreak(data.perf)

  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
      data-testid="period-summary-grid"
    >
      <StatCard
        label="Closed trades"
        value={String(totals.tradeCount)}
      />
      <StatCard
        label="Win rate"
        value={formatPercent(totals.winRateBps)}
        tone={totals.winRateBps >= 5000 ? 'positive' : totals.winRateBps >= 4000 ? 'warning' : 'negative'}
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
      <StatCard
        label="Streak"
        value={streak.value}
        tone={streak.tone}
      />
    </div>
  )
}

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
    <button
      type="button"
      onClick={() => onClick(review)}
      className="group w-full text-left"
    >
      <div className="glass rounded-[14px] p-4 transition-all duration-150 hover:bg-white/[0.04]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-body-sm font-medium text-text-primary capitalize">
                {review.periodType}
              </span>
              <span className="text-caption text-text-muted">{periodLabel}</span>
            </div>
            <p className="text-caption text-text-muted line-clamp-1">
              {review.topMistakes}
            </p>
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

function ReviewDetailModal({
  review,
  onClose,
}: {
  review: ReviewSummary
  onClose: () => void
}) {
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
          <p className="text-body-sm text-text-secondary whitespace-pre-wrap">{review.topMistakes}</p>
        </Field>
        <Field label="Lesson for next period">
          <p className="text-body-sm text-text-secondary whitespace-pre-wrap">{review.lessonNextPeriod}</p>
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
  const [loading, setLoading] = useState(true)
  const [selectedReview, setSelectedReview] = useState<ReviewSummary | null>(null)

  useEffect(() => {
    void ipc.accounts.list().then((r) => {
      if (!r.ok) return
      setAccounts(r.data)
      const active =
        selectedAccountId ??
        r.data.find((a) => a.status === 'active')?.id ??
        null
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

  async function handleExportPdf() {
    const res = await ipc.data.exportPdf('cairn-review.pdf')
    if (res.ok && res.data) toast('PDF saved.', 'success')
    else if (res.ok) {
      /* cancelled */
    } else {
      toast('PDF export failed.', 'error')
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
          <EmptyCard text="No trades awaiting reflection — you're caught up." />
        </motion.section>

        {/* Insights */}
        <motion.section variants={staggerItem} transition={{ duration: duration.base }}>
          <SectionHeader title="Insights" icon={Lightbulb} />
          <EmptyCard text="No insights yet. Cairn needs at least 20 closed trades to start surfacing patterns." />
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
    </div>
  )
}
