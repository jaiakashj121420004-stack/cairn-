import { and, eq, sql } from 'drizzle-orm'
import { trades, setups as setupsTable, killzones as kzTable } from '../../db/schema'
import type { CairnDb } from '../../db/index'
import type {
  AnalyticsFilter,
  CompareCard,
  DayOfWeekRow,
  MatrixCell,
  SetupRow,
  SubTotals,
} from '../../../shared/types/index'
import { buildTradeWhereClauses } from './filter'

function subTotalsFromRow(r: {
  n: number
  winCount: number
  sumR: number | null
  sumPnl: number | null
}): SubTotals {
  const n = Number(r.n ?? 0)
  const sumR = Number(r.sumR ?? 0)
  return {
    n,
    winRateBps: n > 0 ? Math.round((Number(r.winCount) / n) * 10000) : 0,
    expectancyR: n > 0 ? Math.round(sumR / n) : 0,
    netPnlCents: Number(r.sumPnl ?? 0),
  }
}

export function getSetupKillzoneMatrix(db: CairnDb, filter: AnalyticsFilter): MatrixCell[] {
  const where = buildTradeWhereClauses(filter)
  const rows = db
    .select({
      setupId: trades.setupId,
      killzoneId: trades.killzoneId,
      n: sql<number>`COUNT(*)`,
      winCount: sql<number>`SUM(CASE WHEN ${trades.pnlR} > 0 THEN 1 ELSE 0 END)`,
      sumR: sql<number | null>`SUM(${trades.pnlR})`,
    })
    .from(trades)
    .where(and(...where))
    .groupBy(trades.setupId, trades.killzoneId)
    .all()

  return rows
    .filter((r) => r.killzoneId !== null)
    .map((r) => {
      const n = Number(r.n)
      return {
        setupId: String(r.setupId),
        killzoneId: String(r.killzoneId),
        n,
        expectancyR: n > 0 ? Math.round(Number(r.sumR ?? 0) / n) : 0,
        winRateBps: n > 0 ? Math.round((Number(r.winCount) / n) * 10000) : 0,
      }
    })
}

export function getSetupNames(db: CairnDb): { id: string; name: string }[] {
  return db.select({ id: setupsTable.id, name: setupsTable.name }).from(setupsTable).all()
}

export function getKillzoneNames(db: CairnDb): { id: string; name: string }[] {
  return db.select({ id: kzTable.id, name: kzTable.name }).from(kzTable).all()
}

export function getBySetup(db: CairnDb, filter: AnalyticsFilter): SetupRow[] {
  const where = buildTradeWhereClauses(filter)
  const rows = db
    .select({
      setupId: trades.setupId,
      setupName: setupsTable.name,
      n: sql<number>`COUNT(*)`,
      winCount: sql<number>`SUM(CASE WHEN ${trades.pnlR} > 0 THEN 1 ELSE 0 END)`,
      sumR: sql<number | null>`SUM(${trades.pnlR})`,
      sumRrAchieved: sql<number | null>`SUM(CASE WHEN ${trades.pnlR} > 0 THEN ${trades.pnlR} ELSE 0 END)`,
    })
    .from(trades)
    .innerJoin(setupsTable, eq(trades.setupId, setupsTable.id))
    .where(and(...where))
    .groupBy(trades.setupId, setupsTable.name)
    .all()

  return rows.map((r) => {
    const n = Number(r.n)
    const winCount = Number(r.winCount)
    return {
      setupId: String(r.setupId),
      setupName: String(r.setupName),
      n,
      winRateBps: n > 0 ? Math.round((winCount / n) * 10000) : 0,
      expectancyR: n > 0 ? Math.round(Number(r.sumR ?? 0) / n) : 0,
      avgRrAchievedBps: winCount > 0 ? Math.round(Number(r.sumRrAchieved ?? 0) / winCount) : 0,
    }
  })
}

export function getByDayOfWeek(db: CairnDb, filter: AnalyticsFilter): DayOfWeekRow[] {
  const where = buildTradeWhereClauses(filter)
  const rows = db
    .select({
      dow: sql<string>`strftime('%w', ${trades.updatedAt}/1000, 'unixepoch')`,
      n: sql<number>`COUNT(*)`,
      winCount: sql<number>`SUM(CASE WHEN ${trades.pnlR} > 0 THEN 1 ELSE 0 END)`,
      sumR: sql<number | null>`SUM(${trades.pnlR})`,
    })
    .from(trades)
    .where(and(...where))
    .groupBy(sql`strftime('%w', ${trades.updatedAt}/1000, 'unixepoch')`)
    .all()

  return rows.map((r) => {
    const n = Number(r.n)
    return {
      dow: Number(r.dow),
      n,
      winRateBps: n > 0 ? Math.round((Number(r.winCount) / n) * 10000) : 0,
      expectancyR: n > 0 ? Math.round(Number(r.sumR ?? 0) / n) : 0,
    }
  })
}

function compareByFlag(
  db: CairnDb,
  filter: AnalyticsFilter,
  flagColumn: 'mssConfirmed' | 'dxyAligned' | 'smtConfirmed',
): CompareCard {
  const where = buildTradeWhereClauses(filter)
  const col = trades[flagColumn]
  const rows = db
    .select({
      flag: col,
      n: sql<number>`COUNT(*)`,
      winCount: sql<number>`SUM(CASE WHEN ${trades.pnlR} > 0 THEN 1 ELSE 0 END)`,
      sumR: sql<number | null>`SUM(${trades.pnlR})`,
      sumPnl: sql<number | null>`SUM(${trades.pnlCents})`,
    })
    .from(trades)
    .where(and(...where))
    .groupBy(col)
    .all()

  let withFlag: SubTotals = { n: 0, winRateBps: 0, expectancyR: 0, netPnlCents: 0 }
  let withoutFlag: SubTotals = { n: 0, winRateBps: 0, expectancyR: 0, netPnlCents: 0 }
  for (const r of rows) {
    const val = r.flag === null ? null : Number(r.flag)
    const sub = subTotalsFromRow(r)
    if (val === 1) withFlag = sub
    else if (val === 0) withoutFlag = sub
  }
  return { withFlag, withoutFlag }
}

export function getMssCompare(db: CairnDb, filter: AnalyticsFilter): CompareCard {
  return compareByFlag(db, filter, 'mssConfirmed')
}
export function getDxyCompare(db: CairnDb, filter: AnalyticsFilter): CompareCard {
  return compareByFlag(db, filter, 'dxyAligned')
}
export function getSmtCompare(db: CairnDb, filter: AnalyticsFilter): CompareCard {
  return compareByFlag(db, filter, 'smtConfirmed')
}
