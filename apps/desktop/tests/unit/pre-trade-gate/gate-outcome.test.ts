// @vitest-environment node
import { readFileSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/sql-js'
import initSqlJs from 'sql.js'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '../../../electron/db/schema'
import { canUsePreTradeGate } from '../../../electron/services/pre-trade-gate/entitlement'
import { maybeApplyGateForFill } from '../../../electron/services/pre-trade-gate/gate-hook'
import {
  GATE_BREACH_RULE_KEY,
  applyGateOutcome,
} from '../../../electron/services/pre-trade-gate/gate-outcome'
import {
  DEFAULT_GATE_CONFIG,
  GATE_SETTING_TOLERANCE_PIPS,
  createBreachAckIntent,
  createCompliantPlan,
  expireStalePlans,
  getGateConfig,
  listPendingPlans,
} from '../../../electron/services/pre-trade-gate/plan-store'
import type { BrokerEvent } from '@cairn/shared-types'
import type { CairnDb } from '../../../electron/db/index'

const MIG_DIR = join(__dirname, '../../../electron/db/migrations')
const ACCOUNT_ID = 'acc-1'
const PAIR_ID = 'pair-1'
const SETUP_ID = 'setup-1'
const FIRM_ID = 'firm-1'
const ENTRY = 10_850

function loadMigrations(): string[] {
  const journal = JSON.parse(readFileSync(join(MIG_DIR, 'meta', '_journal.json'), 'utf-8')) as {
    entries: Array<{ idx: number; tag: string }>
  }
  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((e) => readFileSync(join(MIG_DIR, `${e.tag}.sql`), 'utf-8'))
}

let SQL: Awaited<ReturnType<typeof initSqlJs>>
beforeAll(async () => {
  SQL = await initSqlJs()
})

function makeDb(): CairnDb {
  const sqlite = new SQL.Database()
  for (const migration of loadMigrations()) {
    for (const stmt of migration.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  const db = drizzle(sqlite, { schema }) as unknown as CairnDb
  const now = Date.UTC(2024, 0, 1)
  db.insert(schema.propFirms)
    .values({ id: FIRM_ID, name: 'F', defaultStepCount: 1, createdAt: now, updatedAt: now })
    .run()
  db.insert(schema.accounts)
    .values({
      id: ACCOUNT_ID,
      displayName: 'A',
      propFirmId: FIRM_ID,
      stepCount: 1,
      currentPhase: 1,
      accountSizeCents: 1_000_000,
      leverage: 100,
      dailyDrawdownType: 'percent_of_balance',
      dailyDrawdownValue: 500,
      totalDrawdownType: 'percent_of_balance',
      totalDrawdownValue: 1000,
      drawdownBasis: 'initial_balance',
      profitTargetPct: 1000,
      weekendHoldingAllowed: 0,
      newsTradingAllowed: 1,
      challengeCostCents: 0,
      startDate: now,
      status: 'active',
      peakEquityCents: 1_000_000,
      currentEquityCents: 1_000_000,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(schema.pairs)
    .values({
      id: PAIR_ID,
      symbol: 'EURUSD',
      displayName: 'EUR/USD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 1000,
      active: 1,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(schema.setups)
    .values({
      id: SETUP_ID,
      name: 'OB',
      category: 'ICT',
      color: '#fff',
      active: 1,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return db
}

function insertTrade(
  db: CairnDb,
  id: string,
  overrides: Partial<typeof schema.trades.$inferInsert> = {},
): void {
  const now = Date.UTC(2024, 0, 2)
  db.insert(schema.trades)
    .values({
      id,
      accountId: ACCOUNT_ID,
      pairId: PAIR_ID,
      setupId: SETUP_ID,
      mode: 'live',
      direction: 'long',
      status: 'open',
      entryPrice: ENTRY,
      stopLossPrice: ENTRY - 200,
      takeProfitPrice: ENTRY + 400,
      slPips: 200,
      rrRatio: 200,
      lotSize: 100,
      riskAmountCents: 10000,
      riskPctBps: 100,
      plannedInvalidation: 'below the order block',
      mssConfirmed: 1,
      htfBiasAligned: 1,
      preCalmScore: 8,
      preUrgencyScore: 2,
      preNeedScore: 2,
      isClean: 1,
      rulesBroken: JSON.stringify([]),
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run()
}

const compliantInput = {
  accountId: ACCOUNT_ID,
  pairId: PAIR_ID,
  direction: 'long' as const,
  intendedEntry: ENTRY,
  intendedSl: ENTRY - 200,
  intendedTp: ENTRY + 400,
  slPips: 200,
  rrRatio: 200,
  lotSize: 100,
  riskPctBps: 100,
}

describe('plan store + gate outcome', () => {
  it('binds a compliant plan to a fill and records gate_outcome=clean', () => {
    const db = makeDb()
    createCompliantPlan(db, compliantInput, DEFAULT_GATE_CONFIG.matchWindowMs, 1000)
    insertTrade(db, 't1')

    const outcome = applyGateOutcome(
      db,
      {
        tradeId: 't1',
        accountId: ACCOUNT_ID,
        pairId: PAIR_ID,
        direction: 'long',
        entryPriceTicks: ENTRY,
        eventTimeMs: 2000,
      },
      DEFAULT_GATE_CONFIG.priceTolerancePips,
    )
    expect(outcome).toBe('clean')

    const trade = db.select().from(schema.trades).where(eq(schema.trades.id, 't1')).get()
    expect(trade?.gateOutcome).toBe('clean')
    expect(trade?.isClean).toBe(1)
    // Plan consumed.
    expect(listPendingPlans(db, ACCOUNT_ID, PAIR_ID, 'long')).toHaveLength(0)
  })

  it('binds a breach-ack intent and forces is_clean=0 regardless of P&L', () => {
    const db = makeDb()
    createBreachAckIntent(
      db,
      { accountId: ACCOUNT_ID, pairId: PAIR_ID, direction: 'long' },
      DEFAULT_GATE_CONFIG.matchWindowMs,
      1000,
    )
    insertTrade(db, 't2', { isClean: 1 })

    const outcome = applyGateOutcome(
      db,
      {
        tradeId: 't2',
        accountId: ACCOUNT_ID,
        pairId: PAIR_ID,
        direction: 'long',
        entryPriceTicks: ENTRY + 999, // far off — level ignored for a breach intent
        eventTimeMs: 2000,
      },
      DEFAULT_GATE_CONFIG.priceTolerancePips,
    )
    expect(outcome).toBe('breach_ack')

    const trade = db.select().from(schema.trades).where(eq(schema.trades.id, 't2')).get()
    expect(trade?.gateOutcome).toBe('breach_ack')
    expect(trade?.isClean).toBe(0)
    expect(JSON.parse(trade?.rulesBroken ?? '[]')).toContain(GATE_BREACH_RULE_KEY)
  })

  it('leaves gate_outcome null when no plan matches', () => {
    const db = makeDb()
    insertTrade(db, 't3')
    const outcome = applyGateOutcome(
      db,
      {
        tradeId: 't3',
        accountId: ACCOUNT_ID,
        pairId: PAIR_ID,
        direction: 'long',
        entryPriceTicks: ENTRY,
        eventTimeMs: 2000,
      },
      DEFAULT_GATE_CONFIG.priceTolerancePips,
    )
    expect(outcome).toBeNull()
    const trade = db.select().from(schema.trades).where(eq(schema.trades.id, 't3')).get()
    expect(trade?.gateOutcome).toBeNull()
  })

  it('expires stale pending plans', () => {
    const db = makeDb()
    createCompliantPlan(db, compliantInput, 1000, 1000) // expires at 2000
    expect(expireStalePlans(db, 5000)).toBe(1)
    expect(listPendingPlans(db, ACCOUNT_ID, PAIR_ID, 'long')).toHaveLength(0)
  })

  it('reads gate config from settings with defaults', () => {
    const db = makeDb()
    expect(getGateConfig(db)).toEqual(DEFAULT_GATE_CONFIG)
    db.insert(schema.settings)
      .values({ key: GATE_SETTING_TOLERANCE_PIPS, value: JSON.stringify(12), updatedAt: 0 })
      .run()
    expect(getGateConfig(db).priceTolerancePips).toBe(12)
  })
})

describe('canUsePreTradeGate', () => {
  it('grants pro and trial, denies free', () => {
    expect(canUsePreTradeGate('pro')).toBe(true)
    expect(canUsePreTradeGate('trial')).toBe(true)
    expect(canUsePreTradeGate('free')).toBe(false)
  })
})

describe('maybeApplyGateForFill (ingest hook)', () => {
  // insertTrade stamps createdAt at this instant; the hook uses the trade's time as
  // the fill time, so the plan window must cover it.
  const TRADE_TIME = Date.UTC(2024, 0, 2)

  function openEvent(externalRef: string): BrokerEvent {
    return {
      type: 'position_opened',
      broker: 'mt5',
      brokerAccountId: 'mt5-acc',
      brokerTradeId: externalRef,
      symbol: 'EURUSD',
      direction: 'long',
      volumeLots: 1,
      price: 1.085,
      stopLoss: null,
      takeProfit: null,
      eventTimeMs: TRADE_TIME,
      raw: null,
    }
  }

  it('binds a live open fill to a matching plan (clean)', () => {
    const db = makeDb()
    createCompliantPlan(db, compliantInput, DEFAULT_GATE_CONFIG.matchWindowMs, TRADE_TIME)
    insertTrade(db, 't-hook', { externalRef: 'ref-1' })
    maybeApplyGateForFill(db, openEvent('ref-1'))
    const trade = db.select().from(schema.trades).where(eq(schema.trades.id, 't-hook')).get()
    expect(trade?.gateOutcome).toBe('clean')
  })

  it('is a no-op on a non-open event', () => {
    const db = makeDb()
    createCompliantPlan(db, compliantInput, DEFAULT_GATE_CONFIG.matchWindowMs, TRADE_TIME)
    insertTrade(db, 't-hook', { externalRef: 'ref-1' })
    maybeApplyGateForFill(db, { ...openEvent('ref-1'), type: 'position_closed' })
    const trade = db.select().from(schema.trades).where(eq(schema.trades.id, 't-hook')).get()
    expect(trade?.gateOutcome).toBeNull()
  })

  it('is a no-op when no trade matches the external ref', () => {
    const db = makeDb()
    expect(() => maybeApplyGateForFill(db, openEvent('missing'))).not.toThrow()
  })
})
