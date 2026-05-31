import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  LineChart,
  Line,
} from 'recharts'
import { ipc } from '../../../lib/ipc'
import { useAnalyticsStore } from '../../../stores/analytics-store'
import { StatCard } from '../../../components/analytics/StatCard'
import { EmptyState } from '../../../components/analytics/EmptyState'
import { ChartTooltip } from '../../../components/analytics/ChartTooltip'
import { InsufficientData } from '../../../components/analytics/InsufficientData'

function NotEnoughData() {
  return <InsufficientData n={0} threshold={10} />
}
import { CHART_COLORS } from '../../../components/analytics/chart-theme'
import { formatCents, formatRMultiple } from '../../../lib/formatters'
import { cn } from '../../../lib/cn'
import type { DerivedStats } from '@shared/types/index'

// ─── Constants ────────────────────────────────────────────────────────────────

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12am' : i < 12 ? `${i}am` : i === 12 ? '12pm' : `${i - 12}pm`,
)
const MIN_SAMPLE = 5

// ─── Helper: heatmap color for expectancy ─────────────────────────────────────

/** Returns a CSS colour for a cell whose expectancy is `r` (R × 100).
 *  Clamps intensity at ±200 (±2R) for visual consistency. */
function heatColor(r: number): string {
  const clamped = Math.max(-200, Math.min(200, r))
  if (clamped === 0) return 'hsl(var(--surface-elevated))'
  const intensity = Math.abs(clamped) / 200
  const alpha = 0.15 + intensity * 0.65
  return clamped > 0
    ? `hsl(74,74%,59%,${alpha.toFixed(2)})`
    : `hsl(0,65%,63%,${alpha.toFixed(2)})`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-body font-semibold text-text-primary">{children}</h3>
  )
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface-elevated p-4', className)}>
      {children}
    </div>
  )
}

// ── 1. Time-of-day heatmap ────────────────────────────────────────────────────

