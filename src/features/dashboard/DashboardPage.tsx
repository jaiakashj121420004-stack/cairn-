import { useState, useEffect, useCallback } from 'react'
import {
  BookOpen,
  Plus,
  Edit2,
  Lock,
  CheckCircle,
  XCircle,
  Clock,
  Minus,
} from 'lucide-react'
import { Button } from '../../components/ui'
import { cn } from '../../lib/cn'
import { ipc } from '../../lib/ipc'
import { formatCents, formatRMultiple, formatDate } from '../../lib/formatters'
import { useSessionStore } from '../../stores/session-store'
import { SessionBiasModal } from '../session-bias/SessionBiasModal'
import { PreTradePanel } from '../pre-trade/PreTradePanel'
import { DisciplineRing } from './DisciplineRing'
import type { DashboardStats, DailyBias, TradeDirection, TradeStatus } from '@shared/types/index'

const BIAS_COLORS: Record<DailyBias, string> = {
  bullish: 'bg-accent-a/15 text-accent-a border-accent-a/30',
  bearish: 'bg-danger/15 text-danger border-danger/30',
  neutral: 'bg-text-muted/15 text-text-secondary border-border',
}

function BiasChip({ label, bias }: { label: string; bias: DailyBias }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-caption font-medium',
        BIAS_COLORS[bias],
      )}
    >
      <span className="text-micro font-normal opacity-70">{label}</span>
      {bias.charAt(0).toUpperCase() + bias.slice(1)}
    </span>
  )
}


function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 80
  const h = 28
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  })
  const lastPositive = data[data.length - 1] >= 0
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={lastPositive ? 'hsl(var(--accent-a))' : 'hsl(var(--danger))'}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const STATUS_BADGE: Record<TradeStatus, { label: string; variant: string }> = {
  planned: { label: 'Planned', variant: 'default' },
  open: { label: 'Open', variant: 'warning' },
  closed: { label: 'Closed', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'default' },
}

function directionChip(direction: TradeDirection) {
  return (
    <span
      className={cn(
        'rounded-[4px] px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide',
        direction === 'long'
          ? 'bg-accent-a/15 text-accent-a'
          : 'bg-danger/15 text-danger',
      )}
    >
      {direction === 'long' ? 'L' : 'S'}
    </span>
  )
}

