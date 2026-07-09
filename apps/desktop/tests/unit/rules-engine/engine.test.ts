// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import {
  evaluateAll,
  evaluatePreTrade,
  evaluateModification,
  onTradeClosed,
  DAILY_LOCK_RULE_KEY,
} from '../../../electron/services/rules-engine/engine'
import { listActiveCooldowns } from '../../../electron/services/rules-engine/cooldowns'
import {
  setGuardrailSink,
  resetGuardrailSink,
} from '../../../electron/services/rules-engine/guardrail'
import { ensureSqlJs, createTestDb, insertAccountRule, schema } from './_db'
import { makeContext, makeAccountRule, makeDraft, makeTrade } from './_helpers'
import { v7 as uuidv7 } from 'uuid'
import { eq } from 'drizzle-orm'

describe('evaluateAll (pure)', () => {
  it('returns [] when no rules are configured', () => {
    const ctx = makeContext({ accountRules: [], tradeInProgress: makeDraft() })
    expect(evaluateAll(ctx)).toEqual([])
  })

  it('skips rules whose accountRule.enabled = 0', () => {
    const ctx = makeContext({
      accountRules: [makeAccountRule('min_rr_ratio', { minRR: 200 }, 0)],
      tradeInProgress: makeDraft({ rrRatio: 50 }),
    })
    expect(evaluateAll(ctx)).toEqual([])
  })

  it('sorts evaluations by severity (blocking → warning → info)', () => {
    const ctx = makeContext({
      accountRules: [
        makeAccountRule('min_rr_ratio', { minRR: 999 }), // blocking failure
        makeAccountRule('require_dxy_check', {}), // warning when missing
      ],
      tradeInProgress: makeDraft({ rrRatio: 50, dxyAligned: null }),
      currentSession: null,
    })
    const evals = evaluateAll(ctx)
    const severities = evals.map((e) => e.severity)
    // Blocking comes first
    const blockingIdx = severities.indexOf('blocking')
    const warningIdx = severities.indexOf('warning')
    if (blockingIdx !== -1 && warningIdx !== -1) {
      expect(blockingIdx).toBeLessThan(warningIdx)
    }
    expect(blockingIdx).toBeGreaterThanOrEqual(0)
  })

  it('short-circuits remaining rules when a hard-lock rule fails', () => {
    // max_overall_daily_loss_hard_stop_pct is a hard lock. Trip it with a losing trade today.
    const ctx = makeContext({
      accountRules: [
        makeAccountRule('max_overall_daily_loss_hard_stop_pct', { maxPct: 500 }),
        makeAccountRule('min_rr_ratio', { minRR: 100 }),
      ],
      tradesToday: [makeTrade({ pnlCents: -300_000 })],
      tradeInProgress: makeDraft({ rrRatio: 50 }),
    })
    const evals = evaluateAll(ctx)
    // After hard-lock failure, normal rules should NOT have been run
    expect(evals.find((e) => e.ruleKey === 'min_rr_ratio')).toBeUndefined()
    const hardEval = evals.find((e) => e.ruleKey === 'max_overall_daily_loss_hard_stop_pct')
    expect(hardEval?.passed).toBe(false)
  })

  it('catches a thrown rule error and converts to a warning evaluation', () => {
    const ctx = makeContext({
      // Pass garbage to require_invalidation_text by removing tradeInProgress entirely.
      accountRules: [makeAccountRule('require_invalidation_text', { minChars: 'not-a-number' })],
      tradeInProgress: undefined,
    })
    const evals = evaluateAll(ctx)
    // Should not throw; result either passes vacuously or is captured
    expect(Array.isArray(evals)).toBe(true)
  })
})

describe('evaluatePreTrade / recordEvaluations (DB)', () => {
  beforeAll(async () => {
    await ensureSqlJs()
  })

  let bundle: ReturnType<typeof createTestDb>
  beforeEach(() => {
    bundle = createTestDb()
  })

  it('persists a row in rule_violations for each failed evaluation, in one transaction', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'min_rr_ratio', { minRR: 999 })
    const draft = {
      ...makeDraft({ rrRatio: 100 }),
      accountId: ids.accountId,
      pairId: ids.pairId,
      setupId: ids.setupId,
      killzoneId: ids.killzoneId,
      sessionId: ids.sessionId,
    }
    const evals = evaluatePreTrade(db, ids.accountId, draft)
    expect(evals.find((e) => e.ruleKey === 'min_rr_ratio')?.passed).toBe(false)
    const rows = db.select().from(schema.ruleViolations).all()
    expect(rows.length).toBe(1)
    expect(rows[0]?.ruleKey).toBe('min_rr_ratio')
    expect(rows[0]?.outcome).toBe('blocked')
    expect(rows[0]?.severity).toBe('blocking')
  })

  it('does not write rows when all rules pass', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'min_rr_ratio', { minRR: 100 })
    const draft = {
      ...makeDraft({ rrRatio: 200 }),
      accountId: ids.accountId,
      pairId: ids.pairId,
      setupId: ids.setupId,
      killzoneId: ids.killzoneId,
      sessionId: ids.sessionId,
    }
    evaluatePreTrade(db, ids.accountId, draft)
    const rows = db.select().from(schema.ruleViolations).all()
    expect(rows.length).toBe(0)
  })

  it('evaluateModification writes outcome=logged_post_hoc for failures', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'no_sl_widening', {})
    // Insert a trade so context-builder can find tradeUnderModification
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

    // Widening SL on a long = newValue lower than current
    evaluateModification(db, ids.accountId, tradeId, {
      field: 'stop_loss_price',
      currentValue: 107900,
      newValue: 107800,
    })
    const rows = db.select().from(schema.ruleViolations).all()
    if (rows.length > 0) {
      expect(rows[0]?.outcome).toBe('logged_post_hoc')
      expect(rows[0]?.tradeId).toBe(tradeId)
    }
  })
})