function TimeOfDayHeatmap({ data }: { data: DerivedStats['timeOfDayHeatmap'] }) {
  if (data.length === 0) return <NotEnoughData />

  // Build a 7×24 lookup
  const lookup = new Map<string, { n: number; expectancyR: number }>()
  for (const cell of data) {
    lookup.set(`${cell.dow}:${cell.hour}`, cell)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 520 }}>
        <thead>
          <tr>
            <th className="w-12 pb-1 text-right pr-2 text-micro text-text-muted/50" />
            {DOW_LABELS.map((d) => (
              <th
                key={d}
                className="pb-1 text-center text-micro font-semibold uppercase tracking-wider text-text-muted/60"
                style={{ width: `${100 / 7}%` }}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 24 }, (_, hour) => (
            <tr key={hour}>
              <td className="pr-2 text-right text-micro text-text-muted/50 leading-none py-[2px]">
                {HOUR_LABELS[hour]}
              </td>
              {Array.from({ length: 7 }, (_, dow) => {
                const cell = lookup.get(`${dow}:${hour}`)
                const bg = cell ? heatColor(cell.expectancyR) : 'transparent'
                return (
                  <td key={dow} className="p-[2px]">
                    <div
                      className="flex h-5 w-full items-center justify-center rounded-[3px] text-micro font-mono"
                      style={{ background: bg, color: 'hsl(var(--text-primary))', opacity: cell ? 1 : 0.15 }}
                      title={
                        cell
                          ? `${DOW_LABELS[dow]} ${HOUR_LABELS[hour]}: ${formatRMultiple(cell.expectancyR)} (${cell.n} trades)`
                          : undefined
                      }
                    >
                      {cell && cell.n >= MIN_SAMPLE
                        ? formatRMultiple(cell.expectancyR)
                        : cell
                          ? '·'
                          : ''}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-micro text-text-muted/50">
        · = fewer than {MIN_SAMPLE} trades. Values are expectancy in R.
      </p>
    </div>
  )
}

// ── 2. Day-of-week bar chart ──────────────────────────────────────────────────

function DowChart({ data }: { data: DerivedStats['dowSummary'] }) {
  if (data.length === 0) return <NotEnoughData />

  const chartData = data.map((r) => ({
    label: DOW_LABELS[r.dow] ?? String(r.dow),
    pnlCents: r.netPnlCents,
    winRate: r.winRateBps / 100,
    n: r.n,
  }))

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="mb-2 text-caption text-text-muted">Net P&L by day</p>
        <div className="h-44">
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={CHART_COLORS.axis} tick={{ fontSize: 11 }} />
              <YAxis stroke={CHART_COLORS.axis} tickFormatter={(v) => formatCents(v as number)} tick={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke={CHART_COLORS.axis} strokeDasharray="3 3" />
              <Tooltip
                content={
                  <ChartTooltip formatter={(v, name) =>
                    name === 'pnlCents' ? formatCents(Number(v)) : String(v)
                  } />
                }
              />
              <Bar dataKey="pnlCents" name="P&L">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.pnlCents >= 0 ? CHART_COLORS.win : CHART_COLORS.loss} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="mb-2 text-caption text-text-muted">Win rate by day</p>
        <div className="h-44">
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={CHART_COLORS.axis} tick={{ fontSize: 11 }} />
              <YAxis
                stroke={CHART_COLORS.axis}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
              />
              <ReferenceLine y={50} stroke={CHART_COLORS.neutral} strokeDasharray="3 3" />
              <Tooltip
                content={
                  <ChartTooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                }
              />
              <Bar dataKey="winRate" name="Win rate">
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.winRate >= 50 ? CHART_COLORS.win : CHART_COLORS.loss}
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

// ── 3+4. Expectancy & Profit-factor stat row ──────────────────────────────────

function ExpectancyPfRow({ stats }: { stats: DerivedStats }) {
  const { expectancyR, expectancySpark, profitFactor } = stats

  const pfDisplay = profitFactor.infinite
    ? '∞'
    : profitFactor.valueTimes100 === 0
      ? '—'
      : (profitFactor.valueTimes100 / 100).toFixed(2)

  const pfTone =
    profitFactor.infinite || profitFactor.valueTimes100 > 100
      ? 'positive'
      : profitFactor.valueTimes100 > 0
        ? 'warning'
        : 'negative'

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Expectancy */}
      <Panel>
        <SectionTitle>Expectancy (R)</SectionTitle>
        <p
          className={cn(
            'font-mono text-[32px] font-semibold leading-none mb-3',
            expectancyR > 0 ? 'text-accent-a' : expectancyR < 0 ? 'text-danger' : 'text-text-primary',
          )}
        >
          {formatRMultiple(expectancyR)}
        </p>
        {expectancySpark.length >= 2 && (
          <>
            <p className="mb-1 text-micro text-text-muted/60">Rolling 10-trade window (last 20)</p>
            <div className="h-16">
              <ResponsiveContainer>
                <LineChart data={expectancySpark.map((v, i) => ({ i, v }))}>
                  <ReferenceLine y={0} stroke={CHART_COLORS.axis} strokeDasharray="3 3" />
                  <Line
                    dataKey="v"
                    stroke={expectancyR >= 0 ? CHART_COLORS.win : CHART_COLORS.loss}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <YAxis hide domain={['auto', 'auto']} />
                  <XAxis dataKey="i" hide />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Panel>

      {/* Profit factor */}
      <Panel>
        <SectionTitle>Profit Factor (R-based)</SectionTitle>
        <p
          className={cn(
            'font-mono text-[32px] font-semibold leading-none mb-3',
            pfTone === 'positive' ? 'text-accent-a'
              : pfTone === 'negative' ? 'text-danger'
                : 'text-warning',
          )}
        >
          {pfDisplay}
        </p>
        {profitFactor.infinite && (
          <p className="text-caption text-text-muted">
            No losing trades in this period. Profit factor is mathematically infinite.
          </p>
        )}
        {!profitFactor.infinite && profitFactor.grossLossR > 0 && (
          <div className="mt-1 space-y-1">
            <p className="text-caption text-text-muted">
              Gross win R: {formatRMultiple(profitFactor.grossWinR)}
            </p>
            <p className="text-caption text-text-muted">
              Gross loss R: {formatRMultiple(profitFactor.grossLossR)}
            </p>
          </div>
        )}
      </Panel>
    </div>
  )
}

// ── 5. R-distribution ─────────────────────────────────────────────────────────

function RDistChart({ data }: { data: DerivedStats['rDistribution'] }) {
  if (data.length === 0) return <NotEnoughData />

  const chartData = data.map((b) => ({
    label: `${(b.rLowHundredths / 100).toFixed(1)}R`,
    count: b.count,
    low: b.rLowHundredths,
  }))

  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={CHART_COLORS.axis} tick={{ fontSize: 11 }} />
          <YAxis stroke={CHART_COLORS.axis} allowDecimals={false} tick={{ fontSize: 11 }} />
          <ReferenceLine x="0.0R" stroke={CHART_COLORS.text} strokeWidth={1.5} label={{ value: '0', position: 'top', fontSize: 11 }} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="count" name="Trades">
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.low < 0 ? CHART_COLORS.loss : CHART_COLORS.win} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function DerivedTab() {
  const { filter } = useAnalyticsStore()
  const [data, setData] = useState<DerivedStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void ipc.analytics.derived(filter).then((r) => {
      if (r.ok) setData(r.data)
      setLoading(false)
    })
  }, [filter])

  if (loading) return <div className="py-12 text-center text-text-muted">Loading…</div>
  if (!data || data.rDistribution.length === 0) return <EmptyState />

  return (
    <div className="space-y-6">
      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Expectancy"
          value={formatRMultiple(data.expectancyR)}
          tone={data.expectancyR > 0 ? 'positive' : data.expectancyR < 0 ? 'negative' : 'default'}
        />
        <StatCard
          label="Profit factor"
          value={
            data.profitFactor.infinite
              ? '∞'
              : data.profitFactor.valueTimes100 === 0
                ? '—'
                : (data.profitFactor.valueTimes100 / 100).toFixed(2)
          }
          tone={
            data.profitFactor.infinite || data.profitFactor.valueTimes100 > 100
              ? 'positive'
              : data.profitFactor.valueTimes100 > 0
                ? 'warning'
                : 'negative'
          }
        />
        <StatCard
          label="Best day"
          value={
            data.dowSummary.length > 0
              ? (DOW_LABELS[
                  data.dowSummary.reduce((best, r) =>
                    r.netPnlCents > best.netPnlCents ? r : best,
                  ).dow
                ] ?? '—')
              : '—'
          }
        />
        <StatCard
          label="Worst day"
          value={
            data.dowSummary.length > 0
              ? (DOW_LABELS[
                  data.dowSummary.reduce((worst, r) =>
                    r.netPnlCents < worst.netPnlCents ? r : worst,
                  ).dow
                ] ?? '—')
              : '—'
          }
          tone="negative"
        />
      </div>

      {/* Expectancy + Profit factor */}
      <ExpectancyPfRow stats={data} />

      {/* Day-of-week */}
      <Panel>
        <SectionTitle>Day of week</SectionTitle>
        <DowChart data={data.dowSummary} />
      </Panel>

      {/* R-distribution */}
      <Panel>
        <SectionTitle>R-multiple distribution</SectionTitle>
        <RDistChart data={data.rDistribution} />
      </Panel>

      {/* Time-of-day heatmap */}
      <Panel>
        <SectionTitle>Time-of-day heatmap (expectancy in R)</SectionTitle>
        <TimeOfDayHeatmap data={data.timeOfDayHeatmap} />
      </Panel>
    </div>
  )
}
