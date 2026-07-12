import { motion } from 'framer-motion'
import {
  BookOpen,
  Plus,
  Edit2,
  Lock,
  CheckCircle,
  XCircle,
  Clock,
  Minus,
  Flame,
  Snowflake,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Activity,
  BarChart2,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import type {
  DashboardStats,
  DailyBias,
  TradeDirection,
  TradeStatus,
  TradeListItem,
} from '@shared/types/index'
import { Button, useToast } from '../../components/ui'
import { buildAdvancedMetricCells } from '../../lib/advanced-metrics-display'
import { cn } from '../../lib/cn'
import { eventBus } from '../../lib/event-bus'
import { formatCents, formatRMultiple, formatDate } from '../../lib/formatters'
import { ipc } from '../../lib/ipc'
import { useSessionStore } from '../../stores/session-store'
import { useUiStore } from '../../stores/ui-store'
import { PreTradePanel } from '../pre-trade/PreTradePanel'
import { SessionBiasModal } from '../session-bias/SessionBiasModal'
import { CalendarWidget } from './CalendarWidget'
import { DisciplineRing } from './DisciplineRing'
import { LiveDisciplineCard } from './LiveDisciplineCard'

/* ──────────────────────────────────────────────────────────────────
   STAT CARD — the hero metric cards: icon badge + label + big number +
   change pill. Floating (soft depth), no decorative area chart.
───────────────────────────────────────────────────────────────── */
interface StatCardProps {
  label: string
  value: string
  sub?: string | undefined
  subPositive?: boolean | undefined
  colorVar: string // token var, e.g. 'hsl(var(--accent-a))'
  colorHsl: string // token var used for SVG stroke/fill + card top-rule
  colorRgb: string // deprecated (Almanac uses color-mix on colorHsl); kept for call-site compat
  icon: React.ElementType
  delay?: number | undefined
  className?: string | undefined
}

function StatCard({
  label,
  value,
  sub,
  subPositive,
  colorHsl,
  icon: Icon,
  delay = 0,
  className,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay }}
      className={cn('card-float relative flex flex-col overflow-hidden rounded-[10px]', className)}
      style={{
        background: 'hsl(var(--surface))',
        border: '1px solid hsl(var(--border))',
        borderTop: `2px solid ${colorHsl}`,
      }}
    >
      {/* Content — centred now that the decorative area chart is gone */}
      <div className="relative z-10 flex flex-1 flex-col justify-center gap-2.5 px-5 py-5">
        {/* Icon + label row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{
                background: `color-mix(in srgb, ${colorHsl} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${colorHsl} 30%, transparent)`,
              }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: colorHsl }} strokeWidth={1.75} />
            </span>
            <span className="text-micro font-semibold uppercase tracking-[0.10em] text-text-muted/70">
              {label}
            </span>
          </div>
          {sub && (
            <span
              className="rounded-full px-2 py-0.5 text-caption font-bold font-mono"
              style={{
                background: subPositive ? 'hsl(var(--accent-a)/0.12)' : 'hsl(var(--danger)/0.12)',
                color: subPositive ? 'hsl(var(--accent-a))' : 'hsl(var(--danger))',
                border: `1px solid ${subPositive ? 'hsl(var(--accent-a)/0.22)' : 'hsl(var(--danger)/0.22)'}`,
              }}
            >
              {sub}
            </span>
          )}
        </div>

        {/* Big number */}
        <p
          className="stat-number leading-none"
          style={{
            fontSize: 'clamp(22px, 2.8vw, 30px)',
            color: 'hsl(var(--text-primary))',
            letterSpacing: '0',
          }}
        >
          {value}
        </p>
      </div>
    </motion.div>
  )
}

/* ──────────────────────────────────────────────────────────────────
   SUPPORTING COMPONENTS
───────────────────────────────────────────────────────────────── */
const BIAS_COLORS: Record<DailyBias, string> = {
  bullish: 'bg-accent-a/12 text-accent-a border-accent-a/25',
  bearish: 'bg-danger/12 text-danger border-danger/25',
  neutral: 'bg-text-muted/10 text-text-secondary border-border',
}
const BIAS_DOTS: Record<DailyBias, string> = {
  bullish: 'bg-accent-a',
  bearish: 'bg-danger',
  neutral: 'bg-text-muted',
}