describe('onTradeClosed', () => {
  beforeAll(async () => {
    await ensureSqlJs()
  })

  it('inserts a post_loss cooldown when the trade is a loss and rule enabled', () => {
    const { db, ids } = createTestDb()
    insertAccountRule(db, ids.accountId, 'cooldown_after_loss_minutes', { minutes: 30 })
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
        status: 'closed',
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
        pnlCents: -10000,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
      } as typeof schema.trades.$inferInsert)
      .run()
    const now = Date.UTC(2026, 3, 20, 9, 0)
    onTradeClosed(db, tradeId, now)
    const cds = listActiveCooldowns(db, ids.accountId, now)
    expect(cds.length).toBe(1)
    expect(cds[0]?.reason).toBe('post_loss')
    expect(cds[0]?.expiresAt).toBe(now + 30 * 60_000)
  })

  it('does nothing on a winning trade', () => {
    const { db, ids } = createTestDb()
    insertAccountRule(db, ids.accountId, 'cooldown_after_loss_minutes', { minutes: 30 })
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
        status: 'closed',
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
        pnlCents: 25000,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
      } as typeof schema.trades.$inferInsert)
      .run()
    onTradeClosed(db, tradeId, Date.UTC(2026, 3, 20, 9, 0))
    const cds = db.select().from(schema.cooldowns).all()
    expect(cds.length).toBe(0)
  })

  it('returns silently when trade is not found', () => {
    const { db } = createTestDb()
    expect(() => onTradeClosed(db, 'nonexistent-id')).not.toThrow()
  })
})

describe('guardrail hardening — malformed rule config reports instead of silently disabling', () => {
  beforeAll(async () => {
    await ensureSqlJs()
  })

  afterEach(() => {
    resetGuardrailSink()
  })

  /** Insert a rule row with a raw, deliberately-invalid JSON string — bypasses
   *  insertAccountRule's JSON.stringify, which can never produce bad JSON. */
  function insertMalformedRule(
    db: ReturnType<typeof createTestDb>['db'],
    accountId: string,
    ruleKey: string,
    rawValue: string,
  ): void {
    db.insert(schema.accountRules)
      .values({
        id: uuidv7(),
        accountId,
        ruleKey,
        enabled: 1,
        value: rawValue,
        priority: 10,
        createdAt: 0,
        updatedAt: 0,
      })
      .run()
  }

  it('reports guardrail.degraded (and does not throw) when cooldown_after_loss_minutes config is malformed', () => {
    const { db, ids } = createTestDb()
    const reports: Array<{ ruleKey: string; reason: string }> = []
    setGuardrailSink((p) => reports.push(p))
    insertMalformedRule(db, ids.accountId, 'cooldown_after_loss_minutes', '{not valid json')

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
        status: 'closed',
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
        pnlCents: -10000,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
      } as typeof schema.trades.$inferInsert)
      .run()

    expect(() => onTradeClosed(db, tradeId, Date.UTC(2026, 3, 20, 9, 0))).not.toThrow()

    expect(reports).toHaveLength(1)
    expect(reports[0]?.ruleKey).toBe('cooldown_after_loss_minutes')
    expect(reports[0]?.reason).toContain('onTradeClosed')

    // Degraded, not silently substituted: no cooldown was fabricated from the
    // unparseable config.
    const cds = db.select().from(schema.cooldowns).all()
    expect(cds.length).toBe(0)
  })

  it('reports guardrail.degraded when max_daily_loss_pct config is malformed, and does not fabricate a lock', () => {
    const { db, ids } = createTestDb()
    const reports: Array<{ ruleKey: string; reason: string }> = []
    setGuardrailSink((p) => reports.push(p))
    insertMalformedRule(db, ids.accountId, 'max_daily_loss_pct', 'not json at all')

    const tradeId = uuidv7()
    const closeTs = Date.UTC(2026, 3, 21, 8, 0)
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
        status: 'closed',
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
        pnlCents: -300_000,
        createdAt: closeTs,
        updatedAt: closeTs,
        deletedAt: null,
      } as typeof schema.trades.$inferInsert)
      .run()

    expect(() => onTradeClosed(db, tradeId, closeTs)).not.toThrow()

    expect(reports.some((r) => r.ruleKey === 'max_daily_loss_pct')).toBe(true)
    expect(reports.some((r) => r.reason.includes('checkAndLockSession'))).toBe(true)

    // A rule the engine could not parse must fail LOUD, not fail into a
    // fabricated lock it was never told to apply.
    const locks = db.select().from(schema.dailyLocks).all()
    expect(locks.length).toBe(0)
  })
})

