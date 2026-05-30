import { and, asc, isNotNull, sql } from 'drizzle-orm'
import { trades } from '../../db/schema'
import type { CairnDb } from '../../db/index'
import { tradingDayKey } from '../time/trading-day'
import type {
  AnalyticsFilter,
  AnalyticsTotals,
  DailyPnlCell,
  EquityPoint,
  RDistributionBucket,
  StreakInfo,
} from '../../../shared/types/index'
import { buildTradeWhereClauses } from './filter'

interface TotalRow {
  tradeCount: number
  winCount: number
  lossCount: number
  sumR: number | null
  sumPnl: number | null
  sumWinPnl: number | null
  sumLossPnl: number | null
  accountSize: number | null
}

export function getTotals(db: CairnDb, filter: AnalyticsFilter): AnalyticsTotals {
  const where = buildTradeWhereClauses(filter)
  const row = db
    .select({
      tradeCount: sql<number>`COUNT(*)`,
      winCount: sql<number>`SUM(CASE WHEN ${trades.pnlR} > 0 THEN 1 ELSE 0 END)`,
      lossCount: sql<number>`SUM(CASE WHEN ${trades.pnlR} < 0 THEN 1 ELSE 0 END)`,
      sumR: sql<number | null>`SUM(${trades.pnlR})`,
      sumPnl: sql<number | null>`SUM(${trades.pnlCents})`,
      sumWinPnl: sql<number | null>`SUM(CASE WHEN ${trades.pnlCents} > 0 THEN ${trades.pnlCents} ELSE 0 END)`,
      sumLossPnl: sql<number | null>`SUM(CASE WHEN ${trades.pnlCents} < 0 THEN ${trades.pnlCents} ELSE 0 END)`,
      accountSize: sql<number | null>`(SELECT account_size_cents FROM accounts WHERE id = ${trades.accountId} LIMIT 1)`,
    })
    .from(trades)
    .where(and(...where))
    .get() as TotalRow | undefined

  const tradeCount = Number(row?.tradeCount ?? 0)
  const winCount = Number(row?.winCount ?? 0)
  const lossCount = Number(row?.lossCount ?? 0)
  const sumR = Number(row?.sumR ?? 0)
  const netPnlCents = Number(row?.sumPnl ?? 0)
  const sumWin = Number(row?.sumWinPnl ?? 0)
  const sumLoss = Number(row?.sumLossPnl ?? 0)
  const accountSize = Number(row?.accountSize ?? 0)

  const winRateBps = tradeCount > 0 ? Math.round((winCount / tradeCount) * 10000) : 0
  const expectancyR = tradeCount > 0 ? Math.round(sumR / tradeCount) : 0
  const profitFactor =
    sumLoss === 0
      ? sumWin > 0
        ? -1
        : 0
      : Math.round((sumWin / Math.abs(sumLoss)) * 100)
  const avgWinCents = winCount > 0 ? Math.round(sumWin / winCount) : 0
  const avgLossCents = lossCount > 0 ? Math.round(sumLoss / lossCount) : 0
  const netPnlPctBps = accountSize > 0 ? Math.round((netPnlCents / accountSize) * 10000) : 0

  return {
    tradeCount,
    winCount,
    lossCount,
    winRateBps,
    expectancyR,
    totalR: sumR,
    netPnlCents,
    netPnlPctBps,
    profitFactor,
    avgWinCents,
    avgLossCents,
  }
}

export function getEquityCurve(db: CairnDb, filter: AnalyticsFilter): EquityPoint[] {
  const where = buildTradeWhereClauses(filter)
  const rows = db
    .select({
      t: trades.exitTime,
      pnlCents: trades.pnlCents,
      pnlR: trades.pnlR,
    })
    .from(trades)
    .where(and(...where))
    .orderBy(asc(trades.exitTime))
    .all()

  let cumCents = 0
  let cumR = 0
  return rows.map((r) => {
    cumCents += r.pnlCents ?? 0
    cumR += r.pnlR ?? 0
    return { t: r.t ?? 0, cumCents, cumR }
  })
}

