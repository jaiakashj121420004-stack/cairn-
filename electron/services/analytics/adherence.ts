import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import { trades, ruleViolations } from '../../db/schema'
import type { CairnDb } from '../../db/index'
import type {
  AdherenceScore,
  AdherenceTrendPoint,
  AnalyticsFilter,
  AnalyticsTotals,
  BlockedInfo,
  CleanVsDirty,
  RuleBreakRow,
} from '../../../shared/types/index'
import { buildTradeWhereClauses, previousPeriodRange } from './filter'
import { getTotals } from './performance'

function scoreForRange(
  db: CairnDb,
  filter: AnalyticsFilter,
): { cleanCount: number; dirtyCount: number; scoreBps: number } {
  const where = buildTradeWhereClauses(filter)
  const row = db
    .select({
      clean: sql<number>`SUM(CASE WHEN ${trades.isClean} = 1 THEN 1 ELSE 0 END)`,
      dirty: sql<number>`SUM(CASE WHEN ${trades.isClean} = 0 THEN 1 ELSE 0 END)`,
    })
    .from(trades)
    .where(and(...where))
    .get()

  const cleanCount = Number(row?.clean ?? 0)
  const dirtyCount = Number(row?.dirty ?? 0)
  const total = cleanCount + dirtyCount
  const scoreBps = total > 0 ? Math.round((cleanCount / total) * 10000) : 0
  return { cleanCount, dirtyCount, scoreBps }
}

export function getAdherenceScore(db: CairnDb, filter: AnalyticsFilter): AdherenceScore {
  const cur = scoreForRange(db, filter)
  const prev = previousPeriodRange(filter)
  let prevScoreBps: number | null = null
  if (prev) {
    const prevFilter: AnalyticsFilter = { ...filter, dateFrom: prev.from, dateTo: prev.to }
    prevScoreBps = scoreForRange(db, prevFilter).scoreBps
  }
  const trendDirection: 'up' | 'down' | 'flat' =
    prevScoreBps === null || prevScoreBps === cur.scoreBps
      ? 'flat'
      : cur.scoreBps > prevScoreBps
        ? 'up'
        : 'down'
  return {
    cleanCount: cur.cleanCount,
    dirtyCount: cur.dirtyCount,
    scoreBps: cur.scoreBps,
    prevScoreBps,
    trendDirection,
  }
}

export function getCleanVsDirty(db: CairnDb, filter: AnalyticsFilter): CleanVsDirty {
  const clean = getTotals(db, { ...filter, cleanOnly: true })
  const dirty = totalsForDirty(db, filter)
  const cleanAvg = clean.tradeCount > 0 ? Math.round(clean.netPnlCents / clean.tradeCount) : 0
  const dirtyAvg = dirty.tradeCount > 0 ? Math.round(dirty.netPnlCents / dirty.tradeCount) : 0
  return { clean, dirty, avgPnlDiffCents: cleanAvg - dirtyAvg }
}

function totalsForDirty(db: CairnDb, filter: AnalyticsFilter): AnalyticsTotals {
  // Reuse getTotals but filter to isClean = 0
  const where = [...buildTradeWhereClauses(filter), eq(trades.isClean, 0)]
  const row = db
    .select({
      tradeCount: sql<number>`COUNT(*)`,
      winCount: sql<number>`SUM(CASE WHEN ${trades.pnlR} > 0 THEN 1 ELSE 0 END)`,
      lossCount: sql<number>`SUM(CASE WHEN ${trades.pnlR} < 0 THEN 1 ELSE 0 END)`,
      sumR: sql<number | null>`SUM(${trades.pnlR})`,
      sumPnl: sql<number | null>`SUM(${trades.pnlCents})`,
      sumWinPnl: sql<number | null>`SUM(CASE WHEN ${trades.pnlCents} > 0 THEN ${trades.pnlCents} ELSE 0 END)`,
      sumLossPnl: sql<number | null>`SUM(CASE WHEN ${trades.pnlCents} < 0 THEN ${trades.pnlCents} ELSE 0 END)`,
    })
    .from(trades)
    .where(and(...where))
    .get()

  const tradeCount = Number(row?.tradeCount ?? 0)
  const winCount = Number(row?.winCount ?? 0)
  const lossCount = Number(row?.lossCount ?? 0)
  const sumR = Number(row?.sumR ?? 0)
  const netPnlCents = Number(row?.sumPnl ?? 0)
  const sumWin = Number(row?.sumWinPnl ?? 0)
  const sumLoss = Number(row?.sumLossPnl ?? 0)
  return {
    tradeCount,
    winCount,
    lossCount,
    winRateBps: tradeCount > 0 ? Math.round((winCount / tradeCount) * 10000) : 0,
    expectancyR: tradeCount > 0 ? Math.round(sumR / tradeCount) : 0,
    totalR: sumR,
    netPnlCents,
    netPnlPctBps: 0,
    profitFactor:
      sumLoss === 0 ? (sumWin > 0 ? -1 : 0) : Math.round((sumWin / Math.abs(sumLoss)) * 100),
    avgWinCents: winCount > 0 ? Math.round(sumWin / winCount) : 0,
    avgLossCents: lossCount > 0 ? Math.round(sumLoss / lossCount) : 0,
  }
}