function BiasChip({ label, bias }: { label: string; bias: DailyBias }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium',
        BIAS_COLORS[bias],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', BIAS_DOTS[bias])} />
      <span className="text-micro font-normal opacity-60">{label}</span>
      {bias.charAt(0).toUpperCase() + bias.slice(1)}
    </span>
  )
}

function DirectionChip({ direction }: { direction: TradeDirection }) {
  const isLong = direction === 'long'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-micro font-bold uppercase tracking-wider',
        isLong ? 'bg-accent-a/15 text-accent-a' : 'bg-danger/15 text-danger',
      )}
    >
      {isLong ? (
        <TrendingUp className="h-2.5 w-2.5" strokeWidth={2.5} />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" strokeWidth={2.5} />
      )}
      {isLong ? 'L' : 'S'}
    </span>
  )
}

function CleanIcon({ isClean }: { isClean: number | null }) {
  if (isClean === null)
    return <Minus className="h-3.5 w-3.5 text-text-muted/50" strokeWidth={1.5} />
  return isClean === 1 ? (
    <CheckCircle className="h-3.5 w-3.5 text-accent-a" strokeWidth={1.75} />
  ) : (
    <XCircle className="h-3.5 w-3.5 text-danger" strokeWidth={1.75} />
  )
}

/* Composite performance score — compact readout below the Discipline Ring.
   Zella-Score-style 0–100 from win rate, profit factor, avg win/loss,
   consistency and clean-trade quality. */
const COMPOSITE_PARTS: {
  key: keyof DashboardStats['compositeScore']['components']
  label: string
}[] = [
  { key: 'winRate', label: 'Win rate' },
  { key: 'profitFactor', label: 'Profit factor' },
  { key: 'avgWinLoss', label: 'Avg win/loss' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'discipline', label: 'Quality' },
]

function CompositeReadout({ composite }: { composite: DashboardStats['compositeScore'] }) {
  const { score, components, sufficient, sampleSize } = composite
  const tone =
    score >= 70
      ? 'hsl(var(--accent-a))'
      : score >= 40
        ? 'hsl(var(--warning))'
        : 'hsl(var(--danger))'
  return (
    <div className="mt-4 w-full px-5">
      <div className="h-px w-full bg-[hsl(var(--ink)/0.06)]" />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-micro font-semibold uppercase tracking-[0.10em] text-text-muted/70">
          Performance
        </span>
        <span
          className="font-mono text-body-sm font-bold"
          style={{ color: sufficient ? tone : 'hsl(var(--text-muted))' }}
        >
          {score}
          <span className="text-text-muted/60">/100</span>
        </span>
      </div>
      {sufficient ? (
        <div className="mt-2 flex gap-1" aria-hidden>
          {COMPOSITE_PARTS.map((p) => (
            <div
              key={p.key}
              className="group relative flex-1"
              title={`${p.label}: ${components[p.key]}/100`}
            >
              <div className="h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${components[p.key]}%`,
                    background:
                      components[p.key] >= 70
                        ? 'hsl(var(--accent-a))'
                        : components[p.key] >= 40
                          ? 'hsl(var(--warning))'
                          : 'hsl(var(--danger))',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-micro text-text-muted/55">
          {sampleSize === 0
            ? 'No closed trades yet.'
            : `Builds with more data — ${sampleSize}/10 trades.`}
        </p>
      )}
    </div>
  )
}

/* Glass panel — used for secondary cards */
function Panel({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay }}
      className={cn('card-float glass overflow-hidden rounded-[18px]', className)}
    >
      {children}
    </motion.div>
  )
}

function PanelHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3.5"
      style={{ borderBottom: '1px solid var(--glass-border)' }}
    >
      <p className="text-body-sm font-semibold text-text-primary">{children}</p>
      {right && <div>{right}</div>}
    </div>
  )
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const STATUS_BADGE: Record<TradeStatus, { label: string }> = {
  planned: { label: 'Planned' },
  open: { label: 'Open' },
  closed: { label: 'Closed' },
  cancelled: { label: 'Cancelled' },
}

