import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import { ipcMain } from 'electron'
import { getDb } from '../db/index'
import { playbooks, trades } from '../db/schema'
import {
  getAdherenceScore,
  getAdherenceTrendWeekly,
  getBlockedCount,
  getCleanVsDirty,
  getRuleBreakImpact,
  getTopRulesBroken,
} from '../services/analytics/adherence'
import {
  getEmotionalBuckets,
  getHourDayHeatmap,
  getNeedBuckets,
  getPostLossBehavior,
  getRecoveryPattern,
  getTradeNumOfDay,
} from '../services/analytics/behavioral'
import {
  getDowSummary,
  getExpectancyWithSpark,
  getProfitFactorR,
  getRDistributionPure,
  getTimeOfDayHeatmap,
} from '../services/analytics/derived'
import { buildTradeWhereClauses } from '../services/analytics/filter'
import {
  getDailyHeatmap,
  getEquityCurve,
  getMaxDrawdownCents,
  getRDistribution,
  getStreaks,
  getTotals,
} from '../services/analytics/performance'
import {
  getAccountLadder,
  getCostAnalysis,
  getDaysToFailureHistogram,
  getFailureCauses,
  getPatternInsights,
  getPhaseTrend,
} from '../services/analytics/phases'
import { getByPlaybook } from '../services/analytics/playbooks'
import { createReview, listReviews } from '../services/analytics/reviews'
import {
  getByDayOfWeek,
  getBySetup,
  getDxyCompare,
  getKillzoneNames,
  getMssCompare,
  getSetupKillzoneMatrix,
  getSetupNames,
  getSmtCompare,
} from '../services/analytics/setups'
import { getConfiguredTimeZone } from '../services/time/trading-day'
import type {
  AccountsPhaseStats,
  AnalyticsFilter,
  BehavioralStats,
  CreateReviewInput,
  DerivedStats,
  IpcResponse,
  PerformanceStats,
  PlaybookStats,
  ReviewSummary,
  RuleAdherenceStats,
  SetupPerformanceStats,
} from '../../shared/types/index'

function err(e: unknown): IpcResponse<never> {
  return { ok: false, error: { code: 'ANALYTICS_ERROR', message: String(e) } }
}

