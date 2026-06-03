import { TrendingUp, TrendingDown, Minus, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import type { RuleAdherenceStats, AnalyticsTotals } from '@shared/types/index'
import { CHART_COLORS } from '../../../components/analytics/chart-theme'
import { ChartTooltip } from '../../../components/analytics/ChartTooltip'
import { EmptyState } from '../../../components/analytics/EmptyState'
import { InsufficientData } from '../../../components/analytics/InsufficientData'
import { cn } from '../../../lib/cn'
import { formatCents, formatPercent, formatRMultiple } from '../../../lib/formatters'
import { ipc } from '../../../lib/ipc'
import { useAnalyticsStore } from '../../../stores/analytics-store'

function CleanDirtyCard({ kind, data }: { kind: 'clean' | 'dirty'; data: AnalyticsTotals }) {
  const color = kind === 'clean' ? 'text-accent-a' : 'text-danger'
  const border = kind === 'clean' ? 'border-accent-a/40' : 'border-danger/40'
  return (
    <div className={cn('rounded-lg border bg-surface-elevated p-5', border)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className={cn('text-h3 font-semibold capitalize', color)}>{kind}</h3>
        <span className="font-mono text-body-sm text-text-muted">n={data.tradeCount}</span>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between font-mono">
          <span className="text-text-muted">Win rate</span>
          <span className="text-text-primary">{formatPercent(data.winRateBps)}</span>
        </div>
        <div className="flex justify-between font-mono">
          <span className="text-text-muted">Expectancy</span>
          <span className="text-text-primary">{formatRMultiple(data.expectancyR)}</span>
        </div>
        <div className="flex justify-between font-mono">
          <span className="text-text-muted">Total R</span>
          <span className="text-text-primary">{(data.totalR / 100).toFixed(2)}R</span>
        </div>
        <div className="flex justify-between font-mono">
          <span className="text-text-muted">Net P&L</span>
          <span
            className={cn(
              data.netPnlCents > 0
                ? 'text-accent-a'
                : data.netPnlCents < 0
                  ? 'text-danger'
                  : 'text-text-primary',
            )}
          >
            {formatCents(data.netPnlCents)}
          </span>
        </div>
      </div>
    </div>
  )
}

function ruleLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function RuleAdherenceTab() {
  const { filter } = useAnalyticsStore()
  const [data, setData] = useState<RuleAdherenceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'count' | 'netPnl' | 'winRate'>('netPnl')

  useEffect(() => {
    setLoading(true)
    void ipc.analytics.adherence(filter).then((r) => {
      if (r.ok) setData(r.data)
      setLoading(false)
    })
  }, [filter])

  if (loading) return <div className="py-12 text-center text-text-muted">Loading…</div>
  if (!data || data.score.cleanCount + data.score.dirtyCount === 0) return <EmptyState />

  const { score, cleanVsDirty, topBroken, impactTable, blocked, trendLine } = data
  const totalN = score.cleanCount + score.dirtyCount
  const TrendIcon =
    score.trendDirection === 'up'
      ? TrendingUp
      : score.trendDirection === 'down'
        ? TrendingDown
        : Minus

  const sortedImpact = [...impactTable].sort((a, b) => {
    if (sortBy === 'count') return b.count - a.count
    if (sortBy === 'winRate') return b.winRateBps - a.winRateBps
    return a.netPnlCents - b.netPnlCents
  })

  const bothEnough = cleanVsDirty.clean.tradeCount >= 10 && cleanVsDirty.dirty.tradeCount >= 10

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-8 rounded-lg border border-border bg-surface-elevated p-6">
        <div className="flex-1">
          <p className="mb-1 text-caption uppercase tracking-wider text-text-muted">
            Adherence score
          </p>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[56px] font-bold leading-none text-text-primary">
              {(score.scoreBps / 100).toFixed(0)}%
            </span>
            <span className="flex items-center gap-1 text-body text-text-muted">
              <TrendIcon size={14} />
              {score.prevScoreBps !== null
                ? `${((score.scoreBps - score.prevScoreBps) / 100).toFixed(0)}pp vs prev`
                : 'no prior window'}
            </span>
          </div>
          <p className="mt-2 text-caption text-text-muted">
            {score.cleanCount} clean / {totalN} trades
          </p>
        </div>

        <div className="flex-1 text-right">
          <p className="mb-1 text-caption uppercase tracking-wider text-text-muted">
            Blocked pre-trade
          </p>
          <div className="flex items-baseline justify-end gap-3">
            <ShieldCheck className="text-accent-a" size={20} />
            <span className="font-mono text-[40px] font-bold leading-none text-accent-a">
              {blocked.blockedCount}
            </span>
          </div>
          <p className="mt-2 text-caption text-text-muted">
            Est. avoided: {formatCents(blocked.projectedAvoidedCents)}
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-body font-semibold text-text-primary">Clean vs Dirty</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <CleanDirtyCard kind="clean" data={cleanVsDirty.clean} />
          <CleanDirtyCard kind="dirty" data={cleanVsDirty.dirty} />
        </div>
        {bothEnough ? (
          <p className="mt-3 rounded-md border border-border bg-surface-elevated p-3 text-center text-body-sm text-text-secondary">
            Dirty trades cost you{' '}
            <span className="font-mono font-semibold text-danger">
              {formatCents(Math.abs(cleanVsDirty.avgPnlDiffCents))}
            </span>{' '}
            more per trade than clean ones.
          </p>
        ) : (
          <div className="mt-3">
            <InsufficientData
              n={Math.min(cleanVsDirty.clean.tradeCount, cleanVsDirty.dirty.tradeCount)}
            />
          </div>
        )}
      </div>

      {topBroken.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-elevated p-4">
          <h3 className="mb-3 text-body font-semibold text-text-primary">Top rules broken</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart
                layout="vertical"
                data={topBroken.slice(0, 8).map((r) => ({ ...r, label: ruleLabel(r.ruleKey) }))}
              >
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis type="number" stroke={CHART_COLORS.axis} />
                <YAxis type="category" dataKey="label" stroke={CHART_COLORS.axis} width={170} />
                <Tooltip
                  content={
                    <ChartTooltip
                      formatter={(v, name) => {
                        if (name === 'count') return `${v} trades`
                        return String(v)
                      }}
                    />
                  }
                />
                <Bar dataKey="count" fill={CHART_COLORS.loss} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {impactTable.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-elevated p-4">
          <h3 className="mb-3 text-body font-semibold text-text-primary">Rule-break impact</h3>
          <table className="w-full text-body-sm">
            <thead className="text-left text-caption uppercase tracking-wider text-text-muted">
              <tr>
                <th className="pb-2">Rule</th>
                <th className="cursor-pointer pb-2 text-right" onClick={() => setSortBy('count')}>
                  Count
                </th>
                <th className="cursor-pointer pb-2 text-right" onClick={() => setSortBy('netPnl')}>
                  Net P&L
                </th>
                <th className="cursor-pointer pb-2 text-right" onClick={() => setSortBy('winRate')}>
                  Win rate
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedImpact.map((r) => (
                <tr key={r.ruleKey} className="border-t border-border">
                  <td className="py-2 text-text-primary">{ruleLabel(r.ruleKey)}</td>
                  <td className="py-2 text-right font-mono text-text-secondary">{r.count}</td>
                  <td
                    className={cn(
                      'py-2 text-right font-mono',
                      r.netPnlCents < 0 ? 'text-danger' : 'text-accent-a',
                    )}
                  >
                    {formatCents(r.netPnlCents)}
                  </td>
                  <td className="py-2 text-right font-mono text-text-secondary">
                    {formatPercent(r.winRateBps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {trendLine.length > 1 && (
        <div className="rounded-lg border border-border bg-surface-elevated p-4">
          <h3 className="mb-3 text-body font-semibold text-text-primary">Weekly adherence</h3>
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={trendLine}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis dataKey="weekStart" stroke={CHART_COLORS.axis} />
                <YAxis
                  stroke={CHART_COLORS.axis}
                  domain={[0, 10000]}
                  tickFormatter={(v) => `${Number(v) / 100}%`}
                />
                <Tooltip content={<ChartTooltip formatter={(v) => formatPercent(Number(v))} />} />
                <Line
                  dataKey="scoreBps"
                  name="Adherence"
                  stroke={CHART_COLORS.win}
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
