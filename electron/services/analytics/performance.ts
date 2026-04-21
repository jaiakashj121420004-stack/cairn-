import { and, asc, sql } from 'drizzle-orm'
import { trades } from '../../db/schema'
import type { CairnDb } from '../../db/index'
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
      t: trades.updatedAt,
      pnlCents: trades.pnlCents,
      pnlR: trades.pnlR,
    })
    .from(trades)
    .where(and(...where))
    .orderBy(asc(trades.updatedAt))
    .all()

  let cumCents = 0
  let cumR = 0
  return rows.map((r) => {
    cumCents += r.pnlCents ?? 0
    cumR += r.pnlR ?? 0
    return { t: r.t, cumCents, cumR }
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

export function getDailyHeatmap(db: CairnDb, filter: AnalyticsFilter): DailyPnlCell[] {
  const where = buildTradeWhereClauses(filter)
  const rows = db
    .select({
      date: sql<string>`strftime('%Y-%m-%d', ${trades.updatedAt}/1000, 'unixepoch')`,
      pnlCents: sql<number>`COALESCE(SUM(${trades.pnlCents}), 0)`,
      tradeCount: sql<number>`COUNT(*)`,
    })
    .from(trades)
    .where(and(...where))
    .groupBy(sql`strftime('%Y-%m-%d', ${trades.updatedAt}/1000, 'unixepoch')`)
    .all()

  return rows.map((r) => ({
    date: String(r.date),
    pnlCents: Number(r.pnlCents ?? 0),
    tradeCount: Number(r.tradeCount ?? 0),
  }))
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
