// @vitest-environment node
//
// DB-backed integration tests for detectCloseViolations — the orchestrator that
// feeds the Close Trade modal's pre-ticked checklist. Reuses the rules-engine
// in-memory sql.js harness (migrations 0001–0003 + seed account/pair/setup/
// killzone/session).

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { eq } from 'drizzle-orm'
import { ensureSqlJs, createTestDb, insertAccountRule, schema } from '../unit/rules-engine/_db'
import { detectCloseViolations } from '../../electron/services/rules-engine/close-detection'
import { evaluateModification } from '../../electron/services/rules-engine/engine'
import type { CairnDb } from '../../electron/db/index'

// The seed killzone is London 07:00–10:00 UTC. 14:00 UTC is outside it but lands
// inside the 2026-04-20 New York trading day the harness session is keyed to.
const IN_DAY = Date.UTC(2026, 3, 20, 14, 0)
const OUTSIDE_KZ = Date.UTC(2026, 3, 20, 11, 0) // 11:00 UTC — between London and NY
const INSIDE_KZ = Date.UTC(2026, 3, 20, 8, 30) // 08:30 UTC — inside London

interface TradeOverrides {
  direction?: 'long' | 'short'
  mode?: 'live' | 'sim' | 'backtest'
  stopLossPrice?: number
  takeProfitPrice?: number
  riskAmountCents?: number
  lotSize?: number
  createdAt?: number
  openedAt?: number | null
}

function insertTrade(
  db: CairnDb,
  ids: ReturnType<typeof createTestDb>['ids'],
  id: string,
  o: TradeOverrides = {},
): void {
  const createdAt = o.createdAt ?? INSIDE_KZ
  db.insert(schema.trades)
    .values({
      id,
      accountId: ids.accountId,
      sessionId: ids.sessionId,
      pairId: ids.pairId,
      setupId: ids.setupId,
      killzoneId: ids.killzoneId,
      mode: o.mode ?? 'live',
      direction: o.direction ?? 'long',
      status: 'open',
      entryPrice: 108000,
      stopLossPrice: o.stopLossPrice ?? 107900,
      takeProfitPrice: o.takeProfitPrice ?? 108200,
      slPips: 100,
      rrRatio: 200,
      lotSize: o.lotSize ?? 50,
      riskAmountCents: o.riskAmountCents ?? 10000,
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
      openedAt: o.openedAt === undefined ? createdAt : o.openedAt,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    } as typeof schema.trades.$inferInsert)
    .run()
}

/** Records a modification of `field` to `proposed`, exactly as the real-time
 *  modification gate persists it (contextJson = { field, current, proposed }). */
function recordModification(
  db: CairnDb,
  ids: ReturnType<typeof createTestDb>['ids'],
  tradeId: string,
  ruleKey: string,
  field: string,
  current: number,
  proposed: number,
): void {
  db.insert(schema.ruleViolations)
    .values({
      id: uuidv7(),
      accountId: ids.accountId,
      tradeId,
      ruleKey,
      severity: 'blocking',
      outcome: 'logged_post_hoc',
      contextJson: JSON.stringify({ field, current, proposed }),
      createdAt: Date.UTC(2026, 3, 20, 8, 45),
    })
    .run()
}

