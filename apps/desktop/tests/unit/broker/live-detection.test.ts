// @vitest-environment node
//
// Live broker detection (Wave 4 — docs/broker-integration.md §5).
//
// Prevention in real time: on each position_opened / position_modified, the
// live position is fed to the SAME rule engine and a non-blocking, mentor-voice
// warning is raised (recorded as a `rule_violations` row, outcome
// `detected_live`) the instant a planned-vs-actual divergence breaches a rule.
//
// These tests drive recorded BrokerEvent sequences through the ingest service —
// exactly the path that runs in production — and assert, per detector:
//   • the warning fires on the MODIFY (or the diverging OPEN), not at close,
//   • a `rule_violations` row is persisted,
//   • a clean trade raises nothing,
//   • a linked pre-trade draft is used as the baseline when present.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../../electron/db/schema'
import { createBrokerIngestService } from '../../../electron/services/broker/ingest'
import { tradingDayKey } from '../../../electron/services/time/trading-day'
import type { CairnDb } from '../../../electron/db/index'
import type { BrokerEvent, BrokerWarning } from '@cairn/shared-types'

const MIGRATIONS = [
  '0001_initial',
  '0002_v11',
  '0003_opened_at',
  '0004_consolidate_partials',
  '0005_dismissed_insights',
  '0006_notebook',
  '0007_notebook_account',
  '0008_external_ref',
  '0009_phase2',
  '0010_playbooks',
  '0011_sync',
  '0012_sync_merge',
  '0013_sync_clocks',
  '0014_live_detection_outcome',
  '0015_broker_account_map',
  '0016_account_phases',
].map((t) => readFileSync(join(__dirname, `../../../electron/db/migrations/${t}.sql`), 'utf-8'))

const PROP_FIRM_ID = '00000000-0000-0000-0000-000000000001'
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000002'
const SETUP_ID = '00000000-0000-0000-0000-000000000003'
const EURUSD_PAIR_ID = '00000000-0000-0000-0000-000000000004'

const BROKER_ACCOUNT = 'MT5-DEMO-001'
const TRADE_ID = '77777777'
const TZ = 'America/New_York'

// All event/clock times sit on the same NY trading day (2024-01-02).
const T0 = Date.UTC(2024, 0, 2, 9, 30) // 09:30 UTC fill time
const CLOCK_BASE = Date.UTC(2024, 0, 2, 10, 0)

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
})