export function getRDistribution(db: CairnDb, filter: AnalyticsFilter): RDistributionBucket[] {
  const where = buildTradeWhereClauses(filter)
  const rows = db
    .select({ pnlR: trades.pnlR })
    .from(trades)
    .where(and(...where))
    .all()

  if (rows.length === 0) return []

  // Buckets of 0.5R (50 hundredths)
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

export function getStreaks(db: CairnDb, filter: AnalyticsFilter): StreakInfo {
  const where = buildTradeWhereClauses(filter)
  const rows = db
    .select({ pnlR: trades.pnlR, t: trades.updatedAt })
    .from(trades)
    .where(and(...where))
    .orderBy(asc(trades.updatedAt))
    .all()

  if (rows.length === 0) {
    return { currentKind: 'none', currentLen: 0, longestWin: 0, longestLoss: 0 }
  }

  let longestWin = 0
  let longestLoss = 0
  let curKind: 'win' | 'loss' | 'none' = 'none'
  let curLen = 0

  for (const r of rows) {
    const v = r.pnlR ?? 0
    const kind: 'win' | 'loss' | 'none' = v > 0 ? 'win' : v < 0 ? 'loss' : 'none'
    if (kind === 'none') {
      curKind = 'none'
      curLen = 0
      continue
    }
    if (kind === curKind) {
      curLen++
    } else {
      curKind = kind
      curLen = 1
    }
    if (kind === 'win' && curLen > longestWin) longestWin = curLen
    if (kind === 'loss' && curLen > longestLoss) longestLoss = curLen
  }

  return { currentKind: curKind, currentLen: curLen, longestWin, longestLoss }
}

/**
 * Per-day P&L heatmap.
 *
 * Closed trades are bucketed by their **exit_time**, grouped into calendar days
 * in the user's configured `timeZone` (NOT UTC, and NOT by `updated_at`). This
 * keeps a trade's calendar cell:
 *   - stable when the trade is later edited (an edit bumps `updated_at`, never
 *     `exit_time`), and
 *   - in agreement with the rules engine, which buckets the same trade's day in
 *     the same timezone (see `services/time/trading-day.ts`).
 *
 * Trades with a null `exit_time` (open / draft / planned, or legacy rows that
 * never recorded an exit) are excluded so they cannot create a phantom day. The
 * `status = 'closed'` clause from the shared filter already excludes non-closed
 * trades; the explicit null guard additionally protects against bad data.
 *
 * Grouping is done in JS rather than SQL `strftime` because SQLite has no
 * IANA-timezone support — a fixed offset would be wrong across DST.
 */
export function getDailyHeatmap(
  db: CairnDb,
  filter: AnalyticsFilter,
  timeZone: string,
): DailyPnlCell[] {
  const where = buildTradeWhereClauses(filter)
  where.push(isNotNull(trades.exitTime))

  const rows = db
    .select({
      exitTime: trades.exitTime,
      pnlCents: trades.pnlCents,
      pnlR: trades.pnlR,
    })
    .from(trades)
    .where(and(...where))
    .all()

  const byDay = new Map<string, DailyPnlCell>()
  for (const r of rows) {
    if (r.exitTime == null) continue
    const date = tradingDayKey(r.exitTime, timeZone)
    const cell = byDay.get(date) ?? { date, pnlCents: 0, tradeCount: 0, winCount: 0 }
    cell.pnlCents += r.pnlCents ?? 0
    cell.tradeCount += 1
    if ((r.pnlR ?? 0) > 0) cell.winCount += 1
    byDay.set(date, cell)
  }

  return Array.from(byDay.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )
}

export function getMaxDrawdownCents(equity: EquityPoint[]): number {
  let peak = 0
  let maxDd = 0
  for (const p of equity) {
    if (p.cumCents > peak) peak = p.cumCents
    const dd = peak - p.cumCents
    if (dd > maxDd) maxDd = dd
  }
  return maxDd
}
