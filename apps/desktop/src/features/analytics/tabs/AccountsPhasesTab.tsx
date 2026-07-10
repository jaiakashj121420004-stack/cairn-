import { Lightbulb } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { AccountsPhaseStats } from '@shared/types/index'
import { CHART_COLORS } from '../../../components/analytics/chart-theme'
import { ChartTooltip } from '../../../components/analytics/ChartTooltip'
import { EmptyState } from '../../../components/analytics/EmptyState'
import { StatCard } from '../../../components/analytics/StatCard'
import { cn } from '../../../lib/cn'
import { formatCents, formatPercent } from '../../../lib/formatters'
import { ipc } from '../../../lib/ipc'

// Nvexis Almanac categorical palette — restrained earth/ink tones, no neon.
const PIE_COLORS = ['#7A2A26', '#8A6A2E', '#5E5346', '#B23A2E', '#B8A98E', '#3E2E2A']

function ruleLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function AccountsPhasesTab() {
  const [data, setData] = useState<AccountsPhaseStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void ipc.analytics.phases().then((r) => {
      if (r.ok) setData(r.data)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="py-12 text-center text-text-muted">Loading…</div>
  if (!data || data.ladder.length === 0) return <EmptyState />

  const { ladder, phaseTrend, cost, failureCauses, daysToFailure, insights } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total spent" value={formatCents(cost.totalSpentCents)} tone="negative" />
        <StatCard
          label="Total payouts"
          value={formatCents(cost.totalPayoutsCents)}
          tone="positive"
        />
        <StatCard
          label="Net"
          value={formatCents(cost.netCents)}
          tone={cost.netCents >= 0 ? 'positive' : 'negative'}
        />
        <StatCard label="Cost / trade" value={formatCents(cost.costPerTradeCents)} />
      </div>

      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <h3 className="mb-3 text-body font-semibold text-text-primary">Account ladder</h3>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-body-sm">
            <thead className="sticky top-0 bg-surface-elevated text-left text-caption uppercase tracking-wider text-text-muted">
              <tr>
                <th className="py-2">Account</th>
                <th className="py-2">Firm</th>
                <th className="py-2 text-right">Size</th>
                <th className="py-2 text-center">Phase</th>
                <th className="py-2 text-right">Days</th>
                <th className="py-2 text-right">Cost</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-2 text-text-primary">{a.displayName}</td>
                  <td className="py-2 text-text-secondary">{a.firmName}</td>
                  <td className="py-2 text-right font-mono text-text-secondary">
                    {formatCents(a.sizeCents)}
                  </td>
                  <td className="py-2 text-center font-mono text-text-secondary">
                    {a.phase}/{a.stepCount}
                  </td>
                  <td className="py-2 text-right font-mono text-text-secondary">{a.daysAlive}</td>
                  <td className="py-2 text-right font-mono text-text-secondary">
                    {formatCents(a.costCents)}
                  </td>
                  <td
                    className={cn(
                      'py-2 capitalize',
                      a.status === 'passed'
                        ? 'text-accent-a'
                        : a.status === 'failed'
                          ? 'text-danger'
                          : a.status === 'active'
                            ? 'text-text-primary'
                            : 'text-text-muted',
                    )}
                  >
                    {a.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {phaseTrend.length > 1 && (
        <div className="rounded-lg border border-border bg-surface-elevated p-4">
          <h3 className="mb-3 text-body font-semibold text-text-primary">Phase pass rates</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={phaseTrend}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke={CHART_COLORS.axis} />
                <YAxis
                  stroke={CHART_COLORS.axis}
                  domain={[0, 10000]}
                  tickFormatter={(v) => `${Number(v) / 100}%`}
                />
                <Tooltip content={<ChartTooltip formatter={(v) => formatPercent(Number(v))} />} />
                <Legend />
                <Line dataKey="phase1PassRate" name="Phase 1" stroke={CHART_COLORS.win} dot />
                <Line dataKey="phase2PassRate" name="Phase 2" stroke={CHART_COLORS.neutral} dot />
                <Line dataKey="fundedRate" name="Funded" stroke={CHART_COLORS.loss} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {failureCauses.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-elevated p-4">
            <h3 className="mb-3 text-body font-semibold text-text-primary">Failure causes</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={failureCauses.map((r) => ({ ...r, name: ruleLabel(r.ruleKey) }))}
                    dataKey="count"
                    nameKey="name"
                    outerRadius={80}
                  >
                    {failureCauses.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {daysToFailure.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-elevated p-4">
            <h3 className="mb-3 text-body font-semibold text-text-primary">Days to failure</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={daysToFailure}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" stroke={CHART_COLORS.axis} />
                  <YAxis stroke={CHART_COLORS.axis} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" fill={CHART_COLORS.loss} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-body font-semibold text-text-primary">Pattern insights</h3>
        {insights.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface-elevated p-6 text-center">
            <Lightbulb className="mx-auto mb-2 text-text-muted" size={24} />
            <p className="text-body-sm text-text-secondary">
              Patterns emerge with more data. Complete more challenges to unlock insight cards.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {insights.map((ins) => (
              <div key={ins.id} className="rounded-lg border border-accent-a/40 bg-accent-a/5 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <Lightbulb className="text-accent-a" size={16} />
                  <span className="text-caption uppercase tracking-wider text-text-muted">
                    n={ins.sampleSize}
                  </span>
                </div>
                <p className="text-body-sm text-text-primary">{ins.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