function makeDb(): CairnDb {
  const sqlite = new SQL.Database()
  for (const sql of MIGRATIONS) {
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  const db = drizzle(sqlite, { schema })
  const now = Date.UTC(2024, 0, 1)

  db.insert(schema.propFirms)
    .values({
      id: PROP_FIRM_ID,
      name: 'Test Firm',
      defaultStepCount: 1,
      notes: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run()

  db.insert(schema.accounts)
    .values({
      id: ACCOUNT_ID,
      displayName: 'Demo',
      templateId: null,
      propFirmId: PROP_FIRM_ID,
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
      minTradingDays: null,
      maxTradingDays: null,
      weekendHoldingAllowed: 0,
      newsTradingAllowed: 1,
      consistencyRulePct: null,
      challengeCostCents: 10000,
      startDate: now,
      status: 'active',
      endDate: null,
      endReason: null,
      peakEquityCents: 1_000_000,
      currentEquityCents: 1_000_000,
      notes: null,
      dailyTradeLimit: null,
      maxDailyLossPct: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run()

  db.insert(schema.setups)
    .values({
      id: SETUP_ID,
      name: 'ICT OB',
      category: 'ict',
      description: null,
      color: '#4CAF50',
      active: 1,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  db.insert(schema.pairs)
    .values({
      id: EURUSD_PAIR_ID,
      symbol: 'EURUSD',
      displayName: 'EUR/USD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 1000,
      correlatedWith: null,
      active: 1,
      displayOrder: 1,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return db
}

/** Enable an account rule with a JSON config value. */
function enableRule(db: CairnDb, ruleKey: string, value: Record<string, unknown> = {}): void {
  db.insert(schema.accountRules)
    .values({
      id: uuidv7(),
      accountId: ACCOUNT_ID,
      ruleKey,
      enabled: 1,
      value: JSON.stringify(value),
      priority: 1,
      createdAt: CLOCK_BASE,
      updatedAt: CLOCK_BASE,
    })
    .run()
}

/** Insert a fully-formed trade row (prior trade / pre-trade draft) with overrides. */
function insertTrade(db: CairnDb, over: Partial<typeof schema.trades.$inferInsert>): string {
  const id = over.id ?? uuidv7()
  db.insert(schema.trades)
    .values({
      id,
      accountId: ACCOUNT_ID,
      sessionId: null,
      pairId: EURUSD_PAIR_ID,
      setupId: SETUP_ID,
      killzoneId: null,
      mode: 'live',
      direction: 'long',
      status: 'closed',
      entryPrice: 108_500,
      stopLossPrice: 108_400,
      takeProfitPrice: 108_700,
      slPips: 100,
      rrRatio: 200,
      lotSize: 10,
      riskAmountCents: 10_000,
      riskPctBps: 100,
      plannedInvalidation: 'below OB',
      mssConfirmed: 1,
      htfBiasAligned: 1,
      dxyAligned: null,
      smtConfirmed: null,
      preCalmScore: 5,
      preUrgencyScore: 3,
      preNeedScore: 3,
      phase2Complete: 1,
      createdAt: CLOCK_BASE,
      updatedAt: CLOCK_BASE,
      ...over,
    })
    .run()
  return id
}

interface Emitted {
  name: string
  payload: unknown
}

function makeService(db: CairnDb, emitted: Emitted[]) {
  let clock = CLOCK_BASE
  return createBrokerIngestService({
    db,
    now: () => clock++,
    emit: (name, payload) => emitted.push({ name, payload }),
    resolveAccount: () => ({ accountId: ACCOUNT_ID, defaultSetupId: SETUP_ID }),
    getAutoLogMode: () => 'draft_awaiting_context',
  })
}

const BASE = {
  broker: 'mt5' as const,
  brokerAccountId: BROKER_ACCOUNT,
  brokerTradeId: TRADE_ID,
  symbol: 'EURUSD',
  direction: 'long' as const,
  raw: null,
}

/** Build a BrokerEvent on the shared base; `over` tweaks per-event fields. */
function ev(type: BrokerEvent['type'], over: Partial<BrokerEvent> = {}): BrokerEvent {
  return {
    ...BASE,
    type,
    volumeLots: 0.1,
    price: 1.085,
    stopLoss: 1.084,
    takeProfit: 1.087,
    eventTimeMs: T0,
    ...over,
  }
}

function liveViolations(db: CairnDb) {
  return db
    .select()
    .from(schema.ruleViolations)
    .where(eq(schema.ruleViolations.outcome, 'detected_live'))
    .all()
}

function warningsFrom(emitted: Emitted[]): BrokerWarning[] {
  return emitted.filter((e) => e.name === 'broker.warning').map((e) => e.payload as BrokerWarning)
}

// ─── Divergence detectors (fire on the modify) ────────────────────────────────

describe('live detection — SL widened', () => {
  it('open then a widen-SL modify raises a non-blocking warning + a rule_violations row', () => {
    const db = makeDb()
    enableRule(db, 'no_sl_widening')
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    expect(svc.apply(ev('position_opened')).ok).toBe(true)
    // Long: a LOWER stop is further from entry → widening.
    expect(svc.apply(ev('position_modified', { stopLoss: 1.083 })).ok).toBe(true)

    const warns = warningsFrom(emitted)
    expect(warns).toHaveLength(1)
    expect(warns[0]?.ruleKey).toBe('no_sl_widening')
    expect(warns[0]?.symbol).toBe('EURUSD')

    const rows = liveViolations(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.ruleKey).toBe('no_sl_widening')
    expect(rows[0]?.severity).toBe('warning')
  })

  it('the warning fires on the modify event, not at close (prevention is the north star)', () => {
    const db = makeDb()
    enableRule(db, 'no_sl_widening')
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    svc.apply(ev('position_opened'))
    expect(warningsFrom(emitted)).toHaveLength(0) // nothing yet on open
    svc.apply(ev('position_modified', { stopLoss: 1.083 }))
    expect(warningsFrom(emitted)).toHaveLength(1) // raised at the moment of the widen
  })
})

describe('live detection — TP narrowed', () => {
  it('cutting the target toward entry raises no_tp_narrowing', () => {
    const db = makeDb()
    enableRule(db, 'no_tp_narrowing')
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    svc.apply(ev('position_opened'))
    // Long: a LOWER target is closer to entry → narrowing.
    svc.apply(ev('position_modified', { takeProfit: 1.086 }))

    const warns = warningsFrom(emitted)
    expect(warns.map((w) => w.ruleKey)).toContain('no_tp_narrowing')
    expect(liveViolations(db).some((r) => r.ruleKey === 'no_tp_narrowing')).toBe(true)
  })
})

describe('live detection — size increased mid-trade', () => {
  it('sizing up beyond tolerance raises position_size_matches_plan', () => {
    const db = makeDb()
    enableRule(db, 'position_size_matches_plan')
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    svc.apply(ev('position_opened', { volumeLots: 0.1 }))
    svc.apply(ev('position_modified', { volumeLots: 0.2 })) // +100%, past the 10% tolerance

    const warns = warningsFrom(emitted)
    expect(warns.map((w) => w.ruleKey)).toContain('position_size_matches_plan')
    expect(liveViolations(db).some((r) => r.ruleKey === 'position_size_matches_plan')).toBe(true)
  })

  it('a small size change within tolerance raises nothing', () => {
    const db = makeDb()
    enableRule(db, 'position_size_matches_plan')
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    svc.apply(ev('position_opened', { volumeLots: 0.1 }))
    svc.apply(ev('position_modified', { volumeLots: 0.105 })) // +5%, under tolerance

    expect(warningsFrom(emitted)).toHaveLength(0)
  })
})

// ─── Entry-time detectors (fire on the open) ──────────────────────────────────

describe('live detection — over-trade (daily limit)', () => {
  it('a fill past the daily-trade limit raises max_trades_per_day on open', () => {
    const db = makeDb()
    enableRule(db, 'max_trades_per_day', { maxTrades: 1 })
    // One trade already taken today (different external_ref, not a draft).
    insertTrade(db, { externalRef: 'prior-1', createdAt: CLOCK_BASE })
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    svc.apply(ev('position_opened'))

    const warns = warningsFrom(emitted)
    expect(warns.map((w) => w.ruleKey)).toContain('max_trades_per_day')
    expect(liveViolations(db).some((r) => r.ruleKey === 'max_trades_per_day')).toBe(true)
  })
})

describe('live detection — trading after the circuit breaker', () => {
  it('a fill after the loss limit locked the session raises max_daily_loss_pct', () => {
    const db = makeDb()
    enableRule(db, 'max_daily_loss_pct', { maxPct: 500 })
    db.insert(schema.sessions)
      .values({
        id: uuidv7(),
        accountId: ACCOUNT_ID,
        sessionDate: tradingDayKey(CLOCK_BASE, TZ),
        dailyBias: 'neutral',
        dailyBiasReason: '-',
        h4Bias: 'neutral',
        h4BiasReason: '-',
        h1Bias: 'neutral',
        h1BiasReason: '-',
        createdAt: CLOCK_BASE,
        updatedAt: CLOCK_BASE,
        lockedAt: Date.UTC(2024, 0, 2, 9, 0), // locked before the fill
      })
      .run()
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    svc.apply(ev('position_opened'))

    const warns = warningsFrom(emitted)
    expect(warns.map((w) => w.ruleKey)).toContain('max_daily_loss_pct')
    expect(liveViolations(db).some((r) => r.ruleKey === 'max_daily_loss_pct')).toBe(true)
  })
})

describe('live detection — outside killzone', () => {
  it('an entry outside every active killzone raises require_killzone', () => {
    const db = makeDb()
    enableRule(db, 'require_killzone')
    db.insert(schema.killzones)
      .values({
        id: uuidv7(),
        name: 'London',
        startTimeUtc: '12:00', // does NOT contain the 09:30 UTC fill
        endTimeUtc: '13:00',
        color: '#fff',
        active: 1,
        displayOrder: 1,
        notes: null,
        createdAt: CLOCK_BASE,
        updatedAt: CLOCK_BASE,
      })
      .run()
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    svc.apply(ev('position_opened'))

    expect(warningsFrom(emitted).map((w) => w.ruleKey)).toContain('require_killzone')
    expect(liveViolations(db).some((r) => r.ruleKey === 'require_killzone')).toBe(true)
  })
})

// ─── A clean trade raises nothing ─────────────────────────────────────────────

describe('live detection — a clean trade raises nothing', () => {
  it('every rule enabled, but the trade honours its plan → zero warnings, zero rows', () => {
    const db = makeDb()
    for (const key of [
      'no_sl_widening',
      'no_tp_narrowing',
      'position_size_matches_plan',
      'require_killzone',
    ]) {
      enableRule(db, key)
    }
    enableRule(db, 'max_trades_per_day', { maxTrades: 50 })
    enableRule(db, 'max_daily_loss_pct', { maxPct: 500 })
    // A killzone that DOES contain the 09:30 UTC fill.
    db.insert(schema.killzones)
      .values({
        id: uuidv7(),
        name: 'NY AM',
        startTimeUtc: '09:00',
        endTimeUtc: '10:00',
        color: '#fff',
        active: 1,
        displayOrder: 1,
        notes: null,
        createdAt: CLOCK_BASE,
        updatedAt: CLOCK_BASE,
      })
      .run()
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    svc.apply(ev('position_opened'))
    // Long: a HIGHER stop is a tighten (not a widen); target/size unchanged.
    svc.apply(ev('position_modified', { stopLoss: 1.0845 }))
    svc.apply(ev('position_closed', { price: 1.087 }))

    expect(warningsFrom(emitted)).toHaveLength(0)
    expect(liveViolations(db)).toHaveLength(0)
  })
})

// ─── Linked pre-trade draft is the baseline when present ──────────────────────

describe('live detection — linked draft plan is the baseline', () => {
  it('a fill that opens wider than a logged draft is caught against the PLAN, on open', () => {
    const db = makeDb()
    enableRule(db, 'no_sl_widening')
    // A pre-trade draft logged a minute before the fill: a TIGHTER plan (SL 1.0845).
    insertTrade(db, {
      status: 'planned',
      direction: 'long',
      stopLossPrice: 108_450, // 1.0845
      takeProfitPrice: 108_700,
      lotSize: 10,
      externalRef: null,
      createdAt: T0 - 60_000,
    })
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    // The fill opens with SL 1.084 — wider than the planned 1.0845.
    svc.apply(ev('position_opened', { stopLoss: 1.084 }))

    const warns = warningsFrom(emitted)
    expect(warns.map((w) => w.ruleKey)).toContain('no_sl_widening')
    // Proof the PLAN was the baseline: the breach was caught on the OPEN itself.
    expect(liveViolations(db).some((r) => r.ruleKey === 'no_sl_widening')).toBe(true)
  })

  it('control: with no draft, the same open establishes its own baseline and raises nothing', () => {
    const db = makeDb()
    enableRule(db, 'no_sl_widening')
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    svc.apply(ev('position_opened', { stopLoss: 1.084 }))

    expect(warningsFrom(emitted)).toHaveLength(0)
    expect(liveViolations(db)).toHaveLength(0)
  })
})

// ─── Replay safety ────────────────────────────────────────────────────────────

describe('live detection — replay safety', () => {
  it('replaying a breaching modify does not multiply rule_violations rows', () => {
    const db = makeDb()
    enableRule(db, 'no_sl_widening')
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    svc.apply(ev('position_opened'))
    svc.apply(ev('position_modified', { stopLoss: 1.083 }))
    svc.apply(ev('position_modified', { stopLoss: 1.083 })) // reconnect re-sends

    expect(liveViolations(db)).toHaveLength(1)
  })
})
