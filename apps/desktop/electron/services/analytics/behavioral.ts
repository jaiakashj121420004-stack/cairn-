import { and, asc, eq, sql } from 'drizzle-orm'
import { trades } from '../../db/schema'
import { buildTradeWhereClauses } from './filter'
import type {
  AnalyticsFilter,
  BucketRow,
  EmotionalBucket,
  HourDayCell,
  PostLossBehavior,
  RecoveryPattern,
  SubTotals,
  TradeNumOfDayRow,
} from '../../../shared/types/index'
import type { CairnDb } from '../../db/index'

function bucketFor(urg: number): EmotionalBucket {
  if (urg <= 4) return 'calm'
  if (urg <= 7) return 'neutral'
  return 'urgent'
}

function rowsFor(db: CairnDb, filter: AnalyticsFilter) {
  return db
    .select({
      t: trades.updatedAt,
      pnlR: trades.pnlR,
      pnlCents: trades.pnlCents,
      urgency: trades.preUrgencyScore,
      need: trades.preNeedScore,
      isClean: trades.isClean,
      revenge: trades.revengeTradeFlag,
      accountId: trades.accountId,
    })
    .from(trades)
    .where(and(...buildTradeWhereClauses(filter)))
    .orderBy(asc(trades.updatedAt))
    .all()
}

function bucketize(
  rows: { pnlR: number | null; urgency: number; need: number }[],
  kind: 'urgency' | 'need',
): BucketRow[] {
  const buckets: Record<EmotionalBucket, { n: number; wins: number; sumR: number }> = {
    calm: { n: 0, wins: 0, sumR: 0 },
    neutral: { n: 0, wins: 0, sumR: 0 },
    urgent: { n: 0, wins: 0, sumR: 0 },
  }
  for (const r of rows) {
    const val = kind === 'urgency' ? r.urgency : r.need
    const b = bucketFor(val)
    buckets[b].n++
    if ((r.pnlR ?? 0) > 0) buckets[b].wins++
    buckets[b].sumR += r.pnlR ?? 0
  }
  return (['calm', 'neutral', 'urgent'] as const).map((b) => {
    const { n, wins, sumR } = buckets[b]
    return {
      bucket: b,
      n,
      winRateBps: n > 0 ? Math.round((wins / n) * 10000) : 0,
      expectancyR: n > 0 ? Math.round(sumR / n) : 0,
    }
  })
}

export function getEmotionalBuckets(db: CairnDb, filter: AnalyticsFilter): BucketRow[] {
  return bucketize(rowsFor(db, filter), 'urgency')
}

export function getNeedBuckets(db: CairnDb, filter: AnalyticsFilter): BucketRow[] {
  return bucketize(rowsFor(db, filter), 'need')
}

function subFrom(n: number, wins: number, sumR: number, sumPnl: number): SubTotals {
  return {
    n,
    winRateBps: n > 0 ? Math.round((wins / n) * 10000) : 0,
    expectancyR: n > 0 ? Math.round(sumR / n) : 0,
    netPnlCents: sumPnl,
  }
}

export function getPostLossBehavior(db: CairnDb, filter: AnalyticsFilter): PostLossBehavior {
  const rows = rowsFor(db, filter)

  const f = { n: 0, wins: 0, sumR: 0, sumPnl: 0 } // first after loss
  const s = { n: 0, wins: 0, sumR: 0, sumPnl: 0 } // second after loss
  const rv = { n: 0, wins: 0, sumR: 0, sumPnl: 0 } // revenge

  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i]
    if (!cur) continue
    const prev1 = i >= 1 ? rows[i - 1] : null
    const prev2 = i >= 2 ? rows[i - 2] : null

    const curPnl = cur.pnlR ?? 0
    const curCents = cur.pnlCents ?? 0
    const isWin = curPnl > 0

    if (prev1 && (prev1.pnlR ?? 0) < 0) {
      f.n++
      if (isWin) f.wins++
      f.sumR += curPnl
      f.sumPnl += curCents
    }
    if (prev2 && (prev2.pnlR ?? 0) < 0 && prev1 && (prev1.pnlR ?? 0) >= 0) {
      s.n++
      if (isWin) s.wins++
      s.sumR += curPnl
      s.sumPnl += curCents
    }
    if (cur.revenge === 1) {
      rv.n++
      if (isWin) rv.wins++
      rv.sumR += curPnl
      rv.sumPnl += curCents
    }
  }

  return {
    firstAfterLoss: subFrom(f.n, f.wins, f.sumR, f.sumPnl),
    secondAfterLoss: subFrom(s.n, s.wins, s.sumR, s.sumPnl),
    revenge: subFrom(rv.n, rv.wins, rv.sumR, rv.sumPnl),
  }
}