function cleanIcon(isClean: number | null) {
  if (isClean === null) return <Minus className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
  return isClean === 1 ? (
    <CheckCircle className="h-3.5 w-3.5 text-accent-a" strokeWidth={1.5} />
  ) : (
    <XCircle className="h-3.5 w-3.5 text-danger" strokeWidth={1.5} />
  )
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function DashboardPage() {
  const { todaySession, sessionState, selectedAccountId, refresh } = useSessionStore()
  const [biasOpen, setBiasOpen] = useState(false)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(false)

  const locked =
    todaySession?.lockedAt !== null && todaySession?.lockedAt !== undefined
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
      const res = await ipc.dashboard.getStats(selectedAccountId)
      if (res.ok) setStats(res.data)
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  useEffect(() => {
    void refresh()
    void loadStats()
  }, [selectedAccountId]) // eslint-disable-line react-hooks/exhaustive-deps

  const dailyPnl = stats?.todayPnlCents ?? null
  const expectancy = stats?.rollingExpectancy ?? null
  const ddUsedPct = stats ? stats.ddUsedBps / 100 : null
  const accountEquity = stats?.account?.currentEquityCents ?? null
  const accountSize = stats?.account?.accountSizeCents ?? null
  const equityPct = accountEquity !== null && accountSize !== null && accountSize > 0
    ? ((accountEquity - accountSize) / accountSize) * 100
    : null

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-h2 font-semibold text-text-primary">Dashboard</h1>
          {stats?.account && (
            <p className="mt-0.5 text-caption text-text-muted">
              {stats.account.displayName} — Phase {stats.account.currentPhase}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setBiasOpen(true)}>
            <BookOpen className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
            {todaySession ? 'Session Bias' : 'Log Session Bias'}
          </Button>
          <Button size="sm" onClick={() => setTradeOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
            New Trade
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-6 p-6">
        {/* Hero strip */}
        <div className="grid grid-cols-4 gap-4">
          {/* Discipline Ring card */}
          <div className="col-span-1 flex flex-col items-center justify-center rounded-[12px] border border-border bg-surface-elevated py-5">
            <p className="mb-3 text-caption font-medium text-text-muted">Discipline Score</p>
            {stats ? (
              <DisciplineRing
                score={stats.disciplineScore}
                window={stats.disciplineWindow}
                ruleBreakdown={stats.ruleBreakdown}
              />
            ) : (
              <div className="h-[200px] w-[200px] animate-pulse rounded-full bg-surface" />
            )}
          </div>

          {/* Account summary */}
          <div className="col-span-1 flex flex-col gap-3 rounded-[12px] border border-border bg-surface-elevated p-4">
            <p className="text-caption font-medium text-text-muted">Account</p>
            {stats?.account ? (
              <>
                <div>
                  <p className="text-micro text-text-muted">Equity</p>
                  <p className="font-mono text-h2 font-semibold text-text-primary">
                    {formatCents(stats.account.currentEquityCents)}
                  </p>
                  {equityPct !== null && (
                    <p
                      className={cn(
                        'text-caption font-medium',
                        equityPct >= 0 ? 'text-accent-a' : 'text-danger',
                      )}
                    >
                      {equityPct >= 0 ? '+' : ''}
                      {equityPct.toFixed(2)}% from start
                    </p>
                  )}
                </div>
                <div className="mt-auto space-y-1.5 border-t border-border pt-3">
                  <div className="flex items-center justify-between text-caption">
                    <span className="text-text-muted">DD Used</span>
                    <span
                      className={cn(
                        'font-mono font-semibold',
                        (ddUsedPct ?? 0) < 33
                          ? 'text-accent-a'
                          : (ddUsedPct ?? 0) < 66
                            ? 'text-warning'
                            : 'text-danger',
                      )}
                    >
                      {ddUsedPct !== null ? `${ddUsedPct.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-caption">
                    <span className="text-text-muted">Total P&L</span>
                    <span
                      className={cn(
                        'font-mono font-semibold',
                        (stats.totalPnlCents ?? 0) >= 0 ? 'text-accent-a' : 'text-danger',
                      )}
                    >
                      {formatCents(stats.totalPnlCents)}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-caption text-text-muted">
                {loading ? 'Loading…' : 'No account selected'}
              </div>
            )}
          </div>

          {/* Today stats */}
          <div className="col-span-1 flex flex-col gap-3 rounded-[12px] border border-border bg-surface-elevated p-4">
            <p className="text-caption font-medium text-text-muted">Today</p>
            <div>
              <p className="text-micro text-text-muted">P&L</p>
              <p
                className={cn(
                  'font-mono text-h2 font-semibold',
                  dailyPnl === null
                    ? 'text-text-muted'
                    : dailyPnl > 0
                      ? 'text-accent-a'
                      : dailyPnl < 0
                        ? 'text-danger'
                        : 'text-text-primary',
                )}
              >
                {dailyPnl !== null ? formatCents(dailyPnl) : '—'}
              </p>
            </div>
            <div className="mt-auto space-y-1.5 border-t border-border pt-3">
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-muted">Trades</span>
                <span className="font-mono font-semibold text-text-primary">
                  {stats?.todayTradeCount ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-muted">Closed</span>
                <span className="font-mono font-semibold text-text-primary">
                  {stats?.todayClosedCount ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-muted">Rules broken</span>
                <span
                  className={cn(
                    'font-mono font-semibold',
                    (stats?.todayRulesBrokenCount ?? 0) > 0 ? 'text-danger' : 'text-accent-a',
                  )}
                >
                  {stats?.todayRulesBrokenCount ?? '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Rolling expectancy + sparkline */}
          <div className="col-span-1 flex flex-col gap-3 rounded-[12px] border border-border bg-surface-elevated p-4">
            <p className="text-caption font-medium text-text-muted">Rolling Expectancy</p>
            <div>
              <p className="text-micro text-text-muted">Avg R (last 20)</p>
              <p
                className={cn(
                  'font-mono text-h2 font-semibold',
                  expectancy === null
                    ? 'text-text-muted'
                    : expectancy >= 0
                      ? 'text-accent-a'
                      : 'text-danger',
                )}
              >
                {expectancy !== null ? formatRMultiple(expectancy) : '—'}
              </p>
            </div>
            {stats && stats.expectancySpark.length >= 2 && (
              <div className="mt-auto flex items-end justify-end pt-2">
                <MiniSparkline data={stats.expectancySpark} />
              </div>
            )}
          </div>
        </div>

        {/* Session context card */}
        <div className="rounded-[12px] border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  sessionState === 'active'
                    ? 'bg-accent-a'
                    : sessionState === 'paused'
                      ? 'bg-warning'
                      : sessionState === 'locked'
                        ? 'bg-danger'
                        : 'bg-text-muted/40',
                )}
              />
              <p className="text-body-sm font-medium text-text-secondary">
                {sessionState === 'idle'
                  ? "Today's Session"
                  : sessionState === 'active'
                    ? 'Session Active'
                    : sessionState === 'paused'
                      ? 'Session Paused'
                      : 'Session Locked'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {todaySession && !locked && (
                <button
                  type="button"
                  onClick={() => setBiasOpen(true)}
                  className="flex items-center gap-1 text-caption text-text-muted transition-colors hover:text-text-secondary"
                >
                  <Edit2 className="h-3 w-3" strokeWidth={1.5} />
                  Edit
                </button>
              )}
              {locked && lockedTime && (
                <div className="flex items-center gap-1.5 text-caption text-text-muted">
                  <Lock className="h-3 w-3" strokeWidth={1.5} />
                  Locked at {lockedTime}
                </div>
              )}
            </div>
          </div>

          {todaySession ? (
            <div className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <BiasChip label="D" bias={todaySession.dailyBias} />
                <BiasChip label="4H" bias={todaySession.h4Bias} />
                <BiasChip label="1H" bias={todaySession.h1Bias} />
                {todaySession.dxyBias && todaySession.dxyBias !== 'n/a' && (
                  <BiasChip label="DXY" bias={todaySession.dxyBias} />
                )}
                {todaySession.htfLiquidityTarget && (
                  <span className="inline-flex items-center rounded-[6px] border border-border px-2 py-0.5 text-caption text-text-secondary">
                    <span className="mr-1 text-micro opacity-70">Target</span>
                    {todaySession.htfLiquidityTarget}
                  </span>
                )}
              </div>
              {todaySession.sessionPlan && (
                <p className="line-clamp-2 text-body-sm text-text-muted">
                  {todaySession.sessionPlan}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-5">
              <p className="text-body-sm text-text-muted">
                Session bias not logged. Log your bias before placing trades.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setBiasOpen(true)}>
                Log Bias
              </Button>
            </div>
          )}
        </div>

        {/* Bottom row: Recent trades + Week adherence */}
        <div className="grid grid-cols-3 gap-4">
          {/* Recent trades table (2/3 width) */}
          <div className="col-span-2 rounded-[12px] border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <p className="text-body-sm font-medium text-text-secondary">Recent Trades</p>
            </div>
            {stats && stats.recentTrades.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {['Pair', 'Setup', 'Dir', 'RR', 'P&L', 'Clean', 'Date'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-micro font-medium uppercase tracking-wide text-text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.recentTrades.map((t) => {
                    const statusCfg = STATUS_BADGE[t.status]
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-border/50 last:border-0 hover:bg-surface-elevated/50 transition-colors"
                      >
                        <td className="px-3 py-2">
                          <span className="font-mono text-caption font-semibold text-text-primary">
                            {t.pairSymbol}
                          </span>
                        </td>
                        <td className="max-w-[100px] px-3 py-2">
                          <span className="truncate text-caption text-text-secondary">
                            {t.setupName}
                          </span>
                        </td>
                        <td className="px-3 py-2">{directionChip(t.direction)}</td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-caption text-text-secondary">
                            {(t.rrRatio / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {t.pnlCents !== null ? (
                            <span
                              className={cn(
                                'font-mono text-caption font-medium',
                                t.pnlCents >= 0 ? 'text-accent-a' : 'text-danger',
                              )}
                            >
                              {formatCents(t.pnlCents)}
                            </span>
                          ) : (
                            <span className="text-caption text-text-muted">
                              {statusCfg.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{cleanIcon(t.isClean)}</td>
                        <td className="px-3 py-2">
                          <span className="text-caption text-text-muted">
                            {formatDate(t.createdAt)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Clock className="mb-2 h-6 w-6 text-text-muted/40" strokeWidth={1.5} />
                <p className="text-body-sm text-text-muted">No trades yet</p>
              </div>
            )}
          </div>

          {/* Week adherence (1/3 width) */}
          <div className="col-span-1 rounded-[12px] border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <p className="text-body-sm font-medium text-text-secondary">This Week</p>
            </div>
            <div className="p-4">
              {stats && stats.weekAdherence.length > 0 ? (
                <div className="space-y-2">
                  {stats.weekAdherence.map((day, i) => {
                    const dayLabel = DAY_LABELS[i] ?? day.date.slice(5)
                    const hasTrades = day.tradeCount > 0
                    const pct = day.adherencePct
                    return (
                      <div key={day.date} className="flex items-center gap-2">
                        <span className="w-7 shrink-0 text-micro text-text-muted">{dayLabel}</span>
                        {hasTrades ? (
                          <>
                            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-elevated">
                              <div
                                className={cn(
                                  'absolute inset-y-0 left-0 rounded-full transition-all',
                                  pct >= 80
                                    ? 'bg-accent-a'
                                    : pct >= 60
                                      ? 'bg-warning'
                                      : 'bg-danger',
                                )}
                                style={{ width: `${Math.max(pct, 0)}%` }}
                              />
                            </div>
                            <span
                              className={cn(
                                'w-8 shrink-0 text-right font-mono text-micro font-semibold',
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
                          <span className="flex-1 text-micro text-text-muted/50">No trades</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-caption text-text-muted">No data this week.</p>
              )}
            </div>

            {/* Rule adherence summary */}
            {stats && stats.ruleBreakdown.length > 0 && (
              <div className="border-t border-border px-4 pb-4 pt-3">
                <p className="mb-2 text-micro font-medium uppercase tracking-wide text-text-muted">
                  Top violations (last 20)
                </p>
                <ul className="space-y-1.5">
                  {stats.ruleBreakdown.slice(0, 3).map((r) => (
                    <li key={r.ruleKey} className="flex items-center justify-between">
                      <span className="truncate text-caption text-text-secondary">
                        {r.ruleKey.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={cn(
                          'ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-micro font-semibold',
                          r.count >= 3
                            ? 'bg-danger/15 text-danger'
                            : 'bg-warning/15 text-warning',
                        )}
                      >
                        ×{r.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <SessionBiasModal open={biasOpen} onClose={() => setBiasOpen(false)} />
      <PreTradePanel
        open={tradeOpen}
        onClose={() => setTradeOpen(false)}
        onTradeCreated={() => {
          void refresh()
          void loadStats()
          setTradeOpen(false)
        }}
      />
    </div>
  )
}