export function getTopRulesBroken(db: CairnDb, filter: AnalyticsFilter): RuleBreakRow[] {
  return getRuleBreakRowsOrdered(db, filter, 'count')
}

export function getRuleBreakImpact(db: CairnDb, filter: AnalyticsFilter): RuleBreakRow[] {
  return getRuleBreakRowsOrdered(db, filter, 'netPnl')
}

function getRuleBreakRowsOrdered(
  db: CairnDb,
  filter: AnalyticsFilter,
  order: 'count' | 'netPnl',
): RuleBreakRow[] {
  // Inline WHERE conditions so we can reference both `ruleViolations` and `trades`.
  const conds = [isNull(trades.deletedAt), eq(trades.status, 'closed')]
  if (filter.accountIds !== 'all' && filter.accountIds.length > 0) {
    conds.push(inArray(trades.accountId, filter.accountIds))
  }
  if (filter.dateFrom !== null) conds.push(gte(trades.updatedAt, filter.dateFrom))
  if (filter.dateTo !== null) conds.push(lt(trades.updatedAt, filter.dateTo))
  if (filter.mode !== 'all') conds.push(eq(trades.mode, filter.mode))
  if (filter.pairIds.length > 0) conds.push(inArray(trades.pairId, filter.pairIds))
  if (filter.setupIds.length > 0) conds.push(inArray(trades.setupId, filter.setupIds))
  if (filter.killzoneIds.length > 0) conds.push(inArray(trades.killzoneId, filter.killzoneIds))

  const rows = db
    .select({
      ruleKey: ruleViolations.ruleKey,
      count: sql<number>`COUNT(*)`,
      avgPnl: sql<number>`COALESCE(ROUND(AVG(${trades.pnlCents})), 0)`,
      netPnl: sql<number>`COALESCE(SUM(${trades.pnlCents}), 0)`,
      winRateBps: sql<number>`CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(CASE WHEN ${trades.pnlR} > 0 THEN 1 ELSE 0 END) * 10000.0 / COUNT(*)) ELSE 0 END`,
    })
    .from(ruleViolations)
    .innerJoin(trades, eq(ruleViolations.tradeId, trades.id))
    .where(and(...conds))
    .groupBy(ruleViolations.ruleKey)
    .all()

  const mapped: RuleBreakRow[] = rows.map((r) => ({
    ruleKey: String(r.ruleKey),
    count: Number(r.count),
    avgPnlCentsWhenBroken: Number(r.avgPnl),
    netPnlCents: Number(r.netPnl),
    winRateBps: Number(r.winRateBps),
  }))

  if (order === 'count') {
    mapped.sort((a, b) => b.count - a.count)
  } else {
    mapped.sort((a, b) => a.netPnlCents - b.netPnlCents) // worst first
  }
  return mapped
}

export function getBlockedCount(db: CairnDb, filter: AnalyticsFilter): BlockedInfo {
  const conds = [eq(ruleViolations.outcome, 'blocked')]
  if (filter.accountIds !== 'all' && filter.accountIds.length > 0) {
    conds.push(inArray(ruleViolations.accountId, filter.accountIds))
  }
  if (filter.dateFrom !== null) conds.push(gte(ruleViolations.createdAt, filter.dateFrom))
  if (filter.dateTo !== null) conds.push(lt(ruleViolations.createdAt, filter.dateTo))

  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(ruleViolations)
    .where(and(...conds))
    .get()
  const blockedCount = Number(row?.count ?? 0)

  const dirty = totalsForDirty(db, filter)
  const avgDirtyPnl = dirty.tradeCount > 0 ? dirty.netPnlCents / dirty.tradeCount : 0
  const projectedAvoidedCents = Math.round(blockedCount * Math.max(0, -avgDirtyPnl))
  return { blockedCount, projectedAvoidedCents }
}

export function getAdherenceTrendWeekly(
  db: CairnDb,
  filter: AnalyticsFilter,
): AdherenceTrendPoint[] {
  const where = buildTradeWhereClauses(filter)
  // strftime '%W' gives week-of-year; combine with %Y for uniqueness
  const rows = db
    .select({
      weekKey: sql<string>`strftime('%Y-%W', ${trades.updatedAt}/1000, 'unixepoch')`,
      weekStart: sql<string>`strftime('%Y-%m-%d', ${trades.updatedAt}/1000, 'unixepoch', 'weekday 1', '-7 days')`,
      cleanCount: sql<number>`SUM(CASE WHEN ${trades.isClean} = 1 THEN 1 ELSE 0 END)`,
      totalCount: sql<number>`COUNT(*)`,
    })
    .from(trades)
    .where(and(...where))
    .groupBy(sql`strftime('%Y-%W', ${trades.updatedAt}/1000, 'unixepoch')`)
    .orderBy(sql`strftime('%Y-%W', ${trades.updatedAt}/1000, 'unixepoch')`)
    .all()

  return rows.map((r) => {
    const cleanCount = Number(r.cleanCount)
    const totalCount = Number(r.totalCount)
    return {
      weekStart: String(r.weekStart),
      cleanCount,
      totalCount,
      scoreBps: totalCount > 0 ? Math.round((cleanCount / totalCount) * 10000) : 0,
    }
  })
}