export function getTradeNumOfDay(db: CairnDb, filter: AnalyticsFilter): TradeNumOfDayRow[] {
  const where = buildTradeWhereClauses(filter)
  const rows = db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${trades.updatedAt}/1000, 'unixepoch')`,
      t: trades.updatedAt,
      pnlR: trades.pnlR,
      accountId: trades.accountId,
    })
    .from(trades)
    .where(and(...where))
    .orderBy(asc(trades.updatedAt))
    .all()

  // Group per (accountId, day) and assign ordinal
  const groups = new Map<string, { t: number; pnlR: number | null }[]>()
  for (const r of rows) {
    const key = `${r.accountId}|${r.day}`
    const arr = groups.get(key) ?? []
    arr.push({ t: Number(r.t), pnlR: r.pnlR })
    groups.set(key, arr)
  }

  const buckets: Record<1 | 2 | 3, { n: number; wins: number; sumR: number }> = {
    1: { n: 0, wins: 0, sumR: 0 },
    2: { n: 0, wins: 0, sumR: 0 },
    3: { n: 0, wins: 0, sumR: 0 },
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.t - b.t)
    for (let i = 0; i < arr.length; i++) {
      const b: 1 | 2 | 3 = i === 0 ? 1 : i === 1 ? 2 : 3
      buckets[b].n++
      const v = arr[i]?.pnlR ?? 0
      if (v > 0) buckets[b].wins++
      buckets[b].sumR += v
    }
  }
  return ([1, 2, 3] as const).map((b) => {
    const { n, wins, sumR } = buckets[b]
    return {
      bucket: b,
      n,
      winRateBps: n > 0 ? Math.round((wins / n) * 10000) : 0,
      expectancyR: n > 0 ? Math.round(sumR / n) : 0,
    }
  })
}

export function getHourDayHeatmap(db: CairnDb, filter: AnalyticsFilter): HourDayCell[] {
  const where = buildTradeWhereClauses(filter)
  const rows = db
    .select({
      dow: sql<string>`strftime('%w', ${trades.updatedAt}/1000, 'unixepoch')`,
      hour: sql<string>`strftime('%H', ${trades.updatedAt}/1000, 'unixepoch')`,
      n: sql<number>`COUNT(*)`,
      sumR: sql<number | null>`SUM(${trades.pnlR})`,
    })
    .from(trades)
    .where(and(...where))
    .groupBy(
      sql`strftime('%w', ${trades.updatedAt}/1000, 'unixepoch')`,
      sql`strftime('%H', ${trades.updatedAt}/1000, 'unixepoch')`,
    )
    .all()

  return rows.map((r) => {
    const n = Number(r.n)
    return {
      dow: Number(r.dow),
      hour: Number(r.hour),
      n,
      expectancyR: n > 0 ? Math.round(Number(r.sumR ?? 0) / n) : 0,
    }
  })
}

export function getRecoveryPattern(db: CairnDb, filter: AnalyticsFilter): RecoveryPattern {
  const rows = rowsFor(db, filter)
  let recovery = 0
  let cleanRecovery = 0
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]
    const cur = rows[i]
    if (!prev || !cur) continue
    if ((prev.pnlR ?? 0) < 0 && (cur.pnlR ?? 0) > 0) {
      recovery++
      if (cur.isClean === 1) cleanRecovery++
    }
  }
  return {
    recoveryCount: recovery,
    cleanRecoveryCount: cleanRecovery,
    cleanRateBps: recovery > 0 ? Math.round((cleanRecovery / recovery) * 10000) : 0,
  }
}

// Imports used for side-effects
void eq
