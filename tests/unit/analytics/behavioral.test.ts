// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { ensureSqlJs, makeTestDb, seedAnalyticsFixtures, EXPECTED } from './_fixtures'
import {
  getEmotionalBuckets,
  getNeedBuckets,
  getPostLossBehavior,
  getTradeNumOfDay,
  getHourDayHeatmap,
  getRecoveryPattern,
} from '../../../electron/services/analytics/behavioral'
import type { AnalyticsFilter } from '../../../shared/types/index'

beforeAll(ensureSqlJs)

const F: AnalyticsFilter = {
  accountIds: 'all',
  dateFrom: null,
  dateTo: null,
  datePreset: 'all',
  mode: 'all',
  pairIds: [],
  setupIds: [],
  killzoneIds: [],
  cleanOnly: false,
}

describe('behavioral.getEmotionalBuckets', () => {
  it('three-bucket split matches fixture', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const b = getEmotionalBuckets(db, F)
    const map = new Map(b.map((r) => [r.bucket, r]))
    expect(map.get('calm')!.n).toBe(EXPECTED.calmCount)
    expect(map.get('calm')!.winRateBps).toBe(EXPECTED.calmWinRateBps)
    expect(map.get('urgent')!.n).toBe(EXPECTED.urgentCount)
    expect(map.get('urgent')!.winRateBps).toBe(EXPECTED.urgentWinRateBps)
  })

  it('empty on empty', () => {
    const { db } = makeTestDb()
    const b = getEmotionalBuckets(db, F)
    expect(b.every((r) => r.n === 0)).toBe(true)
  })
})

describe('behavioral.getNeedBuckets', () => {
  it('buckets sum to tradeCount', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const b = getNeedBuckets(db, F)
    expect(b.reduce((s, r) => s + r.n, 0)).toBe(EXPECTED.tradeCount)
  })
})

describe('behavioral.getPostLossBehavior', () => {
  it('matches known dataset', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const p = getPostLossBehavior(db, F)
    expect(p.firstAfterLoss.n).toBe(EXPECTED.firstAfterLossCount)
    expect(p.firstAfterLoss.winRateBps).toBe(EXPECTED.firstAfterLossWinRateBps)
    expect(p.secondAfterLoss.n).toBe(EXPECTED.secondAfterLossCount)
    expect(p.revenge.n).toBe(EXPECTED.revengeCount)
  })
})

describe('behavioral.getTradeNumOfDay', () => {
  it('matches known dataset', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const rows = getTradeNumOfDay(db, F)
    const byBucket = new Map(rows.map((r) => [r.bucket, r.n]))
    expect(byBucket.get(1)).toBe(EXPECTED.tradeNum1Count)
    expect(byBucket.get(2)).toBe(EXPECTED.tradeNum2Count)
    expect(byBucket.get(3)).toBe(EXPECTED.tradeNum3PlusCount)
  })
})

describe('behavioral.getHourDayHeatmap', () => {
  it('cells sum to tradeCount', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const cells = getHourDayHeatmap(db, F)
    expect(cells.reduce((s, c) => s + c.n, 0)).toBe(EXPECTED.tradeCount)
  })
})

describe('behavioral.getRecoveryPattern', () => {
  it('counts loss→win transitions', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const p = getRecoveryPattern(db, F)
    // Losses at T2,T4,T6,T9,T11. All next are wins.
    expect(p.recoveryCount).toBe(5)
  })
})
