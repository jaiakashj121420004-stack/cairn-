// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { buildContext } from '../../../electron/services/rules-engine/context-builder'
import { ensureSqlJs, createTestDb, insertAccountRule, schema } from './_db'
import { makeDraft } from './_helpers'

describe('buildContext', () => {
  beforeAll(async () => {
    await ensureSqlJs()
  })

  let bundle: ReturnType<typeof createTestDb>
  beforeEach(() => {
    bundle = createTestDb()
  })

  it('throws when account does not exist', () => {
    const { db } = bundle
    expect(() => buildContext(db, 'nope')).toThrow(/Account not found/)
  })

  it('assembles all expected fields with defaults', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'min_rr_ratio', { minRR: 200 })
    const now = Date.UTC(2026, 3, 20, 8, 30)
    const ctx = buildContext(db, ids.accountId, { now })
    expect(ctx.account.id).toBe(ids.accountId)
    expect(ctx.accountRules.length).toBe(1)
    expect(ctx.accountRules[0]?.ruleKey).toBe('min_rr_ratio')
    expect(ctx.now).toBe(now)
    expect(ctx.tradesToday).toEqual([])
    expect(ctx.recentTrades).toEqual([])
    expect(ctx.activeCooldowns).toEqual([])
    expect(ctx.killzones.length).toBeGreaterThan(0)
    expect(ctx.tradeInProgress).toBeUndefined()
    expect(ctx.tradeUnderModification).toBeUndefined()
  })

  it('forwards draft, modification, and tradeUnderModification', () => {
    const { db, ids } = bundle
    const tradeId = uuidv7()
    db.insert(schema.trades)
      .values({
        id: tradeId,
        accountId: ids.accountId,
        sessionId: ids.sessionId,
        pairId: ids.pairId,
        setupId: ids.setupId,
        killzoneId: ids.killzoneId,
        mode: 'live',
        direction: 'long',
        status: 'open',
        entryPrice: 108000,
        stopLossPrice: 107900,
        takeProfitPrice: 108200,
        slPips: 100,
        rrRatio: 200,
        lotSize: 50,
        riskAmountCents: 10000,
        riskPctBps: 100,
        plannedInvalidation: 'x',
        mssConfirmed: 1,
        htfBiasAligned: 1,
        dxyAligned: 1,
        smtConfirmed: null,
        correlatedPairUsed: null,
        preCalmScore: 8,
        preUrgencyScore: 3,
        preNeedScore: 2,
        createdAt: Date.UTC(2026, 3, 20, 8, 0),
        updatedAt: Date.UTC(2026, 3, 20, 8, 0),
        deletedAt: null,
      } as typeof schema.trades.$inferInsert)
      .run()

    const ctx = buildContext(db, ids.accountId, {
      now: Date.UTC(2026, 3, 20, 9, 0),
      draft: {
        ...makeDraft(),
        accountId: ids.accountId,
        pairId: ids.pairId,
        setupId: ids.setupId,
        killzoneId: ids.killzoneId,
        sessionId: ids.sessionId,
      },
      modification: { field: 'lot_size', currentValue: 50, newValue: 100 },
      tradeUnderModificationId: tradeId,
    })
    expect(ctx.tradeInProgress).toBeDefined()
    expect(ctx.tradeModification?.field).toBe('lot_size')
    expect(ctx.tradeUnderModification?.id).toBe(tradeId)
    expect(ctx.tradesToday.length).toBe(1)
  })

  it('filters tradesToday by the configured-timezone day window and excludes soft-deleted', () => {
    const { db, ids } = bundle
    const dayStart = Date.UTC(2026, 3, 20, 0, 0)
    // Trade from yesterday
    db.insert(schema.trades)
      .values({
        id: uuidv7(),
        accountId: ids.accountId,
        sessionId: ids.sessionId,
        pairId: ids.pairId,
        setupId: ids.setupId,
        killzoneId: ids.killzoneId,
        mode: 'live',
        direction: 'long',
        status: 'closed',
        entryPrice: 1,
        stopLossPrice: 1,
        takeProfitPrice: 1,
        slPips: 1,
        rrRatio: 100,
        lotSize: 1,
        riskAmountCents: 0,
        riskPctBps: 0,
        plannedInvalidation: 'x',
        mssConfirmed: 1,
        htfBiasAligned: 1,
        dxyAligned: null,
        smtConfirmed: null,
        correlatedPairUsed: null,
        preCalmScore: 5,
        preUrgencyScore: 5,
        preNeedScore: 5,
        createdAt: dayStart - 60_000,
        updatedAt: dayStart - 60_000,
        deletedAt: null,
      } as typeof schema.trades.$inferInsert)
      .run()
    // Trade today, soft-deleted
    db.insert(schema.trades)
      .values({
        id: uuidv7(),
        accountId: ids.accountId,
        sessionId: ids.sessionId,
        pairId: ids.pairId,
        setupId: ids.setupId,
        killzoneId: ids.killzoneId,
        mode: 'live',
        direction: 'long',
        status: 'closed',
        entryPrice: 1,
        stopLossPrice: 1,
        takeProfitPrice: 1,
        slPips: 1,
        rrRatio: 100,
        lotSize: 1,
        riskAmountCents: 0,
        riskPctBps: 0,
        plannedInvalidation: 'x',
        mssConfirmed: 1,
        htfBiasAligned: 1,
        dxyAligned: null,
        smtConfirmed: null,
        correlatedPairUsed: null,
        preCalmScore: 5,
        preUrgencyScore: 5,
        preNeedScore: 5,
        createdAt: dayStart + 1000,
        updatedAt: dayStart + 1000,
        deletedAt: dayStart + 2000,
      } as typeof schema.trades.$inferInsert)
      .run()

    const ctx = buildContext(db, ids.accountId, { now: dayStart + 8 * 60 * 60_000 })
    expect(ctx.tradesToday.length).toBe(0)
  })

  it('buckets tradesToday by the New York day, including a trade already "tomorrow" in UTC', () => {
    const { db, ids } = bundle
    // Apr 21 02:00 UTC == Apr 20 22:00 America/New_York (EDT). A UTC-based
    // window would file this under the 21st and drop it from the 20th; the
    // timezone-aware window keeps it on the (local) 20th.
    const ts = Date.UTC(2026, 3, 21, 2, 0)
    db.insert(schema.trades)
      .values({
        id: uuidv7(),
        accountId: ids.accountId,
        sessionId: ids.sessionId,
        pairId: ids.pairId,
        setupId: ids.setupId,
        killzoneId: ids.killzoneId,
        mode: 'live',
        direction: 'long',
        status: 'closed',
        entryPrice: 1,
        stopLossPrice: 1,
        takeProfitPrice: 1,
        slPips: 1,
        rrRatio: 100,
        lotSize: 1,
        riskAmountCents: 0,
        riskPctBps: 0,
        plannedInvalidation: 'x',
        mssConfirmed: 1,
        htfBiasAligned: 1,
        dxyAligned: null,
        smtConfirmed: null,
        correlatedPairUsed: null,
        preCalmScore: 5,
        preUrgencyScore: 5,
        preNeedScore: 5,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      } as typeof schema.trades.$inferInsert)
      .run()

    const ctx = buildContext(db, ids.accountId, { now: ts })
    expect(ctx.timeZone).toBe('America/New_York')
    expect(ctx.tradesToday.length).toBe(1)
  })

  it('loads currentSession when one exists for today', () => {
    const { db, ids } = bundle
    const ctx = buildContext(db, ids.accountId, { now: Date.UTC(2026, 3, 20, 12, 0) })
    expect(ctx.currentSession).not.toBeNull()
    expect(ctx.currentSession?.sessionDate).toBe('2026-04-20')
  })
})
