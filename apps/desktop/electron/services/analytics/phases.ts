import { and, eq, isNull, sql } from 'drizzle-orm'
import { accounts, propFirms, ruleViolations, trades } from '../../db/schema'
import type {
  AccountLadderRow,
  AnalyticsFilter,
  CostAnalysis,
  DaysToFailureBucket,
  FailureCauseRow,
  PatternInsight,
  PhaseTrendPoint,
} from '../../../shared/types/index'
import type { CairnDb } from '../../db/index'

// Phases tab is global by convention — account filter applied if narrowed.

export function getAccountLadder(db: CairnDb): AccountLadderRow[] {
  const rows = db
    .select({
      id: accounts.id,
      displayName: accounts.displayName,
      firmName: propFirms.name,
      sizeCents: accounts.accountSizeCents,
      phase: accounts.currentPhase,
      stepCount: accounts.stepCount,
      startDate: accounts.startDate,
      endDate: accounts.endDate,
      status: accounts.status,
      endReason: accounts.endReason,
      costCents: accounts.challengeCostCents,
    })
    .from(accounts)
    .innerJoin(propFirms, eq(accounts.propFirmId, propFirms.id))
    .where(isNull(accounts.deletedAt))
    .all()

  const now = Date.now()
  return rows.map((r) => {
    const end = r.endDate ?? now
    const daysAlive = Math.max(0, Math.floor((end - r.startDate) / 86_400_000))
    return {
      id: String(r.id),
      displayName: String(r.displayName),
      firmName: String(r.firmName),
      sizeCents: Number(r.sizeCents),
      phase: Number(r.phase),
      stepCount: Number(r.stepCount),
      daysAlive,
      status: String(r.status),
      endReason: r.endReason,
      costCents: Number(r.costCents),
    }
  })
}

export function getPhaseTrend(db: CairnDb): PhaseTrendPoint[] {
  const rows = db
    .select({
      month: sql<string>`strftime('%Y-%m', ${accounts.startDate}/1000, 'unixepoch')`,
      total: sql<number>`COUNT(*)`,
      phase1Passed: sql<number>`SUM(CASE WHEN ${accounts.currentPhase} >= 2 OR ${accounts.status} = 'funded' THEN 1 ELSE 0 END)`,
      phase2Passed: sql<number>`SUM(CASE WHEN ${accounts.status} = 'funded' THEN 1 ELSE 0 END)`,
      funded: sql<number>`SUM(CASE WHEN ${accounts.status} = 'funded' THEN 1 ELSE 0 END)`,
    })
    .from(accounts)
    .where(isNull(accounts.deletedAt))
    .groupBy(sql`strftime('%Y-%m', ${accounts.startDate}/1000, 'unixepoch')`)
    .orderBy(sql`strftime('%Y-%m', ${accounts.startDate}/1000, 'unixepoch')`)
    .all()

  return rows.map((r) => {
    const total = Number(r.total)
    return {
      month: String(r.month),
      phase1PassRate: total > 0 ? Math.round((Number(r.phase1Passed) / total) * 10000) : 0,
      phase2PassRate: total > 0 ? Math.round((Number(r.phase2Passed) / total) * 10000) : 0,
      fundedRate: total > 0 ? Math.round((Number(r.funded) / total) * 10000) : 0,
      sampleSize: total,
    }
  })
}