/* ──────────────────────────────────────────────────────────────────
   MAIN DASHBOARD
───────────────────────────────────────────────────────────────── */
export function DashboardPage() {
  const toast = useToast()
  const { todaySession, sessionState, selectedAccountId, refresh } = useSessionStore()
  const {
    newTradeRequested,
    biasRequested,
    playbookIdRequested,
    setNewTradeRequested,
    setBiasRequested,
    setPlaybookIdRequested,
  } = useUiStore()
  const [biasOpen, setBiasOpen] = useState(false)
  const [tradeOpen, setTradeOpen] = useState(false)
  const handleBiasClose = useCallback(() => setBiasOpen(false), [])
  const handleTradeClose = useCallback(() => setTradeOpen(false), [])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [drafts, setDrafts] = useState<TradeListItem[]>([])
  const [activatingDraft, setActivatingDraft] = useState<string | null>(null)

  const locked = todaySession?.lockedAt !== null && todaySession?.lockedAt !== undefined
  const lockedTime =
    locked && todaySession?.lockedAt
      ? new Date(todaySession.lockedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null

  const loadStats = useCallback(async () => {
    if (!selectedAccountId) return
    setLoading(true)
    try {
      const [statsRes, draftsRes] = await Promise.all([
        ipc.dashboard.getStats(selectedAccountId),
        ipc.trades.list({ accountId: selectedAccountId, status: 'planned' }),
      ])
      if (statsRes.ok) setStats(statsRes.data)
      if (draftsRes.ok) setDrafts(draftsRes.data)
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  async function handleActivateDraft(draft: TradeListItem) {
    setActivatingDraft(draft.id)
    const res = await ipc.trades.setOpen(draft.id, draft.accountId)
    setActivatingDraft(null)
    if (res.ok) {
      toast('Trade activated. Position is now open.', 'success')
      void loadStats()
    } else {
      // Carries the blocked-rule names when the activation gate refused.
      toast(res.error.message, 'error')
    }
  }

  useEffect(() => {
    void refresh()
    void loadStats()
  }, [selectedAccountId]) // eslint-disable-line

  // Subscribe to main-process push events so the dashboard refreshes the instant
  // a trade mutates — no polling, no manual version-bumping required.
  useEffect(() => {
    const unsubs = [
      eventBus.on('trade.placed', () => {
        void loadStats()
        void refresh()
      }),
      eventBus.on('trade.closed', () => {
        void loadStats()
        void refresh()
      }),
      eventBus.on('trade.partial-closed', () => void loadStats()),
      eventBus.on('session.locked', () => void refresh()),
    ]
    return () => {
      unsubs.forEach((u) => u())
    }
  }, [loadStats, refresh]) // eslint-disable-line
  useEffect(() => {
    if (newTradeRequested) {
      setNewTradeRequested(false)
      setTradeOpen(true)
    }
  }, [newTradeRequested, setNewTradeRequested])

  const [pendingPlaybookId, setPendingPlaybookId] = useState<string | null>(null)
  useEffect(() => {
    if (playbookIdRequested) {
      setPendingPlaybookId(playbookIdRequested)
      setPlaybookIdRequested(null)
    }
  }, [playbookIdRequested, setPlaybookIdRequested])
  useEffect(() => {
    if (biasRequested) {
      setBiasRequested(false)
      setBiasOpen(true)
    }
  }, [biasRequested, setBiasRequested])

  /* Derived values */
  const dailyPnl = stats?.todayPnlCents ?? null
  const expectancy = stats?.rollingExpectancy ?? null
  const ddUsedPct = stats ? stats.ddUsedBps / 100 : null
  const accountEquity = stats?.account?.currentEquityCents ?? null
  const accountSize = stats?.account?.accountSizeCents ?? null
  const equityPct =
    accountEquity !== null && accountSize !== null && accountSize > 0
      ? ((accountEquity - accountSize) / accountSize) * 100
      : null

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  /* Colour tokens for stat cards — Nvexis Almanac. All are token vars so they
     adapt to Day/Night. GREEN = gains (ink), ROSE = loss (signal), CYAN =
     neutral/brand (oxblood), VIOLET = secondary (umber). Names kept for brevity. */
  const GREEN = { var: 'hsl(var(--accent-a))', hsl: 'hsl(var(--accent-a))', rgb: '' }
  const VIOLET = { var: 'hsl(var(--accent-b))', hsl: 'hsl(var(--accent-b))', rgb: '' }
  const CYAN = { var: 'hsl(var(--info))', hsl: 'hsl(var(--info))', rgb: '' }
  const ROSE = { var: 'hsl(var(--danger))', hsl: 'hsl(var(--danger))', rgb: '' }

  const pnlColor = dailyPnl === null ? CYAN : dailyPnl > 0 ? GREEN : dailyPnl < 0 ? ROSE : CYAN
  const exColor = expectancy === null ? CYAN : expectancy >= 0 ? GREEN : ROSE

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── Page header ─────────────────────────────── */}
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-1 text-micro font-semibold uppercase tracking-[0.14em] text-text-muted/60">
              {todayStr}
            </p>
            <h1
              className="text-h1 font-bold text-text-primary"
              style={{ letterSpacing: '-0.022em' }}
            >
              Dashboard
            </h1>
            {stats?.account && (
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-caption font-semibold"
                  style={{
                    background: 'hsl(var(--accent-b)/0.12)',
                    border: '1px solid hsl(var(--accent-b)/0.28)',
                    color: 'hsl(var(--accent-b))',
                  }}
                >
                  {stats.account.displayName}
                </span>
                <span className="text-caption text-text-muted">
                  Phase {stats.account.currentPhase}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setBiasOpen(true)}>
              <BookOpen className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
              {todaySession ? 'Session Bias' : 'Log Bias'}
            </Button>
            <Button size="sm" onClick={() => setTradeOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={2.5} />
              New Trade
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 px-6 pb-6">
        {/* ── Hero row — Discipline ring + 3 stat cards ── */}
        <div className="grid grid-cols-4 gap-4">
          {/* Discipline Ring — taller, special card */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: 0 }}
            className="col-span-1 relative overflow-hidden rounded-[4px] flex flex-col items-center justify-center py-6"
            style={{
              background: 'hsl(var(--surface))',
              border: '1px solid hsl(var(--border))',
              borderTop: '2px solid hsl(var(--ox))',
            }}
          >
            <p className="eyebrow mb-3">Discipline Score</p>
            {stats ? (
              <>
                <DisciplineRing
                  score={stats.disciplineScore}
                  window={stats.disciplineWindow}
                  ruleBreakdown={stats.ruleBreakdown}
                />
                <CompositeReadout composite={stats.compositeScore} />
              </>
            ) : (
              <div className="flex h-[200px] w-[200px] flex-col items-center justify-center gap-3">
                <div
                  className={cn(
                    'flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-border-strong/60',
                    loading && 'animate-pulse',
                  )}
                >
                  <span className="stat-number text-3xl text-text-muted/50">—</span>
                </div>
                <p className="text-caption text-text-muted/70">
                  {loading ? 'Loading…' : 'Select an account'}
                </p>
              </div>
            )}
          </motion.div>

          {/* Account Equity */}
          <StatCard
            label="Account Equity"
            value={
              stats?.account ? formatCents(stats.account.currentEquityCents) : loading ? '…' : '—'
            }
            sub={
              equityPct !== null
                ? `${equityPct >= 0 ? '+' : ''}${equityPct.toFixed(2)}%`
                : undefined
            }
            subPositive={equityPct !== null && equityPct >= 0}
            colorVar={VIOLET.var}
            colorHsl={VIOLET.hsl}
            colorRgb={VIOLET.rgb}
            icon={DollarSign}
            delay={0.07}
            className="col-span-1"
          />

          {/* Today P&L */}
          <StatCard
            label="Today's P&L"
            value={dailyPnl !== null ? formatCents(dailyPnl) : '—'}
            sub={
              stats?.todayRulesBrokenCount
                ? `${stats.todayRulesBrokenCount} violation${stats.todayRulesBrokenCount > 1 ? 's' : ''}`
                : stats?.todayTradeCount
                  ? `${stats.todayTradeCount} trade${stats.todayTradeCount !== 1 ? 's' : ''}`
                  : undefined
            }
            subPositive={!stats?.todayRulesBrokenCount}
            colorVar={pnlColor.var}
            colorHsl={pnlColor.hsl}
            colorRgb={pnlColor.rgb}
            icon={dailyPnl !== null && dailyPnl < 0 ? TrendingDown : TrendingUp}
            delay={0.14}
            className="col-span-1"
          />

          {/* Rolling Expectancy */}
          <StatCard
            label="Avg Expectancy"
            value={expectancy !== null ? formatRMultiple(expectancy) : '—'}
            sub={
              stats?.expectancySpark?.length ? `Last ${stats.expectancySpark.length}` : undefined
            }
            subPositive={expectancy !== null && expectancy >= 0}
            colorVar={exColor.var}
            colorHsl={exColor.hsl}
            colorRgb={exColor.rgb}
            icon={Activity}
            delay={0.21}
            className="col-span-1"
          />
        </div>

        {/* ── Secondary stat strip — DD, trades, streak, rules ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              icon: BarChart2,
              label: 'Drawdown Used',
              value: ddUsedPct !== null ? `${ddUsedPct.toFixed(1)}%` : '—',
              color:
                ddUsedPct === null
                  ? 'text-text-muted'
                  : ddUsedPct < 33
                    ? 'text-accent-a'
                    : ddUsedPct < 66
                      ? 'text-warning'
                      : 'text-danger',
              bar: ddUsedPct,
              barColor:
                ddUsedPct === null
                  ? ''
                  : ddUsedPct < 33
                    ? 'bg-accent-a'
                    : ddUsedPct < 66
                      ? 'bg-warning'
                      : 'bg-danger',
            },
            {
              icon: Target,
              label: 'Trades Today',
              value: stats?.todayTradeCount?.toString() ?? '—',
              color: 'text-text-primary',
              bar: null,
              barColor: '',
            },
            {
              icon: stats?.streak?.type === 'win' ? Flame : Snowflake,
              label: 'Current Streak',
              value: stats?.streak
                ? `${stats.streak.count}${stats.streak.type === 'win' ? 'W' : 'L'}`
                : '—',
              color:
                stats?.streak?.type === 'win'
                  ? 'text-accent-a'
                  : stats?.streak?.type === 'loss'
                    ? 'text-danger'
                    : 'text-text-muted',
              bar: null,
              barColor: '',
            },
            {
              icon: stats?.todayRulesBrokenCount ? AlertTriangle : ShieldCheck,
              label: 'Rules Broken',
              value: stats?.todayRulesBrokenCount?.toString() ?? '—',
              color: (stats?.todayRulesBrokenCount ?? 0) > 0 ? 'text-danger' : 'text-accent-a',
              bar: null,
              barColor: '',
            },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut', delay: 0.28 + i * 0.05 }}
              className="glass rounded-[14px] px-4 py-3.5"
            >
              <div className="flex items-center gap-2 mb-2">
                <item.icon className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
                <span className="text-micro font-semibold uppercase tracking-widest text-text-muted/60">
                  {item.label}
                </span>
              </div>
              <p className={cn('stat-number text-h2', item.color)}>{item.value}</p>
              {item.bar !== null && (
                <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(item.bar ?? 0, 100)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay: 0.4 + i * 0.05 }}
                    className={cn('h-full rounded-full', item.barColor)}
                  />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* ── Performance metrics — Sharpe, Sortino, drawdown, Kelly, SQN, etc. ── */}
        {stats && (
          <div>
            <p className="mb-3 text-micro font-semibold uppercase tracking-[0.14em] text-text-muted/60">
              Performance Metrics
            </p>
            <div className="grid grid-cols-4 gap-3">
              {buildAdvancedMetricCells(stats.advancedMetrics).map((cell, i) => (
                <motion.div
                  key={cell.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: 'easeOut', delay: 0.66 + i * 0.03 }}
                  title={cell.tooltip}
                  className="glass rounded-[14px] px-4 py-3.5"
                >
                  <span className="text-micro font-semibold uppercase tracking-widest text-text-muted/60">
                    {cell.label}
                  </span>
                  <p className="stat-number mt-2 text-h2 text-text-primary">{cell.display}</p>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── Session context ─────────────────────────── */}
        <Panel delay={0.45}>
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: '1px solid var(--glass-border)' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium border',
                  sessionState === 'active' && 'bg-accent-a/10 text-accent-a border-accent-a/22',
                  sessionState === 'paused' && 'bg-warning/10 text-warning border-warning/22',
                  sessionState === 'locked' && 'bg-danger/10 text-danger border-danger/22',
                  sessionState === 'idle' &&
                    'bg-surface-elevated text-text-secondary border-border',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    sessionState === 'active' && 'bg-accent-a animate-dot-pulse',
                    sessionState === 'paused' && 'bg-warning',
                    sessionState === 'locked' && 'bg-danger',
                    sessionState === 'idle' && 'bg-text-muted/50',
                  )}
                />
                {sessionState === 'idle'
                  ? "Today's Session"
                  : sessionState === 'active'
                    ? 'Session Active'
                    : sessionState === 'paused'
                      ? 'Session Paused'
                      : 'Session Locked'}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {todaySession && !locked && (
                <button
                  type="button"
                  onClick={() => setBiasOpen(true)}
                  className="flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-caption text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-secondary"
                >
                  <Edit2 className="h-3 w-3" strokeWidth={1.5} />
                  Edit bias
                </button>
              )}
              {locked && lockedTime && (
                <div className="flex items-center gap-1.5 text-caption text-danger/80">
                  <Lock className="h-3 w-3" strokeWidth={1.5} />
                  Locked at {lockedTime}
                </div>
              )}
            </div>
          </div>

          {todaySession ? (
            <div className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <BiasChip label="D" bias={todaySession.dailyBias} />
                <BiasChip label="4H" bias={todaySession.h4Bias} />
                <BiasChip label="1H" bias={todaySession.h1Bias} />
                {todaySession.dxyBias && todaySession.dxyBias !== 'n/a' && (
                  <BiasChip label="DXY" bias={todaySession.dxyBias} />
                )}
                {todaySession.htfLiquidityTarget && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-caption text-text-secondary">
                    <span className="text-micro opacity-60">Target</span>
                    {todaySession.htfLiquidityTarget}
                  </span>
                )}
              </div>
              {todaySession.sessionPlan && (
                <p className="line-clamp-2 text-body-sm text-text-muted leading-relaxed">
                  {todaySession.sessionPlan}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between px-5 py-5">
              <div>
                <p className="text-body-sm font-medium text-text-secondary">
                  No session bias logged
                </p>
                <p className="mt-0.5 text-caption text-text-muted">
                  Log your market bias before placing trades.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setBiasOpen(true)}>
                Log Bias
              </Button>
            </div>
          )}
        </Panel>

        {/* ── Planned trades ──────────────────────────── */}
        {drafts.length > 0 && (
          <Panel delay={0.5}>
            <PanelHeader
              right={
                <span
                  className="rounded-full px-2 py-0.5 text-micro font-bold"
                  style={{
                    background: 'hsl(var(--warning)/0.15)',
                    color: 'hsl(var(--warning))',
                    border: '1px solid hsl(var(--warning)/0.25)',
                  }}
                >
                  {drafts.length}
                </span>
              }
            >
              Planned Trades
            </PanelHeader>
            <div>
              {drafts.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-[hsl(var(--ink)/0.025)] transition-colors"
                  style={{ borderBottom: '1px solid var(--glass-border)' }}
                >
                  <span className="font-mono text-body-sm font-bold text-text-primary w-20">
                    {d.pairSymbol}
                  </span>
                  <DirectionChip direction={d.direction} />
                  <span className="text-caption text-text-secondary flex-1 truncate">
                    {d.setupName}
                  </span>
                  <span className="font-mono text-caption font-semibold text-accent-b">
                    {(d.rrRatio / 100).toFixed(2)}R
                  </span>
                  <button
                    type="button"
                    disabled={activatingDraft === d.id}
                    onClick={() => void handleActivateDraft(d)}
                    className={cn(
                      'rounded-[7px] px-3 py-1 text-caption font-semibold transition-all duration-150 disabled:opacity-50',
                      'border border-accent-a/30 bg-accent-a/10 text-accent-a',
                      'hover:bg-accent-a/20 hover:border-accent-a/45',
                      'shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_3px_rgba(0,0,0,0.20)]',
                    )}
                  >
                    {activatingDraft === d.id ? '…' : 'Open'}
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* ── Live discipline — today's real-time broker-detection breaches ── */}
        <LiveDisciplineCard accountId={selectedAccountId} />

        {/* ── Bottom row: Recent trades + Week adherence + Calendar ── */}
        <div className="grid grid-cols-4 gap-4">
          {/* Recent trades — 2/4 */}
          <Panel className="col-span-2" delay={0.54}>
            <PanelHeader>Recent Trades</PanelHeader>

            {stats && stats.recentTrades.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {['Pair', 'Setup', 'Dir', 'RR', 'P&L', 'Clean', 'Date'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-micro font-semibold uppercase tracking-widest text-text-muted/55"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.recentTrades.map((t, i) => {
                    const statusCfg = STATUS_BADGE[t.status]
                    return (
                      <motion.tr
                        key={t.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: 0.54 + i * 0.035, ease: 'easeOut' }}
                        className="border-b border-white/[0.03] last:border-0 hover:bg-[hsl(var(--ink)/0.03)] transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-body-sm font-bold text-text-primary">
                            {t.pairSymbol}
                          </span>
                        </td>
                        <td className="max-w-[100px] px-4 py-2.5">
                          <span className="truncate text-caption text-text-secondary block">
                            {t.setupName}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <DirectionChip direction={t.direction} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-caption font-semibold text-text-muted">
                            {(t.rrRatio / 100).toFixed(2)}R
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {t.pnlCents !== null ? (
                            <span
                              className={cn(
                                'font-mono text-caption font-bold',
                                t.pnlCents >= 0 ? 'text-accent-a' : 'text-danger',
                              )}
                            >
                              {formatCents(t.pnlCents)}
                            </span>
                          ) : (
                            <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-micro text-text-muted">
                              {statusCfg.label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <CleanIcon isClean={t.isClean} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-caption text-text-muted">
                            {formatDate(t.createdAt)}
                          </span>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
                  style={{
                    background: 'hsl(var(--text-muted)/0.07)',
                    border: '1px solid var(--glass-border)',
                  }}
                >
                  <Clock className="h-5 w-5 text-text-muted/40" strokeWidth={1.5} />
                </div>
                <p className="text-body-sm font-medium text-text-muted">No trades yet</p>
                <p className="mt-0.5 text-caption text-text-muted/55">
                  Your trades will appear here
                </p>
              </div>
            )}
          </Panel>

          {/* Week adherence — 1/4 */}
          <Panel className="col-span-1" delay={0.58}>
            <PanelHeader>This Week</PanelHeader>

            <div className="p-5">
              {stats && stats.weekAdherence.length > 0 ? (
                <div className="space-y-3.5">
                  {stats.weekAdherence.map((day, i) => {
                    const dayLabel = DAY_LABELS[i] ?? day.date.slice(5)
                    const hasTrades = day.tradeCount > 0
                    const pct = day.adherencePct
                    return (
                      <div key={day.date} className="flex items-center gap-3">
                        <span className="w-7 shrink-0 text-micro font-semibold uppercase tracking-wide text-text-muted/60">
                          {dayLabel}
                        </span>
                        {hasTrades ? (
                          <>
                            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-elevated">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(pct, 0)}%` }}
                                transition={{
                                  duration: 0.5,
                                  ease: 'easeOut',
                                  delay: 0.6 + i * 0.06,
                                }}
                                className={cn(
                                  'absolute inset-y-0 left-0 rounded-full',
                                  pct >= 80
                                    ? 'bg-accent-a'
                                    : pct >= 60
                                      ? 'bg-warning'
                                      : 'bg-danger',
                                )}
                              />
                            </div>
                            <span
                              className={cn(
                                'w-9 shrink-0 text-right font-mono text-caption font-bold',
                                pct >= 80
                                  ? 'text-accent-a'
                                  : pct >= 60
                                    ? 'text-warning'
                                    : 'text-danger',
                              )}
                            >
                              {pct}%
                            </span>
                          </>
                        ) : (
                          <span className="flex-1 text-micro text-text-muted/40">—</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-caption text-text-muted/55">No data this week.</p>
              )}
            </div>

            {stats && stats.ruleBreakdown.length > 0 && (
              <div
                className="px-5 pb-5 pt-4"
                style={{ borderTop: '1px solid var(--glass-border)' }}
              >
                <p className="mb-3 text-micro font-semibold uppercase tracking-widest text-text-muted/55">
                  Top violations · last 20
                </p>
                <ul className="space-y-2">
                  {stats.ruleBreakdown.slice(0, 3).map((r) => (
                    <li key={r.ruleKey} className="flex items-center justify-between gap-2">
                      <span className="truncate text-caption text-text-secondary">
                        {r.ruleKey.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-micro font-bold',
                          r.count >= 3 ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning',
                        )}
                      >
                        ×{r.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          {/* Calendar — 1/4 */}
          <Panel className="col-span-1" delay={0.62}>
            <PanelHeader>This Month</PanelHeader>
            <div className="p-4">
              <CalendarWidget />
            </div>
          </Panel>
        </div>
      </div>

      <SessionBiasModal open={biasOpen} onClose={handleBiasClose} />
      <PreTradePanel
        open={tradeOpen}
        onClose={handleTradeClose}
        onTradeCreated={() => {
          void refresh()
          void loadStats()
          setTradeOpen(false)
        }}
        initialPlaybookId={pendingPlaybookId}
        onPlaybookConsumed={() => setPendingPlaybookId(null)}
      />
    </div>
  )
}
