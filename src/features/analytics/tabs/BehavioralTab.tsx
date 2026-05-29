import { useEffect, useState } from 'react'
import { ipc } from '../../../lib/ipc'
import { useAnalyticsStore } from '../../../stores/analytics-store'
import { EmptyState } from '../../../components/analytics/EmptyState'
import { InsufficientData } from '../../../components/analytics/InsufficientData'
import { formatPercent, formatRMultiple } from '../../../lib/formatters'
import { cn } from '../../../lib/cn'
import type {
  BehavioralStats,
  BucketRow,
  EmotionalBucket,
  SubTotals,
  TradeNumOfDayRow,
} from '@shared/types/index'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BUCKET_LABELS: Record<EmotionalBucket, string> = {
  calm: 'Calm',
  neutral: 'Neutral',
  urgent: 'Urgent',
}
const BUCKET_ORDER: EmotionalBucket[] = ['calm', 'neutral', 'urgent']

function BucketCard({ title, row }: { title: string; row: BucketRow | undefined }) {
  const n = row?.n ?? 0
  const tone =
    row && row.expectancyR > 0
      ? 'text-accent-a'
      : row && row.expectancyR < 0
        ? 'text-danger'
        : 'text-text-primary'
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-4">
      <p className="mb-1 text-caption uppercase tracking-wider text-text-muted">{title}</p>
      <p className="font-mono text-body-sm text-text-muted">n={n}</p>
      {n < 10 || !row ? (
        <div className="mt-2">
          <InsufficientData n={n} />
        </div>
      ) : (
        <>
          <p className={cn('mt-2 font-mono text-[20px] font-semibold', tone)}>
            {formatRMultiple(row.expectancyR)}
          </p>
          <p className="font-mono text-caption text-text-muted">
            Win rate {formatPercent(row.winRateBps)}
          </p>
        </>
      )}
    </div>
  )
}

function SubTotalsCard({ title, sub }: { title: string; sub: SubTotals }) {
  const tone =
    sub.expectancyR > 0 ? 'text-accent-a' : sub.expectancyR < 0 ? 'text-danger' : 'text-text-primary'
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-4">
      <p className="mb-1 text-caption uppercase tracking-wider text-text-muted">{title}</p>
      <p className="font-mono text-body-sm text-text-muted">n={sub.n}</p>
      {sub.n < 10 ? (
        <div className="mt-2">
          <InsufficientData n={sub.n} />
        </div>
      ) : (
        <>
          <p className={cn('mt-2 font-mono text-[20px] font-semibold', tone)}>
            {formatRMultiple(sub.expectancyR)}
          </p>
          <p className="font-mono text-caption text-text-muted">
            Win rate {formatPercent(sub.winRateBps)}
          </p>
        </>
      )}
    </div>
  )
}

function TradeNumCard({ row }: { row: TradeNumOfDayRow }) {
  const label = row.bucket === 3 ? 'Trade #3+ of day' : `Trade #${row.bucket} of day`
  const tone =
    row.expectancyR > 0 ? 'text-accent-a' : row.expectancyR < 0 ? 'text-danger' : 'text-text-primary'
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-4">
      <p className="mb-1 text-caption uppercase tracking-wider text-text-muted">{label}</p>
      <p className="font-mono text-body-sm text-text-muted">n={row.n}</p>
      {row.n < 10 ? (
        <div className="mt-2">
          <InsufficientData n={row.n} />
        </div>
      ) : (
        <>
          <p className={cn('mt-2 font-mono text-[20px] font-semibold', tone)}>
            {formatRMultiple(row.expectancyR)}
          </p>
          <p className="font-mono text-caption text-text-muted">
            Win rate {formatPercent(row.winRateBps)}
          </p>
        </>
      )}
    </div>
  )
}

function heatColor(expR: number, n: number): string {
  if (n === 0) return 'bg-surface'
  if (expR >= 50) return 'bg-accent-a/80'
  if (expR >= 0) return 'bg-accent-a/30'
  if (expR >= -50) return 'bg-danger/30'
  return 'bg-danger/70'
}

export function BehavioralTab() {
  const { filter } = useAnalyticsStore()
  const [data, setData] = useState<BehavioralStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void ipc.analytics.behavioral(filter).then((r) => {
      if (r.ok) setData(r.data)
      setLoading(false)
    })
  }, [filter])

  if (loading) return <div className="py-12 text-center text-text-muted">Loading…</div>
  if (!data) return <EmptyState />

  const totalN =
    data.emotionalBuckets.reduce((s, b) => s + b.n, 0) +
    data.postLoss.firstAfterLoss.n +
    data.postLoss.revenge.n
  if (totalN === 0) return <EmptyState />

  const heatCells = new Map(
    data.hourDayHeatmap.map((c) => [`${c.dow}|${c.hour}`, c]),
  )

  const emotionByBucket = new Map(data.emotionalBuckets.map((b) => [b.bucket, b]))
  const needByBucket = new Map(data.needBuckets.map((b) => [b.bucket, b]))
  const tradeNumByBucket = new Map(data.tradeNumOfDay.map((r) => [r.bucket, r]))

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-body font-semibold text-text-primary">Emotional state</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {BUCKET_ORDER.map((b) => (
            <BucketCard key={b} title={BUCKET_LABELS[b]} row={emotionByBucket.get(b)} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-body font-semibold text-text-primary">Need-to-work state</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {BUCKET_ORDER.map((b) => (
            <BucketCard key={b} title={BUCKET_LABELS[b]} row={needByBucket.get(b)} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-body font-semibold text-text-primary">Post-loss behavior</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <SubTotalsCard title="1st after loss" sub={data.postLoss.firstAfterLoss} />
          <SubTotalsCard title="2nd after loss" sub={data.postLoss.secondAfterLoss} />
          <SubTotalsCard title="Revenge trades" sub={data.postLoss.revenge} />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-body font-semibold text-text-primary">Trade # of day</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n) => {
            const row = tradeNumByBucket.get(n as 1 | 2 | 3) ?? {
              bucket: n as 1 | 2 | 3,
              n: 0,
              winRateBps: 0,
              expectancyR: 0,
            }
            return <TradeNumCard key={n} row={row} />
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <h3 className="mb-3 text-body font-semibold text-text-primary">
          Hour × day expectancy heatmap
        </h3>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead>
              <tr>
                <th className="p-1 text-text-muted"></th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="px-1 text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DOW_LABELS.map((dayLabel, dow) => (
                <tr key={dow}>
                  <td className="pr-2 text-text-muted">{dayLabel}</td>
                  {Array.from({ length: 24 }, (_, h) => {
                    const cell = heatCells.get(`${dow}|${h}`)
                    const n = cell?.n ?? 0
                    const expR = cell?.expectancyR ?? 0
                    return (
                      <td
                        key={h}
                        title={n > 0 ? `${dayLabel} ${h}:00 · n=${n} · ${formatRMultiple(expR)}` : ''}
                        className={cn('h-6 w-6 border border-border/30', heatColor(expR, n))}
                      />
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <h3 className="mb-2 text-body font-semibold text-text-primary">Loss → win recovery</h3>
        {data.recovery.recoveryCount < 10 ? (
          <InsufficientData n={data.recovery.recoveryCount} />
        ) : (
          <p className="font-mono text-body text-text-secondary">
            After a loss, your next winning trade is clean{' '}
            <span className="font-semibold text-accent-a">
              {formatPercent(data.recovery.cleanRateBps)}
            </span>{' '}
            of the time ({data.recovery.cleanRecoveryCount}/{data.recovery.recoveryCount}).
          </p>
        )}
      </div>
    </div>
  )
}