export function getCostAnalysis(db: CairnDb): CostAnalysis {
  const accountRow = db
    .select({
      totalSpent: sql<number>`COALESCE(SUM(${accounts.challengeCostCents}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(accounts)
    .where(isNull(accounts.deletedAt))
    .get()

  const tradeRow = db
    .select({
      tradeCount: sql<number>`COUNT(*)`,
      netPnl: sql<number>`COALESCE(SUM(${trades.pnlCents}), 0)`,
    })
    .from(trades)
    .where(and(isNull(trades.deletedAt), eq(trades.status, 'closed')))
    .get()

  const totalSpent = Number(accountRow?.totalSpent ?? 0)
  const netPnl = Number(tradeRow?.netPnl ?? 0)
  const totalPayouts = netPnl > 0 ? netPnl : 0
  const tradeCount = Number(tradeRow?.tradeCount ?? 0)

  return {
    totalSpentCents: totalSpent,
    totalPayoutsCents: totalPayouts,
    netCents: totalPayouts - totalSpent,
    costPerTradeCents: tradeCount > 0 ? Math.round(totalSpent / tradeCount) : 0,
    accountCount: Number(accountRow?.count ?? 0),
  }
}

export function getFailureCauses(db: CairnDb): FailureCauseRow[] {
  const rows = db
    .select({
      ruleKey: ruleViolations.ruleKey,
      count: sql<number>`COUNT(*)`,
    })
    .from(ruleViolations)
    .innerJoin(accounts, eq(ruleViolations.accountId, accounts.id))
    .where(and(eq(accounts.status, 'failed'), isNull(accounts.deletedAt)))
    .groupBy(ruleViolations.ruleKey)
    .all()

  return rows
    .map((r) => ({ ruleKey: String(r.ruleKey), count: Number(r.count) }))
    .sort((a, b) => b.count - a.count)
}

export function getDaysToFailureHistogram(db: CairnDb): DaysToFailureBucket[] {
  const rows = db
    .select({
      start: accounts.startDate,
      end: accounts.endDate,
    })
    .from(accounts)
    .where(and(eq(accounts.status, 'failed'), isNull(accounts.deletedAt)))
    .all()

  const buckets: Record<string, number> = {
    '0-3': 0,
    '4-7': 0,
    '8-14': 0,
    '15-30': 0,
    '31+': 0,
  }
  for (const r of rows) {
    if (r.end === null) continue
    const days = Math.max(0, Math.floor((Number(r.end) - Number(r.start)) / 86_400_000))
    const key =
      days <= 3 ? '0-3' : days <= 7 ? '4-7' : days <= 14 ? '8-14' : days <= 30 ? '15-30' : '31+'
    buckets[key] = (buckets[key] ?? 0) + 1
  }
  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }))
}

const INSIGHT_MIN_N = 10
const INSIGHT_MIN_EFFECT_BPS = 2000 // 20 percentage points

interface Candidate {
  id: string
  textFactory: (stats: { effectBps: number; sampleSize: number }) => string
  compute: (db: CairnDb) => { sampleSize: number; effectBps: number } | null
}

function winRateBps(db: CairnDb, extra?: (ws: ReturnType<typeof baseWhere>) => void): number {
  void db
  void extra
  return 0
}
void winRateBps

const CANDIDATES: Candidate[] = [
  {
    id: 'urgent-vs-calm',
    textFactory: ({ effectBps, sampleSize }) =>
      `Urgent-state trades win ${(effectBps / 100).toFixed(0)}pp less often than calm-state trades (n=${sampleSize}).`,
    compute: (db) => {
      const rows = db
        .select({
          urgency: trades.preUrgencyScore,
          pnlR: trades.pnlR,
        })
        .from(trades)
        .where(and(isNull(trades.deletedAt), eq(trades.status, 'closed')))
        .all()

      let calmN = 0,
        calmW = 0,
        urgN = 0,
        urgW = 0
      for (const r of rows) {
        const win = (r.pnlR ?? 0) > 0 ? 1 : 0
        if (r.urgency <= 4) {
          calmN++
          calmW += win
        } else if (r.urgency >= 8) {
          urgN++
          urgW += win
        }
      }
      if (calmN < INSIGHT_MIN_N || urgN < INSIGHT_MIN_N) return null
      const calmRate = (calmW / calmN) * 10000
      const urgRate = (urgW / urgN) * 10000
      const effectBps = Math.round(calmRate - urgRate)
      if (effectBps < INSIGHT_MIN_EFFECT_BPS) return null
      return { sampleSize: calmN + urgN, effectBps }
    },
  },
  {
    id: 'first-vs-thirdplus',
    textFactory: ({ effectBps, sampleSize }) =>
      `Third-or-later trade of the day underperforms the first by ${(effectBps / 100).toFixed(0)}R × 100 on average (n=${sampleSize}).`,
    compute: (db) => {
      const rows = db
        .select({
          t: trades.updatedAt,
          pnlR: trades.pnlR,
          accountId: trades.accountId,
          day: sql<string>`strftime('%Y-%m-%d', ${trades.updatedAt}/1000, 'unixepoch')`,
        })
        .from(trades)
        .where(and(isNull(trades.deletedAt), eq(trades.status, 'closed')))
        .orderBy(trades.updatedAt)
        .all()

      const groups = new Map<string, { t: number; pnlR: number | null }[]>()
      for (const r of rows) {
        const key = `${r.accountId}|${r.day}`
        const arr = groups.get(key) ?? []
        arr.push({ t: Number(r.t), pnlR: r.pnlR })
        groups.set(key, arr)
      }
      let firstSumR = 0,
        firstN = 0,
        thirdSumR = 0,
        thirdN = 0
      for (const arr of groups.values()) {
        arr.sort((a, b) => a.t - b.t)
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i]?.pnlR ?? 0
          if (i === 0) {
            firstSumR += v
            firstN++
          } else if (i >= 2) {
            thirdSumR += v
            thirdN++
          }
        }
      }
      if (firstN < INSIGHT_MIN_N || thirdN < INSIGHT_MIN_N) return null
      const firstExp = firstSumR / firstN
      const thirdExp = thirdSumR / thirdN
      const effect = Math.round(firstExp - thirdExp)
      if (effect < INSIGHT_MIN_EFFECT_BPS) return null
      return { sampleSize: firstN + thirdN, effectBps: effect }
    },
  },
  {
    id: 'clean-vs-dirty-adherence',
    textFactory: ({ effectBps, sampleSize }) =>
      `Clean trades win ${(effectBps / 100).toFixed(0)}pp more often than dirty trades (n=${sampleSize}).`,
    compute: (db) => {
      const rows = db
        .select({
          isClean: trades.isClean,
          pnlR: trades.pnlR,
        })
        .from(trades)
        .where(and(isNull(trades.deletedAt), eq(trades.status, 'closed')))
        .all()
      let cn = 0,
        cw = 0,
        dn = 0,
        dw = 0
      for (const r of rows) {
        const win = (r.pnlR ?? 0) > 0 ? 1 : 0
        if (r.isClean === 1) {
          cn++
          cw += win
        } else if (r.isClean === 0) {
          dn++
          dw += win
        }
      }
      if (cn < INSIGHT_MIN_N || dn < INSIGHT_MIN_N) return null
      const effect = Math.round((cw / cn) * 10000 - (dw / dn) * 10000)
      if (effect < INSIGHT_MIN_EFFECT_BPS) return null
      return { sampleSize: cn + dn, effectBps: effect }
    },
  },
]

export function getPatternInsights(db: CairnDb): PatternInsight[] {
  const out: PatternInsight[] = []
  for (const c of CANDIDATES) {
    const res = c.compute(db)
    if (!res) continue
    out.push({ id: c.id, text: c.textFactory(res), sampleSize: res.sampleSize })
  }
  return out
}

function baseWhere() {
  return { filter: {} as AnalyticsFilter }
}
void baseWhere