describe('detectCloseViolations', () => {
  beforeAll(async () => {
    await ensureSqlJs()
  })

  let bundle: ReturnType<typeof createTestDb>
  beforeEach(() => {
    bundle = createTestDb()
  })

  it('pre-ticks no_sl_widening for a trade whose SL was widened', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'no_sl_widening', {})
    const tradeId = uuidv7()
    insertTrade(db, ids, tradeId, { direction: 'long', stopLossPrice: 107900 })
    // SL moved to 107800 (further from the 108000 entry) — a widen.
    recordModification(db, ids, tradeId, 'no_sl_widening', 'stop_loss_price', 107900, 107800)

    const result = detectCloseViolations(db, tradeId)
    expect(result.map((d) => d.ruleKey)).toContain('no_sl_widening')
    const item = result.find((d) => d.ruleKey === 'no_sl_widening')
    expect(item?.detail).toContain('107800')
  })

  it('does not pre-tick no_sl_widening when the rule is disabled', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'no_sl_widening', {}, 0) // disabled
    const tradeId = uuidv7()
    insertTrade(db, ids, tradeId, { direction: 'long', stopLossPrice: 107900 })
    recordModification(db, ids, tradeId, 'no_sl_widening', 'stop_loss_price', 107900, 107800)

    expect(detectCloseViolations(db, tradeId).map((d) => d.ruleKey)).not.toContain('no_sl_widening')
  })

  it('pre-ticks no_tp_narrowing for a trade whose TP was cut toward entry', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'no_tp_narrowing', {})
    const tradeId = uuidv7()
    insertTrade(db, ids, tradeId, { direction: 'long', takeProfitPrice: 108200 })
    recordModification(db, ids, tradeId, 'no_tp_narrowing', 'take_profit_price', 108200, 108050)

    expect(detectCloseViolations(db, tradeId).map((d) => d.ruleKey)).toContain('no_tp_narrowing')
  })

  it('pre-ticks position_size_matches_plan when risk grew > 10% from a lot increase', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'position_size_matches_plan', { tolerancePct: 5 })
    const tradeId = uuidv7()
    // Planned 50 lots / $100 risk. Actual lot 60 → risk ~ $120 (+20%).
    insertTrade(db, ids, tradeId, { lotSize: 50, riskAmountCents: 10000 })
    recordModification(db, ids, tradeId, 'position_size_matches_plan', 'lot_size', 50, 60)

    expect(detectCloseViolations(db, tradeId).map((d) => d.ruleKey)).toContain(
      'position_size_matches_plan',
    )
  })

  it('pre-ticks require_killzone for a live entry outside every killzone', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'require_killzone', { zoneNames: ['London'] })
    const tradeId = uuidv7()
    insertTrade(db, ids, tradeId, { mode: 'live', createdAt: OUTSIDE_KZ, openedAt: OUTSIDE_KZ })

    expect(detectCloseViolations(db, tradeId).map((d) => d.ruleKey)).toContain('require_killzone')
  })

  it('does not flag killzone for a sim trade (timing rule is live-only)', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'require_killzone', { zoneNames: ['London'] })
    const tradeId = uuidv7()
    insertTrade(db, ids, tradeId, { mode: 'sim', createdAt: OUTSIDE_KZ, openedAt: OUTSIDE_KZ })

    expect(detectCloseViolations(db, tradeId).map((d) => d.ruleKey)).not.toContain('require_killzone')
  })

  it('pre-ticks max_trades_per_day for the trade past the daily cap', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'max_trades_per_day', { maxTrades: 1 })
    const first = uuidv7()
    const second = uuidv7()
    insertTrade(db, ids, first, { createdAt: Date.UTC(2026, 3, 20, 14, 0) })
    insertTrade(db, ids, second, { createdAt: Date.UTC(2026, 3, 20, 15, 0) })

    // The second trade is the 2nd of the day, past a 1/day limit.
    expect(detectCloseViolations(db, second).map((d) => d.ruleKey)).toContain('max_trades_per_day')
    // The first trade is within the limit.
    expect(detectCloseViolations(db, first).map((d) => d.ruleKey)).not.toContain('max_trades_per_day')
  })

  it('pre-ticks max_daily_loss_pct when the breaker had locked the session first', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'max_daily_loss_pct', { maxPct: 500 })
    const tradeId = uuidv7()
    const createdAt = IN_DAY
    insertTrade(db, ids, tradeId, { createdAt, openedAt: createdAt })
    // Lock the session one second before the trade was opened.
    db.update(schema.sessions)
      .set({ lockedAt: createdAt - 1000 })
      .where(eq(schema.sessions.id, ids.sessionId))
      .run()

    expect(detectCloseViolations(db, tradeId).map((d) => d.ruleKey)).toContain('max_daily_loss_pct')
  })

  it('returns an empty list when the trade matched its plan', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'no_sl_widening', {})
    insertAccountRule(db, ids.accountId, 'require_killzone', { zoneNames: ['London'] })
    const tradeId = uuidv7()
    // Live entry inside London, no recorded modifications, no breaker lock.
    insertTrade(db, ids, tradeId, { createdAt: INSIDE_KZ, openedAt: INSIDE_KZ })

    expect(detectCloseViolations(db, tradeId)).toEqual([])
  })

  it('returns an empty list for an unknown trade id', () => {
    const { db } = bundle
    expect(detectCloseViolations(db, 'nope')).toEqual([])
  })

  it('end-to-end: a real-time lot-size modification is recorded and pre-ticked at close', () => {
    const { db, ids } = bundle
    insertAccountRule(db, ids.accountId, 'position_size_matches_plan', { tolerancePct: 5 })
    const tradeId = uuidv7()
    // Planned 50 lots / $100 risk.
    insertTrade(db, ids, tradeId, { lotSize: 50, riskAmountCents: 10000 })

    // Trader sizes up to 80 lots mid-trade and logs it through the modification
    // gate. The engine evaluates it live (no UI mock needed) and records the
    // violation with a { field: 'lot_size', proposed } snapshot.
    evaluateModification(db, ids.accountId, tradeId, {
      field: 'lot_size',
      currentValue: 50,
      newValue: 80,
    })

    const recorded = db
      .select()
      .from(schema.ruleViolations)
      .all()
      .filter((v) => v.tradeId === tradeId)
    expect(recorded.some((v) => JSON.parse(v.contextJson).field === 'lot_size')).toBe(true)

    // At close, the risk-increase detector picks the recorded modification up.
    expect(detectCloseViolations(db, tradeId).map((d) => d.ruleKey)).toContain(
      'position_size_matches_plan',
    )
  })
})
