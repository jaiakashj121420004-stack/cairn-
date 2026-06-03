// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { ensureSqlJs, makeTestDb, seedAnalyticsFixtures, EXPECTED } from './_fixtures'
import {
  getSetupKillzoneMatrix,
  getBySetup,
  getByDayOfWeek,
  getMssCompare,
  getDxyCompare,
  getSmtCompare,
} from '../../../electron/services/analytics/setups'
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

describe('setups.getSetupKillzoneMatrix', () => {
  it('empty on empty', () => {
    const { db } = makeTestDb()
    expect(getSetupKillzoneMatrix(db, F)).toEqual([])
  })

  it('cells sum to tradeCount', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const cells = getSetupKillzoneMatrix(db, F)
    const n = cells.reduce((s, c) => s + c.n, 0)
    expect(n).toBe(EXPECTED.tradeCount)
  })
})

describe('setups.getBySetup', () => {
  it('fvg + ob counts match fixture', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const rows = getBySetup(db, F)
    const byId = new Map(rows.map((r) => [r.setupId, r]))
    const fvg = byId.get(ids.setupId1)
    const ob = byId.get(ids.setupId2)
    if (!fvg || !ob) throw new Error('test: expected fvg and ob setups in result')
    expect(fvg.n).toBe(EXPECTED.fvgTradeCount)
    expect(fvg.winRateBps).toBe(EXPECTED.fvgWinRateBps)
    expect(ob.n).toBe(EXPECTED.obTradeCount)
    expect(ob.winRateBps).toBe(EXPECTED.obWinRateBps)
  })
})

describe('setups.getByDayOfWeek', () => {
  it('row counts sum to tradeCount', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const rows = getByDayOfWeek(db, F)
    const n = rows.reduce((s, r) => s + r.n, 0)
    expect(n).toBe(EXPECTED.tradeCount)
  })
})

describe('setups.compare flags', () => {
  it('mss split matches fixture', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const c = getMssCompare(db, F)
    expect(c.withFlag.n).toBe(EXPECTED.withMssCount)
    expect(c.withoutFlag.n).toBe(EXPECTED.withoutMssCount)
  })
  it('dxy split matches fixture', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const c = getDxyCompare(db, F)
    expect(c.withFlag.n).toBe(EXPECTED.withDxyCount)
    expect(c.withoutFlag.n).toBe(EXPECTED.withoutDxyCount)
  })
  it('smt split matches fixture', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const c = getSmtCompare(db, F)
    expect(c.withFlag.n).toBe(EXPECTED.withSmtCount)
    expect(c.withoutFlag.n).toBe(EXPECTED.withoutSmtCount)
  })
})
