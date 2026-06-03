/**
 * Derived analytics — pure functions over a pre-fetched trade list.
 *
 * All inputs are TradeRowForDerived so callers can pass any slice of the
 * trades table without importing the full ORM schema.  Rows are expected to
 * have status='closed' and deletedAt=null already filtered by the caller.
 *
 * Expectancy and profit-factor use decimal.js exclusively (§2.5, §19.5).
 * No plain `number` arithmetic for those values; only Decimal throughout.
 */

import Decimal from 'decimal.js'
import type {
  DowSummaryRow,
  ProfitFactorResult,
  HourDayCell,
  RDistributionBucket,
} from '../../../shared/types/index'

// ─── Input type ───────────────────────────────────────────────────────────────

export interface TradeRowForDerived {
  pnlR: number | null // R × 100 (integer-encoded)
  pnlCents: number | null // integer cents
  exitTime: number | null // UTC ms timestamp
}

// ─── Internal helper ─────────────────────────────────────────────────────────

const DOW_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/**
 * Extracts { dow (0=Sun..6=Sat), hour (0-23) } from a UTC-ms timestamp
 * in the given IANA timezone using Intl.DateTimeFormat parts.
 * hour12:false can emit "24" for midnight in some locales — normalised to 0.
 */
function dowAndHour(exitTimeMs: number, timeZone: string): { dow: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(exitTimeMs)

  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0'

  const dow = DOW_MAP[weekdayStr] ?? 0
  const hourNum = Number(hourStr)
  const hour = hourNum === 24 ? 0 : hourNum

  return { dow, hour }
}

// ─── 1. Time-of-day × day-of-week heatmap ────────────────────────────────────

/**
 * 24 × 7 grid (hour × dow) coloured by expectancy in R.
 * Only cells with ≥1 trade are returned; absent cells should be treated as n=0.
 * expectancyR is R × 100, integer-rounded, computed with decimal.js.
 */
export function getTimeOfDayHeatmap(rows: TradeRowForDerived[], timeZone: string): HourDayCell[] {
  interface Acc {
    sumR: Decimal
    n: number
  }
  const cells = new Map<string, Acc>()

  for (const r of rows) {
    if (r.exitTime == null || r.pnlR == null) continue
    const { dow, hour } = dowAndHour(r.exitTime, timeZone)
    const key = `${dow}:${hour}`
    const existing = cells.get(key) ?? { sumR: new Decimal(0), n: 0 }
    existing.sumR = existing.sumR.plus(r.pnlR)
    existing.n += 1
    cells.set(key, existing)
  }

  const result: HourDayCell[] = []
  for (const [key, { sumR, n }] of cells) {
    const [dow, hour] = key.split(':').map(Number) as [number, number]
    result.push({
      dow,
      hour,
      n,
      expectancyR: sumR.div(n).toDecimalPlaces(0).toNumber(),
    })
  }
  return result
}

// ─── 2. Day-of-week summary ───────────────────────────────────────────────────

export function getDowSummary(rows: TradeRowForDerived[], timeZone: string): DowSummaryRow[] {
  interface Acc {
    n: number
    wins: number
    sumR: Decimal
    sumPnl: number
  }
  const byDow = new Map<number, Acc>()

  for (const r of rows) {
    if (r.exitTime == null) continue
    const { dow } = dowAndHour(r.exitTime, timeZone)
    const acc = byDow.get(dow) ?? { n: 0, wins: 0, sumR: new Decimal(0), sumPnl: 0 }
    acc.n += 1
    if ((r.pnlR ?? 0) > 0) acc.wins += 1
    acc.sumR = acc.sumR.plus(r.pnlR ?? 0)
    acc.sumPnl += r.pnlCents ?? 0
    byDow.set(dow, acc)
  }

  return Array.from(byDow.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([dow, acc]) => ({
      dow,
      n: acc.n,
      winRateBps: acc.n > 0 ? Math.round((acc.wins / acc.n) * 10000) : 0,
      expectancyR: acc.n > 0 ? acc.sumR.div(acc.n).toDecimalPlaces(0).toNumber() : 0,
      netPnlCents: acc.sumPnl,
    }))
}

// ─── 3. Expectancy in R (decimal.js) + trend sparkline ───────────────────────

/**
 * Overall expectancy (R × 100, integer) computed with decimal.js.
 * Sparkline: rolling 10-trade window over the last 20 closed trades, step 1,
 * values oldest-first.  Empty array when fewer than 2 trades.
 */
export function getExpectancyWithSpark(rows: TradeRowForDerived[]): {
  expectancyR: number
  spark: number[]
} {
  const closed = rows.filter((r) => r.pnlR != null)
  if (closed.length === 0) return { expectancyR: 0, spark: [] }

  let sum = new Decimal(0)
  for (const r of closed) {
    // pnlR is guaranteed non-null by the filter above
    sum = sum.plus(r.pnlR ?? 0)
  }
  const expectancyR = sum.div(closed.length).toDecimalPlaces(0).toNumber()

  // Rolling 10-trade expectancy over the last ≤20 trades
  const last20 = closed.slice(-20)
  const spark: number[] = []
  for (let i = 0; i < last20.length; i++) {
    const window = last20.slice(Math.max(0, i - 9), i + 1)
    let wSum = new Decimal(0)
    for (const r of window) wSum = wSum.plus(r.pnlR ?? 0)
    spark.push(wSum.div(window.length).toDecimalPlaces(0).toNumber())
  }

  return { expectancyR, spark }
}

// ─── 4. Profit factor (R-based, decimal.js) ───────────────────────────────────

/**
 * Profit factor = gross winning R / gross losing R (absolute).
 * Both sums use decimal.js — no float arithmetic.
 * { valueTimes100, infinite }:
 *   valueTimes100 = round(value × 100); 0 when no trades or no winners.
 *   infinite      = true when gross loss is 0 but gross win > 0.
 */
export function getProfitFactorR(rows: TradeRowForDerived[]): ProfitFactorResult {
  let grossWin = new Decimal(0)
  let grossLoss = new Decimal(0)

  for (const r of rows) {
    const rv = r.pnlR ?? 0
    if (rv > 0) {
      grossWin = grossWin.plus(rv)
    } else if (rv < 0) {
      grossLoss = grossLoss.plus(Math.abs(rv))
    }
  }

  if (grossLoss.isZero()) {
    return {
      valueTimes100: 0,
      infinite: grossWin.gt(0),
      grossWinR: grossWin.toNumber(),
      grossLossR: 0,
    }
  }

  return {
    valueTimes100: grossWin.div(grossLoss).times(100).toDecimalPlaces(0).toNumber(),
    infinite: false,
    grossWinR: grossWin.toNumber(),
    grossLossR: grossLoss.toNumber(),
  }
}

// ─── 5. R-multiple distribution (pure) ───────────────────────────────────────

/**
 * Histogram of R outcomes bucketed at 0.5R (50 hundredths).
 * Identical semantics to the DB-backed getRDistribution in performance.ts
 * but operates on an in-memory row array for one-pass computation.
 */
export function getRDistributionPure(rows: TradeRowForDerived[]): RDistributionBucket[] {
  if (rows.length === 0) return []

  const BUCKET_SIZE = 50
  const buckets = new Map<number, number>()

  for (const r of rows) {
    const val = r.pnlR ?? 0
    const bucketLow = Math.floor(val / BUCKET_SIZE) * BUCKET_SIZE
    buckets.set(bucketLow, (buckets.get(bucketLow) ?? 0) + 1)
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([low, count]) => ({
      rLowHundredths: low,
      rHighHundredths: low + BUCKET_SIZE,
      count,
    }))
}
