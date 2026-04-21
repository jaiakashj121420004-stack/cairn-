import { ipcMain } from 'electron'
import { getDb } from '../db/index'
import type {
  AccountsPhaseStats,
  AnalyticsFilter,
  BehavioralStats,
  CreateReviewInput,
  IpcResponse,
  PerformanceStats,
  ReviewSummary,
  RuleAdherenceStats,
  SetupPerformanceStats,
} from '../../shared/types/index'
import {
  getDailyHeatmap,
  getEquityCurve,
  getMaxDrawdownCents,
  getRDistribution,
  getStreaks,
  getTotals,
} from '../services/analytics/performance'
import {
  getAdherenceScore,
  getAdherenceTrendWeekly,
  getBlockedCount,
  getCleanVsDirty,
  getRuleBreakImpact,
  getTopRulesBroken,
} from '../services/analytics/adherence'
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
import {
  getEmotionalBuckets,
  getHourDayHeatmap,
  getNeedBuckets,
  getPostLossBehavior,
  getRecoveryPattern,
  getTradeNumOfDay,
} from '../services/analytics/behavioral'
import {
  getAccountLadder,
  getCostAnalysis,
  getDaysToFailureHistogram,
  getFailureCauses,
  getPatternInsights,
  getPhaseTrend,
} from '../services/analytics/phases'
import { createReview, listReviews } from '../services/analytics/reviews'

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
          dailyHeatmap: getDailyHeatmap(db, filter),
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

  ipcMain.handle(
    'analytics:phases',
    async (): Promise<IpcResponse<AccountsPhaseStats>> => {
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
    },
  )

  ipcMain.handle(
    'analytics:listReviews',
    async (_e, { accountId }: { accountId?: string | null }): Promise<IpcResponse<ReviewSummary[]>> => {
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
}
