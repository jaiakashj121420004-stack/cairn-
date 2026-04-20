import { ipcMain } from 'electron'
import { db } from '../db/index'
import { trades, accounts, pairs, setups } from '../db/schema'
import { eq, and, gte, isNull, desc, sql } from 'drizzle-orm'
import type { IpcResponse, DashboardStats, RecentTradeItem, WeekDayStats } from '../../shared/types/index'

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function mondayUtc(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff))
  return monday.toISOString().slice(0, 10)
}

function startOfDayUtcMs(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00.000Z').getTime()
}

export function registerDashboardHandlers(): void {
  ipcMain.handle(
    'dashboard:getStats',
    async (_e, { accountId }: { accountId: string }): Promise<IpcResponse<DashboardStats>> => {
      try {
        const account = db
          .select()
          .from(accounts)
          .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)))
          .get()

        if (!account) {
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Account not found' } }
        }

        const today = todayUtc()
        const monday = mondayUtc()
        const todayMs = startOfDayUtcMs(today)
        const tomorrowMs = todayMs + 86400000
        const mondayMs = startOfDayUtcMs(monday)

        // Last 20 closed trades for discipline score
        const last20 = db
          .select({
            id: trades.id,
            isClean: trades.isClean,
            rulesBroken: trades.rulesBroken,
            pnlCents: trades.pnlCents,
            pnlR: trades.pnlR,
            slPips: trades.slPips,
          })
          .from(trades)
          .where(
            and(
              eq(trades.accountId, accountId),
              eq(trades.status, 'closed'),
              isNull(trades.deletedAt),
            ),
          )
          .orderBy(desc(trades.updatedAt))
          .limit(20)
          .all()

        const disciplineWindow = last20.length
        const cleanCount = last20.filter((t) => t.isClean === 1).length
        const disciplineScore =
          disciplineWindow > 0 ? Math.round((cleanCount / disciplineWindow) * 100) : 100

        // Rule breakdown from last 20
        const ruleBreakMap = new Map<string, number>()
        for (const t of last20) {
          if (!t.rulesBroken) continue
          let keys: string[]
          try {
            keys = JSON.parse(t.rulesBroken) as string[]
          } catch {
            continue
          }
          for (const k of keys) {
            ruleBreakMap.set(k, (ruleBreakMap.get(k) ?? 0) + 1)
          }
        }
        const ruleBreakdown = Array.from(ruleBreakMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([ruleKey, count]) => ({ ruleKey, count }))

        // Rolling expectancy over last 20 closed
        const closedWithPnl = last20.filter((t) => t.pnlR !== null)
        const rollingExpectancy =
          closedWithPnl.length > 0
            ? Math.round(closedWithPnl.reduce((s, t) => s + (t.pnlR ?? 0), 0) / closedWithPnl.length)
            : 0

        // Sparkline: last 10 expectancy data points (rolling avg over moving window)
        const expectancySpark: number[] = []
        for (let i = Math.max(0, last20.length - 10); i < last20.length; i++) {
          const slice = last20.slice(Math.max(0, i - 4), i + 1).filter((t) => t.pnlR !== null)
          expectancySpark.push(
            slice.length > 0
              ? Math.round(slice.reduce((s, t) => s + (t.pnlR ?? 0), 0) / slice.length)
              : 0,
          )
        }

        // Today stats
        const todayTrades = db
          .select({
            id: trades.id,
            status: trades.status,
            pnlCents: trades.pnlCents,
            rulesBroken: trades.rulesBroken,
          })
          .from(trades)
          .where(
            and(
              eq(trades.accountId, accountId),
              isNull(trades.deletedAt),
              gte(trades.createdAt, todayMs),
              sql`${trades.createdAt} < ${tomorrowMs}`,
            ),
          )
          .all()

        const todayTradeCount = todayTrades.length
        const todayClosedCount = todayTrades.filter((t) => t.status === 'closed').length
        const todayPnlCents = todayTrades
          .filter((t) => t.status === 'closed')
          .reduce((s, t) => s + (t.pnlCents ?? 0), 0)
        const todayRulesBrokenCount = todayTrades.reduce((s, t) => {
          if (!t.rulesBroken) return s
          try {
            return s + (JSON.parse(t.rulesBroken) as string[]).length
          } catch {
            return s
          }
        }, 0)

        // Recent 10 trades (joined with pairs + setups)
        const recentRows = db
          .select({
            id: trades.id,
            pairId: trades.pairId,
            setupId: trades.setupId,
            direction: trades.direction,
            status: trades.status,
            rrRatio: trades.rrRatio,
            pnlCents: trades.pnlCents,
            pnlR: trades.pnlR,
            isClean: trades.isClean,
            createdAt: trades.createdAt,
          })
          .from(trades)
          .where(and(eq(trades.accountId, accountId), isNull(trades.deletedAt)))
          .orderBy(desc(trades.createdAt))
          .limit(10)
          .all()

        // Fetch pair/setup names in bulk
        const pairIds = [...new Set(recentRows.map((r) => r.pairId))]
        const setupIds = [...new Set(recentRows.map((r) => r.setupId))]

        const pairRows =
          pairIds.length > 0
            ? db.select({ id: pairs.id, symbol: pairs.symbol }).from(pairs).all()
                .filter((p) => pairIds.includes(p.id))
            : []
        const setupRows =
          setupIds.length > 0
            ? db.select({ id: setups.id, name: setups.name }).from(setups).all()
                .filter((s) => setupIds.includes(s.id))
            : []

        const pairMap = new Map(pairRows.map((p) => [p.id, p.symbol]))
        const setupMap = new Map(setupRows.map((s) => [s.id, s.name]))

        const recentTrades: RecentTradeItem[] = recentRows.map((r) => ({
          id: r.id,
          pairSymbol: pairMap.get(r.pairId) ?? r.pairId,
          setupName: setupMap.get(r.setupId) ?? r.setupId,
          direction: r.direction as 'long' | 'short',
          status: r.status as 'planned' | 'open' | 'closed' | 'cancelled',
          rrRatio: r.rrRatio,
          pnlCents: r.pnlCents ?? null,
          pnlR: r.pnlR ?? null,
          isClean: r.isClean ?? null,
          createdAt: r.createdAt,
        }))

        // Week adherence (Mon–today)
        const weekClosed = db
          .select({
            isClean: trades.isClean,
            updatedAt: trades.updatedAt,
          })
          .from(trades)
          .where(
            and(
              eq(trades.accountId, accountId),
              eq(trades.status, 'closed'),
              isNull(trades.deletedAt),
              gte(trades.updatedAt, mondayMs),
            ),
          )
          .all()

        const dayMap = new Map<string, { total: number; clean: number }>()
        for (const t of weekClosed) {
          const d = new Date(t.updatedAt).toISOString().slice(0, 10)
          const cur = dayMap.get(d) ?? { total: 0, clean: 0 }
          cur.total++
          if (t.isClean === 1) cur.clean++
          dayMap.set(d, cur)
        }

        const weekAdherence: WeekDayStats[] = []
        const mondayDate = new Date(mondayMs)
        for (let i = 0; i < 7; i++) {
          const d = new Date(mondayDate)
          d.setUTCDate(mondayDate.getUTCDate() + i)
          const dateStr = d.toISOString().slice(0, 10)
          if (dateStr > today) break
          const stats = dayMap.get(dateStr)
          weekAdherence.push({
            date: dateStr,
            tradeCount: stats?.total ?? 0,
            cleanCount: stats?.clean ?? 0,
            adherencePct: stats ? Math.round((stats.clean / stats.total) * 100) : -1,
          })
        }

        // DD used
        let ddUsedBps = 0
        if (account.totalDrawdownType === 'percent') {
          const limitCents = Math.round((account.accountSizeCents * account.totalDrawdownValue) / 10000)
          const ddCents = account.peakEquityCents - account.currentEquityCents
          ddUsedBps =
            limitCents > 0 ? Math.round((ddCents / limitCents) * 10000) : 0
        } else {
          const ddCents = account.peakEquityCents - account.currentEquityCents
          ddUsedBps =
            account.totalDrawdownValue > 0
              ? Math.round((ddCents / account.totalDrawdownValue) * 10000)
              : 0
        }
        ddUsedBps = Math.max(0, ddUsedBps)

        // Total P&L
        const totalPnlRes = db
          .select({ total: sql<number>`COALESCE(SUM(${trades.pnlCents}), 0)` })
          .from(trades)
          .where(
            and(
              eq(trades.accountId, accountId),
              eq(trades.status, 'closed'),
              isNull(trades.deletedAt),
            ),
          )
          .get()
        const totalPnlCents = totalPnlRes?.total ?? 0

        const result: DashboardStats = {
          disciplineScore,
          disciplineWindow,
          ruleBreakdown,
          rollingExpectancy,
          expectancySpark,
          todayTradeCount,
          todayClosedCount,
          todayPnlCents,
          todayRulesBrokenCount,
          account: {
            id: account.id,
            displayName: account.displayName,
            currentEquityCents: account.currentEquityCents,
            accountSizeCents: account.accountSizeCents,
            peakEquityCents: account.peakEquityCents,
            dailyDrawdownType: account.dailyDrawdownType,
            dailyDrawdownValue: account.dailyDrawdownValue,
            totalDrawdownType: account.totalDrawdownType,
            totalDrawdownValue: account.totalDrawdownValue,
            profitTargetPct: account.profitTargetPct,
            currentPhase: account.currentPhase,
            stepCount: account.stepCount,
            status: account.status,
          },
          recentTrades,
          weekAdherence,
          ddUsedBps,
          totalPnlCents,
        }

        return { ok: true, data: result }
      } catch (err) {
        return {
          ok: false,
          error: { code: 'DASHBOARD_ERROR', message: String(err) },
        }
      }
    },
  )
}
