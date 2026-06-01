import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ipc } from '../../../lib/ipc'
import { useAnalyticsStore } from '../../../stores/analytics-store'
import { EmptyState } from '../../../components/analytics/EmptyState'
import { ChartTooltip } from '../../../components/analytics/ChartTooltip'
import { CHART_COLORS } from '../../../components/analytics/chart-theme'
import { formatPercent, formatRMultiple, formatCents } from '../../../lib/formatters'
import { cn } from '../../../lib/cn'
import type { PlaybookStats, SetupPerformanceStats, SubTotals } from '@shared/types/index'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function CompareRow({
  title,
  data,
}: {
  title: string
  data: { withFlag: SubTotals; withoutFlag: SubTotals }
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-4">
      <h4 className="mb-2 text-body-sm font-semibold text-text-secondary">{title}</h4>
      <div className="grid grid-cols-2 gap-3">
        {(['withFlag', 'withoutFlag'] as const).map((k) => {
          const sub = data[k]
          return (
            <div key={k} className="rounded-md border border-border p-3">
              <p className="mb-1 text-caption uppercase tracking-wider text-text-muted">
                {k === 'withFlag' ? 'With' : 'Without'}
              </p>
              <p className="font-mono text-body text-text-primary">n={sub.n}</p>
              <p className="font-mono text-caption text-text-muted">
                {formatPercent(sub.winRateBps)} · {formatRMultiple(sub.expectancyR)}
              </p>
              <p
                className={cn(
                  'font-mono text-caption',
                  sub.netPnlCents > 0
                    ? 'text-accent-a'
                    : sub.netPnlCents < 0
                      ? 'text-danger'
                      : 'text-text-muted',
                )}
              >
                {formatCents(sub.netPnlCents)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SetupPerformanceTab() {
  const { filter } = useAnalyticsStore()
  const [data,    setData]    = useState<SetupPerformanceStats | null>(null)
  const [pbData,  setPbData]  = useState<PlaybookStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [metric,  setMetric]  = useState<'expectancyR' | 'winRateBps'>('expectancyR')

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      ipc.analytics.setups(filter),
      ipc.analytics.playbookStats(filter),
    ]).then(([r, pb]) => {
      if (r.ok)  setData(r.data)
      if (pb.ok) setPbData(pb.data)
      setLoading(false)
    })
  }, [filter])

  if (loading) return <div className="py-12 text-center text-text-muted">Loading…</div>
  if (!data || data.matrix.length === 0) return <EmptyState />

  const setupNameMap = new Map(data.setupNames.map((s) => [s.id, s.name]))
  const killzoneNameMap = new Map(data.killzoneNames.map((k) => [k.id, k.name]))
  const matrixCells = new Map(data.matrix.map((c) => [`${c.setupId}|${c.killzoneId}`, c]))

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-body font-semibold text-text-primary">Setup × Killzone</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setMetric('expectancyR')}
              className={cn(
                'rounded px-2 py-1 text-caption',
                metric === 'expectancyR'
                  ? 'bg-accent-a/20 text-accent-a'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              Expectancy
            </button>
            <button
              onClick={() => setMetric('winRateBps')}
              className={cn(
                'rounded px-2 py-1 text-caption',
                metric === 'winRateBps'
                  ? 'bg-accent-a/20 text-accent-a'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              Win rate
            </button>
          </div>
        </div>
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr>
              <th className="p-2 text-left text-caption text-text-muted">Setup \ KZ</th>
              {data.killzoneNames.map((k) => (
                <th key={k.id} className="p-2 text-center text-caption text-text-muted">
                  {k.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.setupNames.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-2 text-text-secondary">{s.name}</td>
                {data.killzoneNames.map((k) => {
                  const cell = matrixCells.get(`${s.id}|${k.id}`)
                  if (!cell || cell.n < 5) {
                    return (
                      <td key={k.id} className="p-2 text-center text-text-muted">
                        —
                      </td>
                    )
                  }
                  const v = cell[metric]
                  const tone =
                    metric === 'expectancyR'
                      ? v > 0
                        ? 'text-accent-a'
                        : 'text-danger'
                      : v >= 5000
                        ? 'text-accent-a'
                        : 'text-warning'
                  return (
                    <td key={k.id} className={cn('p-2 text-center font-mono', tone)}>
                      {metric === 'expectancyR' ? formatRMultiple(v) : formatPercent(v)}
                      <br />
                      <span className="text-caption text-text-muted">n={cell.n}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <h3 className="mb-3 text-body font-semibold text-text-primary">Expectancy by setup</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart
              data={data.bySetup.map((r) => ({ ...r, label: setupNameMap.get(r.setupId) ?? r.setupId }))}
            >
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke={CHART_COLORS.axis} />
              <YAxis stroke={CHART_COLORS.axis} />
              <Tooltip content={<ChartTooltip formatter={(v) => formatRMultiple(Number(v))} />} />
              <Bar dataKey="expectancyR" fill={CHART_COLORS.win} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <h3 className="mb-3 text-body font-semibold text-text-primary">Win rate by day of week</h3>
        <div className="h-48">
          <ResponsiveContainer>
            <BarChart data={data.byDay.map((r) => ({ ...r, label: DOW_LABELS[r.dow] ?? r.dow }))}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke={CHART_COLORS.axis} />
              <YAxis
                stroke={CHART_COLORS.axis}
                tickFormatter={(v) => `${Number(v) / 100}%`}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPercent(Number(v))} />} />
              <Bar dataKey="winRateBps" fill={CHART_COLORS.neutral} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <CompareRow title="MSS confirmed" data={data.mssCompare} />
        <CompareRow title="DXY aligned" data={data.dxyCompare} />
        <CompareRow title="SMT confirmed" data={data.smtCompare} />
      </div>

      {void killzoneNameMap}

      {/* Playbook expectancy */}
      {pbData && pbData.byPlaybook.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-elevated p-4">
          <h3 className="mb-3 text-body font-semibold text-text-primary">Expectancy by playbook</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={pbData.byPlaybook.map((r) => ({ ...r, label: r.playbookName }))}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke={CHART_COLORS.axis} />
                <YAxis stroke={CHART_COLORS.axis} />
                <Tooltip content={<ChartTooltip formatter={(v) => formatRMultiple(Number(v))} />} />
                <Bar dataKey="expectancyR" fill={CHART_COLORS.win} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-4 w-full text-body-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-left text-caption text-text-muted">Playbook</th>
                <th className="pb-2 text-right text-caption text-text-muted">n</th>
                <th className="pb-2 text-right text-caption text-text-muted">Win rate</th>
                <th className="pb-2 text-right text-caption text-text-muted">Expectancy</th>
              </tr>
            </thead>
            <tbody>
              {pbData.byPlaybook.map((r) => (
                <tr key={r.playbookId} className="border-t border-border">
                  <td className="py-2 text-text-secondary">{r.playbookName}</td>
                  <td className="py-2 text-right font-mono text-text-muted">{r.n}</td>
                  <td className="py-2 text-right font-mono text-text-muted">{formatPercent(r.winRateBps)}</td>
                  <td className={cn('py-2 text-right font-mono', r.expectancyR > 0 ? 'text-accent-a' : 'text-danger')}>
                    {formatRMultiple(r.expectancyR)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