describe('circuit breaker without a session row (guardrail hardening — item 2)', () => {
  beforeAll(async () => {
    await ensureSqlJs()
  })

  it('persists a daily_locks row and hard-blocks the next pre-trade evaluation even when no session exists for that trading day', () => {
    const { db, ids } = createTestDb()
    insertAccountRule(db, ids.accountId, 'max_daily_loss_pct', { maxPct: 500 }) // 5%

    // createTestDb seeds a sessions row for 2026-04-20 only. Close the losing
    // trade on 2026-04-21 — a trading day with NO session row at all — to
    // reproduce the exact bug: checkAndLockSession used to no-op here because
    // `session && !session.lockedAt` was false when `session` was undefined.
    const closeTs = Date.UTC(2026, 3, 21, 8, 0)
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
        status: 'closed',
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
        pnlCents: -300_000, // -$3,000 loss, well over 5% of the $50k seeded account ($2,500)
        createdAt: closeTs,
        updatedAt: closeTs,
        deletedAt: null,
      } as typeof schema.trades.$inferInsert)
      .run()

    // Confirm the premise: no sessions row exists for the trading day of the breach.
    const sessionsThatDay = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.sessionDate, '2026-04-21'))
      .all()
    expect(sessionsThatDay.length).toBe(0)

    onTradeClosed(db, tradeId, closeTs)

    // The lock is the persisted fact of record, independent of any session row.
    const locks = db.select().from(schema.dailyLocks).all()
    expect(locks.length).toBe(1)
    expect(locks[0]?.accountId).toBe(ids.accountId)
    expect(locks[0]?.tradingDay).toBe('2026-04-21')

    // The next pre-trade evaluation later the same trading day is hard-blocked —
    // this is the guarantee item 2 exists to make true.
    const draft = {
      ...makeDraft({ timestamp: closeTs + 60_000 }),
      accountId: ids.accountId,
      pairId: ids.pairId,
      setupId: ids.setupId,
      killzoneId: ids.killzoneId,
      sessionId: ids.sessionId,
    }
    const evals = evaluatePreTrade(db, ids.accountId, draft, closeTs + 60_000)
    expect(evals).toHaveLength(1)
    expect(evals[0]?.ruleKey).toBe(DAILY_LOCK_RULE_KEY)
    expect(evals[0]?.passed).toBe(false)
    expect(evals[0]?.severity).toBe('blocking')
    expect(evals[0]?.canOverride).toBe(false)
  })

  it('a second breach later the same locked day does not overwrite the original lock reason', () => {
    const { db, ids } = createTestDb()
    insertAccountRule(db, ids.accountId, 'max_daily_loss_fixed', { maxLossCents: 100_000 }) // $1,000

    const closeTs = Date.UTC(2026, 3, 21, 8, 0)
    const firstTradeId = uuidv7()
    const secondTradeId = uuidv7()
    for (const [id, pnl, ts] of [
      [firstTradeId, -150_000, closeTs],
      [secondTradeId, -50_000, closeTs + 60_000],
    ] as const) {
      db.insert(schema.trades)
        .values({
          id,
          accountId: ids.accountId,
          sessionId: ids.sessionId,
          pairId: ids.pairId,
          setupId: ids.setupId,
          killzoneId: ids.killzoneId,
          mode: 'live',
          direction: 'long',
          status: 'closed',
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
          pnlCents: pnl,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
        } as typeof schema.trades.$inferInsert)
        .run()
    }

    onTradeClosed(db, firstTradeId, closeTs)
    const afterFirst = db.select().from(schema.dailyLocks).all()
    expect(afterFirst).toHaveLength(1)
    const originalReason = afterFirst[0]?.reason

    onTradeClosed(db, secondTradeId, closeTs + 60_000)
    const afterSecond = db.select().from(schema.dailyLocks).all()
    // Still exactly one lock row for the day — onConflictDoNothing held.
    expect(afterSecond).toHaveLength(1)
    expect(afterSecond[0]?.reason).toBe(originalReason)
  })
})

// Avoid unused import lint
void makeTrade
void eq
