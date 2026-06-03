import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { PerformanceStats } from '@shared/types/index'
import { CHART_COLORS } from '../../../components/analytics/chart-theme'
import { ChartTooltip } from '../../../components/analytics/ChartTooltip'
import { EmptyState } from '../../../components/analytics/EmptyState'
import { StatCard } from '../../../components/analytics/StatCard'
import { formatCents, formatRMultiple, formatPercent } from '../../../lib/formatters'
import { ipc } from '../../../lib/ipc'
import { useAnalyticsStore } from '../../../stores/analytics-store'

export function PerformanceTab() {
  const { filter } = useAnalyticsStore()
  const [data, setData] = useState<PerformanceStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void ipc.analytics.performance(filter).then((r) => {
      if (r.ok) setData(r.data)
      setLoading(false)
    })
  }, [filter])

  if (loading) return <div className="py-12 text-center text-text-muted">Loading…</div>
  if (!data || data.totals.tradeCount === 0) return <EmptyState />

  const t = data.totals

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Trades" value={String(t.tradeCount)} />
        <StatCard
          label="Win rate"
          value={formatPercent(t.winRateBps)}
          tone={t.winRateBps >= 5000 ? 'positive' : 'default'}
        />
        <StatCard
          label="Expectancy"
          value={formatRMultiple(t.expectancyR)}
          tone={t.expectancyR > 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Net P&L"
          value={formatCents(t.netPnlCents)}
          tone={t.netPnlCents > 0 ? 'positive' : t.netPnlCents < 0 ? 'negative' : 'default'}
        />
        <StatCard
          label="Profit factor"
          value={t.profitFactor === -1 ? '∞' : (t.profitFactor / 100).toFixed(2)}
        />
        <StatCard
          label="Current streak"
          value={`${data.streaks.currentLen} ${data.streaks.currentKind}`}
          tone={data.streaks.currentKind === 'win' ? 'positive' : 'negative'}
        />
        <StatCard
          label="Max drawdown"
          value={formatCents(-data.maxDrawdownCents)}
          tone="negative"
        />
      </div>

      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <h3 className="mb-3 text-body font-semibold text-text-primary">Equity curve</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={data.equityCurve}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke={CHART_COLORS.axis} tickFormatter={() => ''} />
              <YAxis stroke={CHART_COLORS.axis} tickFormatter={(v) => formatCents(v as number)} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatCents(Number(v))} />} />
              <Line
                dataKey="cumCents"
                name="Equity"
                stroke={CHART_COLORS.win}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <h3 className="mb-3 text-body font-semibold text-text-primary">R-multiple distribution</h3>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={data.distribution}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="rLowHundredths"
                stroke={CHART_COLORS.axis}
                tickFormatter={(v) => `${(Number(v) / 100).toFixed(1)}R`}
              />
              <YAxis stroke={CHART_COLORS.axis} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count">
                {data.distribution.map((b, i) => (
                  <Cell
                    key={i}
                    fill={b.rLowHundredths < 0 ? CHART_COLORS.loss : CHART_COLORS.win}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