export function registerAnalyticsHandlers(): void {
  ipcMain.handle(
    'analytics:performance',
    async (_e, { filter }: { filter: AnalyticsFilter }): Promise<IpcResponse<PerformanceStats>> => {
      try {
        const db = getDb()
        const equityCurve = getEquityCurve(db, filter)
        const data: PerformanceStats = {
          totals: getTotals(db, filter),
          equityCurve,
          distribution: getRDistribution(db, filter),
          streaks: getStreaks(db, filter),
          dailyHeatmap: getDailyHeatmap(db, filter, getConfiguredTimeZone(db)),
          maxDrawdownCents: getMaxDrawdownCents(equityCurve),
          ddLimitCents: null,
        }
        return { ok: true, data }
      } catch (e) {
        return err(e)
      }
    },
  )

  ipcMain.handle(
    'analytics:adherence',
    async (
      _e,
      { filter }: { filter: AnalyticsFilter },
    ): Promise<IpcResponse<RuleAdherenceStats>> => {
      try {
        const db = getDb()
        const data: RuleAdherenceStats = {
          score: getAdherenceScore(db, filter),
          cleanVsDirty: getCleanVsDirty(db, filter),
          topBroken: getTopRulesBroken(db, filter),
          impactTable: getRuleBreakImpact(db, filter),
          blocked: getBlockedCount(db, filter),
          trendLine: getAdherenceTrendWeekly(db, filter),
        }
        return { ok: true, data }
      } catch (e) {
        return err(e)
      }
    },
  )

  ipcMain.handle(
    'analytics:setups',
    async (
      _e,
      { filter }: { filter: AnalyticsFilter },
    ): Promise<IpcResponse<SetupPerformanceStats>> => {
      try {
        const db = getDb()
        const data: SetupPerformanceStats = {
          matrix: getSetupKillzoneMatrix(db, filter),
          setupNames: getSetupNames(db),
          killzoneNames: getKillzoneNames(db),
          bySetup: getBySetup(db, filter),
          byDay: getByDayOfWeek(db, filter),
          mssCompare: getMssCompare(db, filter),
          dxyCompare: getDxyCompare(db, filter),
          smtCompare: getSmtCompare(db, filter),
        }
        return { ok: true, data }
      } catch (e) {
        return err(e)
      }
    },
  )

  ipcMain.handle(
    'analytics:behavioral',
    async (_e, { filter }: { filter: AnalyticsFilter }): Promise<IpcResponse<BehavioralStats>> => {
      try {
        const db = getDb()
        const data: BehavioralStats = {
          emotionalBuckets: getEmotionalBuckets(db, filter),
          needBuckets: getNeedBuckets(db, filter),
          postLoss: getPostLossBehavior(db, filter),
          tradeNumOfDay: getTradeNumOfDay(db, filter),
          hourDayHeatmap: getHourDayHeatmap(db, filter),
          recovery: getRecoveryPattern(db, filter),
        }
        return { ok: true, data }
      } catch (e) {
        return err(e)
      }
    },
  )

  ipcMain.handle('analytics:phases', async (): Promise<IpcResponse<AccountsPhaseStats>> => {
    try {
      const db = getDb()
      const data: AccountsPhaseStats = {
        ladder: getAccountLadder(db),
        phaseTrend: getPhaseTrend(db),
        cost: getCostAnalysis(db),
        failureCauses: getFailureCauses(db),
        daysToFailure: getDaysToFailureHistogram(db),
        insights: getPatternInsights(db),
      }
      return { ok: true, data }
    } catch (e) {
      return err(e)
    }
  })

  ipcMain.handle(
    'analytics:derived',
    async (_e, { filter }: { filter: AnalyticsFilter }): Promise<IpcResponse<DerivedStats>> => {
      try {
        const db = getDb()
        const tz = getConfiguredTimeZone(db)
        const where = buildTradeWhereClauses(filter)
        where.push(isNotNull(trades.exitTime))

        const rows = db
          .select({
            pnlR: trades.pnlR,
            pnlCents: trades.pnlCents,
            exitTime: trades.exitTime,
          })
          .from(trades)
          .where(and(...where))
          .orderBy(asc(trades.exitTime))
          .all()

        const { expectancyR, spark } = getExpectancyWithSpark(rows)
        const data: DerivedStats = {
          expectancyR,
          expectancySpark: spark,
          profitFactor: getProfitFactorR(rows),
          dowSummary: getDowSummary(rows, tz),
          timeOfDayHeatmap: getTimeOfDayHeatmap(rows, tz),
          rDistribution: getRDistributionPure(rows),
        }
        return { ok: true, data }
      } catch (e) {
        return err(e)
      }
    },
  )

  ipcMain.handle(
    'analytics:listReviews',
    async (
      _e,
      { accountId }: { accountId?: string | null },
    ): Promise<IpcResponse<ReviewSummary[]>> => {
      try {
        return { ok: true, data: listReviews(getDb(), accountId ?? null) }
      } catch (e) {
        return err(e)
      }
    },
  )

  ipcMain.handle(
    'analytics:createReview',
    async (_e, input: CreateReviewInput): Promise<IpcResponse<ReviewSummary>> => {
      try {
        return { ok: true, data: createReview(getDb(), input) }
      } catch (e) {
        return err(e)
      }
    },
  )

  ipcMain.handle(
    'analytics:playbooks',
    (_e, { filter }: { filter: AnalyticsFilter }): IpcResponse<PlaybookStats> => {
      try {
        const db = getDb()
        // Resolve which accounts to pull playbooks from (match the filter scope).
        const accountIds = filter.accountIds === 'all' ? null : filter.accountIds

        const conditions = [isNull(playbooks.deletedAt)]
        if (accountIds && accountIds.length > 0) {
          // If multiple accounts, fetch from all of them.
          if (accountIds.length === 1 && accountIds[0]) {
            conditions.push(eq(playbooks.accountId, accountIds[0]))
          }
          // For multi-account filters we still aggregate across all accounts,
          // so no accountId filter on playbooks (we want the union).
        }

        const playbookRows = db
          .select({
            id: playbooks.id,
            name: playbooks.name,
            pairId: playbooks.pairId,
            setupId: playbooks.setupId,
            killzoneId: playbooks.killzoneId,
          })
          .from(playbooks)
          .where(and(...conditions))
          .orderBy(asc(playbooks.name))
          .all()

        const specs = playbookRows.map((r) => ({
          id: r.id,
          name: r.name,
          pairId: r.pairId ?? null,
          setupId: r.setupId,
          killzoneId: r.killzoneId ?? null,
        }))

        return { ok: true, data: { byPlaybook: getByPlaybook(db, filter, specs) } }
      } catch (e) {
        return err(e)
      }
    },
  )
}
