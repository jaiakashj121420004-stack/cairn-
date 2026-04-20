import { useState, useEffect } from 'react'
import { BookOpen, Plus, Edit2, Lock } from 'lucide-react'
import { Button } from '../../components/ui'
import { cn } from '../../lib/cn'
import { ipc } from '../../lib/ipc'
import { formatCents } from '../../lib/formatters'
import { useSessionStore } from '../../stores/session-store'
import { SessionBiasModal } from '../session-bias/SessionBiasModal'
import { PreTradePanel } from '../pre-trade/PreTradePanel'
import type { AccountStats } from '@shared/types/index'
import type { DailyBias } from '@shared/types/index'

const BIAS_COLORS: Record<DailyBias, string> = {
  bullish: 'bg-accent-a/15 text-accent-a border-accent-a/30',
  bearish: 'bg-danger/15 text-danger border-danger/30',
  neutral: 'bg-text-muted/15 text-text-secondary border-border',
}

function BiasChip({ label, bias }: { label: string; bias: DailyBias }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-0.5 text-caption font-medium',
        BIAS_COLORS[bias],
      )}
    >
      <span className="text-micro font-normal opacity-70">{label}</span>
      {bias.charAt(0).toUpperCase() + bias.slice(1)}
    </span>
  )
}

function StatCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string
  value: string
  sub?: string
  positive?: boolean | null
}) {
  return (
    <div className="rounded-[12px] border border-border bg-surface-elevated p-4">
      <p className="text-caption text-text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 font-mono text-h2 font-semibold',
          positive === true
            ? 'text-accent-a'
            : positive === false
              ? 'text-danger'
              : 'text-text-primary',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-caption text-text-muted">{sub}</p>}
    </div>
  )
}

export function DashboardPage() {
  const { todaySession, sessionState, selectedAccountId, refresh } = useSessionStore()
  const [biasOpen, setBiasOpen] = useState(false)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [stats, setStats] = useState<AccountStats | null>(null)

  useEffect(() => {
    ipc.accounts.stats().then((res) => {
      if (res.ok && selectedAccountId) {
        const s = res.data.find((s) => s.accountId === selectedAccountId) ?? null
        setStats(s)
      }
    })
  }, [selectedAccountId, sessionState])

  useEffect(() => {
    void refresh()
  }, [selectedAccountId]) // eslint-disable-line react-hooks/exhaustive-deps

  const locked =
    todaySession?.lockedAt !== null && todaySession?.lockedAt !== undefined

  const lockedTime = locked && todaySession?.lockedAt
    ? new Date(todaySession.lockedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  const dailyPnl = stats?.dailyPnlCents ?? null
  const ddUsedPct = stats ? stats.ddUsedBps / 100 : null

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-h2 font-semibold text-text-primary">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setBiasOpen(true)}
          >
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
        {/* Session context card */}
        <div className="rounded-[12px] border border-border bg-surface">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-body-sm font-medium text-text-secondary">Today's Session</p>
            {todaySession && !locked && (
              <button
                type="button"
                onClick={() => setBiasOpen(true)}
                className="flex items-center gap-1 text-caption text-text-muted hover:text-text-secondary transition-colors"
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

          {todaySession ? (
            <div className="px-4 py-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                <BiasChip label="D" bias={todaySession.dailyBias} />
                <BiasChip label="4H" bias={todaySession.h4Bias} />
                <BiasChip label="1H" bias={todaySession.h1Bias} />
                {todaySession.dxyBias && todaySession.dxyBias !== 'n/a' && (
                  <BiasChip label="DXY" bias={todaySession.dxyBias} />
                )}
              </div>
              {todaySession.sessionPlan && (
                <p className="text-body-sm text-text-muted line-clamp-2">
                  {todaySession.sessionPlan}
                </p>
              )}
            </div>
          ) : (
            <div className="px-4 py-5 flex items-center justify-between">
              <p className="text-body-sm text-text-muted">
                Session bias not logged. Log your bias before placing trades.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setBiasOpen(true)}>
                Log Bias
              </Button>
            </div>
          )}
        </div>

        {/* Stats strip */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Daily P&L"
              value={dailyPnl !== null ? formatCents(dailyPnl) : '—'}
              positive={dailyPnl !== null ? dailyPnl > 0 ? true : dailyPnl < 0 ? false : null : null}
            />
            <StatCard
              label="DD Used"
              value={ddUsedPct !== null ? `${ddUsedPct.toFixed(2)}%` : '—'}
              positive={ddUsedPct !== null ? ddUsedPct < 2 ? true : ddUsedPct < 4 ? null : false : null}
            />
            <StatCard
              label="Clean Rate"
              value={stats.tradeCount > 0 ? `${Math.round(stats.cleanRate * 100)}%` : '—'}
              sub={stats.tradeCount > 0 ? `${stats.cleanCount}/${stats.tradeCount} trades` : 'No trades yet'}
              positive={stats.cleanRate >= 0.8 ? true : stats.cleanRate >= 0.6 ? null : false}
            />
          </div>
        )}

        {/* Session state strip */}
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-2 w-2 rounded-full',
            sessionState === 'active' ? 'bg-accent-a' :
            sessionState === 'paused' ? 'bg-warning' :
            sessionState === 'locked' ? 'bg-danger' :
            'bg-text-muted'
          )} />
          <p className="text-body-sm text-text-secondary capitalize">
            {sessionState === 'idle' ? 'No active session' :
             sessionState === 'active' ? 'Session active' :
             sessionState === 'paused' ? 'Session paused' :
             'Session locked — daily limit reached'}
          </p>
        </div>
      </div>

      <SessionBiasModal open={biasOpen} onClose={() => setBiasOpen(false)} />
      <PreTradePanel
        open={tradeOpen}
        onClose={() => setTradeOpen(false)}
        onTradeCreated={() => { void refresh(); setTradeOpen(false) }}
      />
    </div>
  )
}
