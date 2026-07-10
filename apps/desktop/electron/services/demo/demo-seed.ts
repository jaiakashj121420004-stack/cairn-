/**
 * First-run demo data (P0.6). Seeds ONE self-contained demo account with a few
 * weeks of realistic closed trades so a brand-new user can see the dashboard,
 * analytics, discipline/composite scores, calendar, grade and insight engine
 * working before connecting a broker or completing onboarding.
 *
 * Design guarantees:
 *  - **Money is exact.** Every trade's P&L is produced by the production
 *    `calculatePnl` from real prices/lots, never hand-typed — so demo numbers
 *    obey the same integer encoding as live trades (CLAUDE.md §2.5/§19.5).
 *  - **Throwaway + reversible.** All rows hang off a fixed `DEMO_ACCOUNT_ID`;
 *    `removeDemoData` deletes them in child→parent order and touches nothing
 *    else. `seedDemoData` first clears any prior demo rows, so re-entering is
 *    idempotent.
 *  - **Never synced.** Demo rows are deliberately NOT passed through
 *    `enqueueSyncOp` — demo data must never land in a user's real vault.
 *  - **Pure + testable.** This module only touches the passed Drizzle db (plus
 *    the reference-data seeder); it imports no Electron runtime, so it unit-tests
 *    against a sql.js database directly.
 */
import { eq, inArray } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../db/schema'
import { runSeed } from '../../db/seed'
import { calculatePnl } from '../pnl-calculator'
import type { CairnDb } from '../../db/index'

/** Fixed id so demo rows are always identifiable and cleanly removable. */
export const DEMO_ACCOUNT_ID = 'de300000-0000-7000-8000-000000000001'

/** Settings key App.tsx reads to decide whether to show the app in demo mode. */
export const DEMO_MODE_SETTING = 'demo_mode_active'

const DEMO_ACCOUNT_SIZE_CENTS = 5_000_000 // $50,000

const MS_PER_DAY = 86_400_000
const MS_PER_MINUTE = 60_000

// Default account rule set — mirrors DEFAULT_ACCOUNT_RULES in electron/ipc/accounts.ts
// so the demo account is structurally identical to a user-created one. Kept as a
// local copy (not imported) so this seeder stays free of the IPC/Electron layer
// and remains unit-testable against a bare sql.js db.
const DEMO_ACCOUNT_RULES: ReadonlyArray<{
  ruleKey: string
  enabled: number
  value: string
  priority: number
}> = [
  {
    ruleKey: 'max_risk_per_trade_pct',
    enabled: 1,
    value: JSON.stringify({ maxPct: 100 }),
    priority: 10,
  },
  {
    ruleKey: 'max_daily_loss_pct',
    enabled: 1,
    value: JSON.stringify({ maxPct: 500 }),
    priority: 20,
  },
  {
    ruleKey: 'max_overall_daily_loss_hard_stop_pct',
    enabled: 1,
    value: JSON.stringify({ maxPct: 800 }),
    priority: 30,
  },
  { ruleKey: 'min_rr_ratio', enabled: 1, value: JSON.stringify({ minRR: 200 }), priority: 40 },
  {
    ruleKey: 'position_size_matches_plan',
    enabled: 1,
    value: JSON.stringify({ tolerancePct: 5 }),
    priority: 50,
  },
  { ruleKey: 'require_mss_confirmation', enabled: 1, value: JSON.stringify({}), priority: 60 },
  {
    ruleKey: 'require_invalidation_text',
    enabled: 1,
    value: JSON.stringify({ minChars: 20 }),
    priority: 70,
  },
  { ruleKey: 'require_htf_bias_logged', enabled: 1, value: JSON.stringify({}), priority: 80 },
  { ruleKey: 'no_sl_widening', enabled: 1, value: JSON.stringify({}), priority: 90 },
  { ruleKey: 'no_tp_narrowing', enabled: 1, value: JSON.stringify({}), priority: 91 },
  {
    ruleKey: 'require_killzone',
    enabled: 1,
    value: JSON.stringify({ zoneNames: ['London', 'NY AM'] }),
    priority: 95,
  },
  { ruleKey: 'require_dxy_check', enabled: 0, value: JSON.stringify({}), priority: 96 },
  {
    ruleKey: 'max_trades_per_day',
    enabled: 1,
    value: JSON.stringify({ maxTrades: 3 }),
    priority: 100,
  },
  {
    ruleKey: 'cooldown_after_loss_minutes',
    enabled: 1,
    value: JSON.stringify({ minutes: 30 }),
    priority: 110,
  },
  {
    ruleKey: 'daily_stop_after_losses',
    enabled: 1,
    value: JSON.stringify({ consecutiveLosses: 2 }),
    priority: 120,
  },
  {
    ruleKey: 'no_revenge_trade_window',
    enabled: 0,
    value: JSON.stringify({ minutes: 30 }),
    priority: 130,
  },
  {
    ruleKey: 'emotional_state_gate',
    enabled: 0,
    value: JSON.stringify({ maxUrgency: 7, maxNeed: 6 }),
    priority: 140,
  },
  {
    ruleKey: 'weekend_holding_blocked',
    enabled: 1,
    value: JSON.stringify({ fridayCloseUtcHour: 20 }),
    priority: 150,
  },
  { ruleKey: 'min_trading_days_check', enabled: 0, value: JSON.stringify({}), priority: 160 },
]

type Outcome = 'win' | 'loss' | 'be'

interface TradeSpec {
  /** Days before "now" the trade was opened. */
  daysAgo: number
  /** UTC hour of entry (drives killzone realism). */
  hourUtc: number
  pair: string
  setup: string
  killzone: string
  direction: 'long' | 'short'
  /** Real entry price (human units, e.g. 1.0850). */
  entry: number
  /** Stop distance in whole pips. */
  slPips: number
  /** Planned reward:risk. */
  rr: number
  /** Position size in lots. */
  lots: number
  outcome: Outcome
  clean: boolean
  preCalm: number
  preUrgency: number
  preNeed: number
  durationMin: number
  invalidation: string
  right: string
  wrong: string
  rulesBroken: readonly string[]
  tags: readonly string[]
}

// Deterministic dataset (no RNG → reproducible tests). ~3.5 weeks of trades:
// a realistic mix of clean wins, disciplined losses, and a few "dirty" trades
// (higher urgency, plan not followed, a rule broken) so the insight engine,
// grade, clean-rate and composite score all have signal.
const TRADE_SPECS: readonly TradeSpec[] = [
  {
    daysAgo: 24,
    hourUtc: 8,
    pair: 'EURUSD',
    setup: 'Order Block',
    killzone: 'London',
    direction: 'long',
    entry: 1.085,
    slPips: 18,
    rr: 3,
    lots: 0.5,
    outcome: 'win',
    clean: true,
    preCalm: 8,
    preUrgency: 3,
    preNeed: 2,
    durationMin: 95,
    invalidation: 'Below the 4H order block low at 1.0832',
    right: 'Waited for the London sweep and MSS before entry.',
    wrong: '',
    rulesBroken: [],
    tags: ['a+ setup'],
  },
  {
    daysAgo: 24,
    hourUtc: 13,
    pair: 'GBPUSD',
    setup: 'FVG',
    killzone: 'NY AM',
    direction: 'long',
    entry: 1.271,
    slPips: 20,
    rr: 2,
    lots: 0.4,
    outcome: 'loss',
    clean: true,
    preCalm: 7,
    preUrgency: 4,
    preNeed: 3,
    durationMin: 60,
    invalidation: 'FVG fills and price closes back below 1.2690',
    right: 'Took the loss at stop without hesitation.',
    wrong: 'Entry was a touch early into the FVG.',
    rulesBroken: [],
    tags: [],
  },
  {
    daysAgo: 23,
    hourUtc: 9,
    pair: 'XAUUSD',
    setup: 'Silver Bullet',
    killzone: 'London Silver Bullet',
    direction: 'short',
    entry: 2338.0,
    slPips: 40,
    rr: 2.5,
    lots: 0.2,
    outcome: 'win',
    clean: true,
    preCalm: 8,
    preUrgency: 2,
    preNeed: 2,
    durationMin: 45,
    invalidation: 'Price reclaims the 15m FVG above 2342.0',
    right: 'Clean silver-bullet window entry after displacement.',
    wrong: '',
    rulesBroken: [],
    tags: ['killzone'],
  },
  {
    daysAgo: 22,
    hourUtc: 14,
    pair: 'EURUSD',
    setup: 'Liquidity Sweep Reversal',
    killzone: 'NY AM',
    direction: 'long',
    entry: 1.0835,
    slPips: 16,
    rr: 3,
    lots: 0.6,
    outcome: 'win',
    clean: true,
    preCalm: 9,
    preUrgency: 3,
    preNeed: 2,
    durationMin: 120,
    invalidation: 'Sweep low at 1.0819 is broken on a 5m close',
    right: 'Let the sweep complete before committing.',
    wrong: '',
    rulesBroken: [],
    tags: [],
  },
  {
    daysAgo: 21,
    hourUtc: 16,
    pair: 'GBPJPY',
    setup: 'Judas Swing',
    killzone: 'NY AM',
    direction: 'short',
    entry: 198.5,
    slPips: 30,
    rr: 2,
    lots: 0.3,
    outcome: 'loss',
    clean: false,
    preCalm: 4,
    preUrgency: 8,
    preNeed: 7,
    durationMin: 35,
    invalidation: 'Above the session high at 198.80',
    right: '',
    wrong: 'Chased the move after missing the first entry; urgency was high.',
    rulesBroken: ['no_sl_widening'],
    tags: ['fomo'],
  },
  {
    daysAgo: 18,
    hourUtc: 8,
    pair: 'EURUSD',
    setup: 'Order Block',
    killzone: 'London',
    direction: 'long',
    entry: 1.088,
    slPips: 18,
    rr: 3,
    lots: 0.5,
    outcome: 'win',
    clean: true,
    preCalm: 8,
    preUrgency: 3,
    preNeed: 2,
    durationMin: 110,
    invalidation: 'Below the refined OB at 1.0862',
    right: 'Textbook OB retest in the killzone.',
    wrong: '',
    rulesBroken: [],
    tags: ['a+ setup'],
  },
  {
    daysAgo: 18,
    hourUtc: 13,
    pair: 'NAS100',
    setup: 'Breaker Block',
    killzone: 'NY AM',
    direction: 'long',
    entry: 18250,
    slPips: 25,
    rr: 2,
    lots: 0.3,
    outcome: 'win',
    clean: true,
    preCalm: 7,
    preUrgency: 4,
    preNeed: 3,
    durationMin: 75,
    invalidation: 'Below the breaker at 18200',
    right: 'Waited for the NY open confirmation.',
    wrong: '',
    rulesBroken: [],
    tags: [],
  },
  {
    daysAgo: 17,
    hourUtc: 13,
    pair: 'GBPUSD',
    setup: 'FVG',
    killzone: 'NY AM',
    direction: 'short',
    entry: 1.2745,
    slPips: 18,
    rr: 2.5,
    lots: 0.4,
    outcome: 'loss',
    clean: true,
    preCalm: 7,
    preUrgency: 4,
    preNeed: 3,
    durationMin: 50,
    invalidation: 'Above the FVG high at 1.2763',
    right: 'Respected the stop.',
    wrong: 'HTF bias was mixed; could have skipped.',
    rulesBroken: [],
    tags: [],
  },
  {
    daysAgo: 16,
    hourUtc: 20,
    pair: 'EURUSD',
    setup: 'Turtle Soup',
    killzone: 'NY PM Silver Bullet',
    direction: 'short',
    entry: 1.0865,
    slPips: 15,
    rr: 2,
    lots: 0.5,
    outcome: 'loss',
    clean: false,
    preCalm: 3,
    preUrgency: 9,
    preNeed: 8,
    durationMin: 20,
    invalidation: 'Above 1.0880',
    right: '',
    wrong: 'Revenge trade right after the prior loss. Outside my A-setups.',
    rulesBroken: ['daily_stop_after_losses', 'emotional_state_gate'],
    tags: ['revenge', 'tilt'],
  },
  {
    daysAgo: 14,
    hourUtc: 9,
    pair: 'XAUUSD',
    setup: 'Silver Bullet',
    killzone: 'London Silver Bullet',
    direction: 'long',
    entry: 2352.0,
    slPips: 35,
    rr: 3,
    lots: 0.2,
    outcome: 'win',
    clean: true,
    preCalm: 9,
    preUrgency: 2,
    preNeed: 2,
    durationMin: 55,
    invalidation: 'Below the 15m FVG at 2348.5',
    right: 'Patient entry, full target hit.',
    wrong: '',
    rulesBroken: [],
    tags: ['a+ setup', 'killzone'],
  },
  {
    daysAgo: 14,
    hourUtc: 14,
    pair: 'EURUSD',
    setup: 'Order Block',
    killzone: 'NY AM',
    direction: 'long',
    entry: 1.086,
    slPips: 17,
    rr: 2,
    lots: 0.5,
    outcome: 'win',
    clean: true,
    preCalm: 8,
    preUrgency: 3,
    preNeed: 3,
    durationMin: 80,
    invalidation: 'Below OB at 1.0843',
    right: 'Solid continuation entry.',
    wrong: '',
    rulesBroken: [],
    tags: [],
  },
  {
    daysAgo: 11,
    hourUtc: 8,
    pair: 'GBPUSD',
    setup: 'Liquidity Sweep Reversal',
    killzone: 'London',
    direction: 'long',
    entry: 1.2705,
    slPips: 20,
    rr: 3,
    lots: 0.4,
    outcome: 'win',
    clean: true,
    preCalm: 8,
    preUrgency: 3,
    preNeed: 2,
    durationMin: 130,
    invalidation: 'Below the swept low at 1.2685',
    right: 'Let London take the liquidity first.',
    wrong: '',
    rulesBroken: [],
    tags: [],
  },
  {
    daysAgo: 11,
    hourUtc: 13,
    pair: 'US30',
    setup: 'Breaker Block',
    killzone: 'NY AM',
    direction: 'short',
    entry: 39000,
    slPips: 30,
    rr: 2,
    lots: 0.2,
    outcome: 'loss',
    clean: true,
    preCalm: 7,
    preUrgency: 4,
    preNeed: 3,
    durationMin: 40,
    invalidation: 'Above the breaker at 39060',
    right: 'Cut it at stop.',
    wrong: '',
    rulesBroken: [],
    tags: [],
  },
  {
    daysAgo: 10,
    hourUtc: 16,
    pair: 'GBPJPY',
    setup: 'FVG',
    killzone: 'NY AM',
    direction: 'long',
    entry: 199.2,
    slPips: 28,
    rr: 2,
    lots: 0.3,
    outcome: 'loss',
    clean: false,
    preCalm: 4,
    preUrgency: 8,
    preNeed: 6,
    durationMin: 25,
    invalidation: 'Below 198.60',
    right: '',
    wrong: 'Traded outside my killzone with high urgency.',
    rulesBroken: ['require_killzone'],
    tags: ['fomo'],
  },
  {
    daysAgo: 8,
    hourUtc: 9,
    pair: 'EURUSD',
    setup: 'Silver Bullet',
    killzone: 'London Silver Bullet',
    direction: 'long',
    entry: 1.0845,
    slPips: 15,
    rr: 3,
    lots: 0.6,
    outcome: 'win',
    clean: true,
    preCalm: 9,
    preUrgency: 2,
    preNeed: 2,
    durationMin: 50,
    invalidation: 'Below the 15m FVG at 1.0832',
    right: 'Best window of the week, executed the plan.',
    wrong: '',
    rulesBroken: [],
    tags: ['a+ setup', 'killzone'],
  },
  {
    daysAgo: 8,
    hourUtc: 13,
    pair: 'XAUUSD',
    setup: 'Order Block',
    killzone: 'NY AM',
    direction: 'short',
    entry: 2360.0,
    slPips: 40,
    rr: 2,
    lots: 0.2,
    outcome: 'win',
    clean: true,
    preCalm: 8,
    preUrgency: 3,
    preNeed: 3,
    durationMin: 90,
    invalidation: 'Above OB at 2364.0',
    right: 'Good NY reversal read.',
    wrong: '',
    rulesBroken: [],
    tags: [],
  },
  {
    daysAgo: 7,
    hourUtc: 8,
    pair: 'GBPUSD',
    setup: 'Order Block',
    killzone: 'London',
    direction: 'long',
    entry: 1.272,
    slPips: 18,
    rr: 2.5,
    lots: 0.4,
    outcome: 'loss',
    clean: true,
    preCalm: 7,
    preUrgency: 4,
    preNeed: 3,
    durationMin: 65,
    invalidation: 'Below OB at 1.2702',
    right: 'Accepted the loss, no adjustment.',
    wrong: '',
    rulesBroken: [],
    tags: [],
  },
  {
    daysAgo: 4,
    hourUtc: 13,
    pair: 'EURUSD',
    setup: 'FVG',
    killzone: 'NY AM',
    direction: 'long',
    entry: 1.0838,
    slPips: 16,
    rr: 3,
    lots: 0.5,
    outcome: 'win',
    clean: true,
    preCalm: 8,
    preUrgency: 3,
    preNeed: 2,
    durationMin: 100,
    invalidation: 'Below the FVG at 1.0822',
    right: 'Patient, plan-perfect entry.',
    wrong: '',
    rulesBroken: [],
    tags: ['a+ setup'],
  },
  {
    daysAgo: 4,
    hourUtc: 14,
    pair: 'NAS100',
    setup: 'Liquidity Sweep Reversal',
    killzone: 'NY AM',
    direction: 'long',
    entry: 18400,
    slPips: 30,
    rr: 2,
    lots: 0.3,
    outcome: 'win',
    clean: true,
    preCalm: 8,
    preUrgency: 3,
    preNeed: 3,
    durationMin: 70,
    invalidation: 'Below the swept low at 18340',
    right: 'Let the sweep run, then entered.',
    wrong: '',
    rulesBroken: [],
    tags: [],
  },
  {
    daysAgo: 3,
    hourUtc: 16,
    pair: 'GBPJPY',
    setup: 'Judas Swing',
    killzone: 'NY AM',
    direction: 'short',
    entry: 200.1,
    slPips: 30,
    rr: 2,
    lots: 0.3,
    outcome: 'loss',
    clean: false,
    preCalm: 3,
    preUrgency: 9,
    preNeed: 8,
    durationMin: 22,
    invalidation: 'Above 200.50',
    right: '',
    wrong: 'Overtraded after two wins — got greedy, urgency 9.',
    rulesBroken: ['max_trades_per_day'],
    tags: ['overtrading', 'tilt'],
  },
  {
    daysAgo: 2,
    hourUtc: 8,
    pair: 'EURUSD',
    setup: 'Order Block',
    killzone: 'London',
    direction: 'long',
    entry: 1.0842,
    slPips: 17,
    rr: 3,
    lots: 0.5,
    outcome: 'win',
    clean: true,
    preCalm: 9,
    preUrgency: 2,
    preNeed: 2,
    durationMin: 115,
    invalidation: 'Below OB at 1.0825',
    right: 'Reset after yesterday, clean execution.',
    wrong: '',
    rulesBroken: [],
    tags: ['a+ setup'],
  },
  {
    daysAgo: 1,
    hourUtc: 9,
    pair: 'XAUUSD',
    setup: 'Silver Bullet',
    killzone: 'London Silver Bullet',
    direction: 'long',
    entry: 2366.0,
    slPips: 35,
    rr: 2.5,
    lots: 0.2,
    outcome: 'win',
    clean: true,
    preCalm: 8,
    preUrgency: 3,
    preNeed: 2,
    durationMin: 48,
    invalidation: 'Below the 15m FVG at 2362.0',
    right: 'Silver bullet, textbook.',
    wrong: '',
    rulesBroken: [],
    tags: ['killzone'],
  },
  {
    daysAgo: 1,
    hourUtc: 13,
    pair: 'GBPUSD',
    setup: 'FVG',
    killzone: 'NY AM',
    direction: 'long',
    entry: 1.273,
    slPips: 18,
    rr: 2,
    lots: 0.4,
    outcome: 'loss',
    clean: true,
    preCalm: 7,
    preUrgency: 4,
    preNeed: 3,
    durationMin: 55,
    invalidation: 'Below the FVG at 1.2712',
    right: 'Small size, took the stop cleanly.',
    wrong: '',
    rulesBroken: [],
    tags: [],
  },
]

interface RefRow {
  id: string
  pipDecimal?: number
  pipValue?: number
}

/** Round to nearest integer, ties toward +∞ (matches Math.round / pnl-calculator). */
function roundHalfUp(n: number): number {
  return Math.round(n)
}

function encodePrice(real: number, pipDecimal: number): number {
  return roundHalfUp(real * Math.pow(10, pipDecimal + 1))
}

/**
 * Remove every demo row (child → parent order, matching the FK graph). Safe to
 * call when no demo data exists. Only ever touches rows tied to DEMO_ACCOUNT_ID.
 */
export function removeDemoData(db: CairnDb): void {
  const tradeRows = db
    .select({ id: schema.trades.id })
    .from(schema.trades)
    .where(eq(schema.trades.accountId, DEMO_ACCOUNT_ID))
    .all()
  const tradeIds = tradeRows.map((t) => t.id)

  db.transaction(() => {
    if (tradeIds.length > 0) {
      db.delete(schema.tradePartials).where(inArray(schema.tradePartials.tradeId, tradeIds)).run()
      db.delete(schema.tradeScreenshots)
        .where(inArray(schema.tradeScreenshots.tradeId, tradeIds))
        .run()
    }
    db.delete(schema.ruleViolations)
      .where(eq(schema.ruleViolations.accountId, DEMO_ACCOUNT_ID))
      .run()
    db.delete(schema.reviews).where(eq(schema.reviews.accountId, DEMO_ACCOUNT_ID)).run()
    db.delete(schema.cooldowns).where(eq(schema.cooldowns.accountId, DEMO_ACCOUNT_ID)).run()
    db.delete(schema.dismissedInsights)
      .where(eq(schema.dismissedInsights.accountId, DEMO_ACCOUNT_ID))
      .run()
    db.delete(schema.dailyLocks).where(eq(schema.dailyLocks.accountId, DEMO_ACCOUNT_ID)).run()
    db.delete(schema.trades).where(eq(schema.trades.accountId, DEMO_ACCOUNT_ID)).run()
    db.delete(schema.sessions).where(eq(schema.sessions.accountId, DEMO_ACCOUNT_ID)).run()
    db.delete(schema.playbooks).where(eq(schema.playbooks.accountId, DEMO_ACCOUNT_ID)).run()
    db.delete(schema.notebookEntries)
      .where(eq(schema.notebookEntries.accountId, DEMO_ACCOUNT_ID))
      .run()
    db.delete(schema.brokerAccountMap)
      .where(eq(schema.brokerAccountMap.cairnAccountId, DEMO_ACCOUNT_ID))
      .run()
    db.delete(schema.accountRules).where(eq(schema.accountRules.accountId, DEMO_ACCOUNT_ID)).run()
    db.delete(schema.accountPhases).where(eq(schema.accountPhases.accountId, DEMO_ACCOUNT_ID)).run()
    db.delete(schema.accounts).where(eq(schema.accounts.id, DEMO_ACCOUNT_ID)).run()
  })
}

/**
 * Seed the demo account and its trade history. Idempotent: clears any prior demo
 * data first. Ensures reference data (pairs/setups/killzones/firm) exists via the
 * standard idempotent seeder, so it also works after a data reset.
 *
 * @returns the demo account id.
 */
export function seedDemoData(db: CairnDb): { accountId: string } {
  removeDemoData(db)
  // Guarantee reference + firm data exists (idempotent; no-op on a fresh first-run DB).
  runSeed(db)

  const now = Date.now()

  const pairRows = db.select().from(schema.pairs).all()
  const setupRows = db.select().from(schema.setups).all()
  const killzoneRows = db.select().from(schema.killzones).all()
  const firm = db.select().from(schema.propFirms).limit(1).all()[0]
  if (!firm) throw new Error('demo-seed: no prop firm available after runSeed')

  const pairBySymbol = new Map<string, RefRow>(
    pairRows.map((p) => [
      p.symbol,
      { id: p.id, pipDecimal: p.pipDecimal, pipValue: p.pipValuePerStandardLotCents },
    ]),
  )
  const setupByName = new Map<string, RefRow>(setupRows.map((s) => [s.name, { id: s.id }]))
  const killzoneByName = new Map<string, RefRow>(killzoneRows.map((k) => [k.name, { id: k.id }]))

  // Build encoded, P&L-consistent trade rows (chronological order, oldest first).
  const ordered = [...TRADE_SPECS].sort((a, b) => b.daysAgo - a.daysAgo)

  interface BuiltTrade {
    row: typeof schema.trades.$inferInsert
    openedAt: number
    pnlCents: number
    sessionKey: string
    accountId: string
  }
  const built: BuiltTrade[] = []
  const sessionKeys = new Set<string>()

  for (const spec of ordered) {
    const pair = pairBySymbol.get(spec.pair)
    const setup = setupByName.get(spec.setup)
    const killzone = killzoneByName.get(spec.killzone)
    if (!pair || pair.pipDecimal === undefined || pair.pipValue === undefined || !setup) {
      // Reference data should always exist post-runSeed; skip defensively rather than throw.
      continue
    }
    const pipDecimal = pair.pipDecimal
    const pipValue = pair.pipValue
    const pipSize = Math.pow(10, -pipDecimal) // price move for one pip

    const dirSign = spec.direction === 'long' ? 1 : -1
    const slReal = spec.entry - dirSign * spec.slPips * pipSize
    const tpReal = spec.entry + dirSign * spec.rr * spec.slPips * pipSize

    const entryPrice = encodePrice(spec.entry, pipDecimal)
    const stopLossPrice = encodePrice(slReal, pipDecimal)
    const takeProfitPrice = encodePrice(tpReal, pipDecimal)
    const slPipsEnc = roundHalfUp(spec.slPips * 10)
    const rrRatio = roundHalfUp(spec.rr * 100)
    const lotSize = roundHalfUp(spec.lots * 100)
    const riskAmountCents = roundHalfUp(spec.slPips * pipValue * spec.lots)
    const riskPctBps = roundHalfUp((riskAmountCents / DEMO_ACCOUNT_SIZE_CENTS) * 10000)

    const exitPrice =
      spec.outcome === 'win'
        ? takeProfitPrice
        : spec.outcome === 'loss'
          ? stopLossPrice
          : entryPrice
    const exitReason = spec.outcome === 'win' ? 'tp' : spec.outcome === 'loss' ? 'sl' : 'be'

    const pnl = calculatePnl({
      direction: spec.direction,
      exitPrice,
      entryPrice,
      lotSize,
      slPips: slPipsEnc,
      pipValuePerStandardLotCents: pipValue,
      accountSizeCents: DEMO_ACCOUNT_SIZE_CENTS,
    })

    const openedAt = now - spec.daysAgo * MS_PER_DAY + spec.hourUtc * 60 * MS_PER_MINUTE
    const exitTime = openedAt + spec.durationMin * MS_PER_MINUTE
    const sessionKey = new Date(openedAt).toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
    sessionKeys.add(sessionKey)

    const tradeId = uuidv7()
    const row: typeof schema.trades.$inferInsert = {
      id: tradeId,
      accountId: DEMO_ACCOUNT_ID,
      sessionId: null, // linked below once sessions are created
      pairId: pair.id,
      setupId: setup.id,
      killzoneId: killzone?.id ?? null,
      mode: 'live',
      direction: spec.direction,
      status: 'closed',
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      slPips: slPipsEnc,
      rrRatio,
      lotSize,
      riskAmountCents,
      riskPctBps,
      plannedInvalidation: spec.invalidation,
      mssConfirmed: spec.clean ? 1 : 0,
      htfBiasAligned: spec.clean ? 1 : 0,
      dxyAligned: null,
      smtConfirmed: null,
      correlatedPairUsed: null,
      preCalmScore: spec.preCalm,
      preUrgencyScore: spec.preUrgency,
      preNeedScore: spec.preNeed,
      actualEntryPrice: entryPrice,
      actualEntryTime: openedAt,
      exitPrice,
      exitTime,
      exitReason,
      pnlCents: pnl.pnlCents,
      pnlR: pnl.pnlR,
      pnlPctBps: pnl.pnlPctBps,
      maxDrawdownDuringTradePctBps: null,
      maePips: null,
      mfePips: null,
      durationMinutes: spec.durationMin,
      followedPlanExactly: spec.clean ? 1 : 0,
      planChangesDescription: spec.clean ? null : spec.wrong,
      slMoved: spec.rulesBroken.includes('no_sl_widening') ? 1 : 0,
      slMovedReason: spec.rulesBroken.includes('no_sl_widening')
        ? 'Widened stop under pressure'
        : null,
      tpMoved: 0,
      enteredBeforeMss: spec.clean ? 0 : 1,
      revengeTradeFlag: spec.tags.includes('revenge') ? 1 : 0,
      rulesBroken: JSON.stringify([...spec.rulesBroken]),
      isClean: spec.clean && spec.rulesBroken.length === 0 ? 1 : 0,
      postCalmScore: spec.outcome === 'loss' ? Math.max(1, spec.preCalm - 2) : spec.preCalm,
      whatIDidRight: spec.right || null,
      whatIDidWrong: spec.wrong || null,
      tags: JSON.stringify([...spec.tags]),
      phase2Complete: 1,
      screenshotPath: null,
      openedAt,
      brokerSource: null,
      brokerTradeId: null,
      importedAt: null,
      externalRef: null,
      createdAt: openedAt,
      updatedAt: exitTime,
      deletedAt: null,
    }
    built.push({ row, openedAt, pnlCents: pnl.pnlCents, sessionKey, accountId: DEMO_ACCOUNT_ID })
  }

  // Running equity for a lifelike balance / peak.
  let equity = DEMO_ACCOUNT_SIZE_CENTS
  let peak = DEMO_ACCOUNT_SIZE_CENTS
  for (const b of built) {
    equity += b.pnlCents
    if (equity > peak) peak = equity
  }
  const startDate = now - 25 * MS_PER_DAY

  // Sessions keyed by date; map each trade to its day's session.
  const sessionIdByKey = new Map<string, string>()
  for (const key of sessionKeys) sessionIdByKey.set(key, uuidv7())

  db.transaction(() => {
    // Account (2-step $50k challenge, phase 1 active).
    db.insert(schema.accounts)
      .values({
        id: DEMO_ACCOUNT_ID,
        displayName: 'Demo Account',
        templateId: null,
        propFirmId: firm.id,
        stepCount: 2,
        currentPhase: 1,
        accountSizeCents: DEMO_ACCOUNT_SIZE_CENTS,
        leverage: 100,
        dailyDrawdownType: 'percent_of_balance',
        dailyDrawdownValue: 500, // 5%
        totalDrawdownType: 'percent_of_balance',
        totalDrawdownValue: 1000, // 10%
        drawdownBasis: 'initial_balance',
        profitTargetPct: 800, // 8% (phase 1)
        minTradingDays: 5,
        maxTradingDays: null,
        weekendHoldingAllowed: 0,
        newsTradingAllowed: 1,
        consistencyRulePct: null,
        challengeCostCents: 30000, // $300
        startDate,
        status: 'active',
        endDate: null,
        endReason: null,
        peakEquityCents: peak,
        currentEquityCents: equity,
        notes:
          'Sample account — explore Cairn with a few weeks of trades, then exit demo to set up your own.',
        dailyTradeLimit: 3,
        maxDailyLossPct: null,
        createdAt: startDate,
        updatedAt: now,
      })
      .run()

    // Phase ladder (denormalized active-phase values already mirrored above).
    const phases = [
      { phaseNumber: 1, profitTargetPct: 800 },
      { phaseNumber: 2, profitTargetPct: 500 },
    ]
    for (const p of phases) {
      db.insert(schema.accountPhases)
        .values({
          id: uuidv7(),
          accountId: DEMO_ACCOUNT_ID,
          phaseNumber: p.phaseNumber,
          profitTargetPct: p.profitTargetPct,
          dailyDrawdownType: 'percent_of_balance',
          dailyDrawdownValue: 500,
          totalDrawdownType: 'percent_of_balance',
          totalDrawdownValue: 1000,
          minTradingDays: 5,
          maxTradingDays: null,
          consistencyRulePct: null,
          createdAt: startDate,
          updatedAt: startDate,
        })
        .run()
    }

    for (const rule of DEMO_ACCOUNT_RULES) {
      db.insert(schema.accountRules)
        .values({
          id: uuidv7(),
          accountId: DEMO_ACCOUNT_ID,
          ruleKey: rule.ruleKey,
          enabled: rule.enabled,
          value: rule.value,
          priority: rule.priority,
          createdAt: startDate,
          updatedAt: startDate,
        })
        .run()
    }

    // One session per trading day.
    for (const [key, id] of sessionIdByKey) {
      const created = new Date(`${key}T07:00:00.000Z`).getTime()
      db.insert(schema.sessions)
        .values({
          id,
          accountId: DEMO_ACCOUNT_ID,
          sessionDate: key,
          dailyBias: 'bullish',
          dailyBiasReason: 'HTF drawing toward buy-side liquidity above the range highs.',
          h4Bias: 'bullish',
          h4BiasReason: 'Series of higher lows respecting the 4H order block.',
          h1Bias: 'bullish',
          h1BiasReason: 'Displacement up left a clean 1H FVG to retrace into.',
          htfLiquidityTarget: 'Buy-side liquidity above yesterday high',
          dxyBias: 'bearish',
          smtNotes: 'EURUSD/GBPUSD in agreement.',
          sessionPlan: 'Wait for the killzone sweep, confirm MSS, enter on the FVG/OB retest.',
          keyLevels: JSON.stringify([]),
          createdAt: created,
          updatedAt: created,
          lockedAt: created,
        })
        .run()
    }

    // Trades (link each to its day's session).
    for (const b of built) {
      const sessionId = sessionIdByKey.get(b.sessionKey) ?? null
      db.insert(schema.trades)
        .values({ ...b.row, sessionId })
        .run()
    }

    // A couple of playbooks.
    const eurusd = pairBySymbol.get('EURUSD')
    const xauusd = pairBySymbol.get('XAUUSD')
    const ob = setupByName.get('Order Block')
    const sb = setupByName.get('Silver Bullet')
    const london = killzoneByName.get('London')
    const londonSb = killzoneByName.get('London Silver Bullet')
    if (ob) {
      db.insert(schema.playbooks)
        .values({
          id: uuidv7(),
          accountId: DEMO_ACCOUNT_ID,
          name: 'London OB Retest',
          pairId: eurusd?.id ?? null,
          setupId: ob.id,
          killzoneId: london?.id ?? null,
          requiredConfluenceMd:
            '- London killzone\n- HTF bullish bias\n- Liquidity sweep + MSS\n- Retest of refined order block',
          defaultRiskPct: 100,
          defaultInvalidationChip: null,
          createdAt: startDate,
          updatedAt: startDate,
          version: 1,
        })
        .run()
    }
    if (sb) {
      db.insert(schema.playbooks)
        .values({
          id: uuidv7(),
          accountId: DEMO_ACCOUNT_ID,
          name: 'Silver Bullet AM',
          pairId: xauusd?.id ?? null,
          setupId: sb.id,
          killzoneId: londonSb?.id ?? null,
          requiredConfluenceMd:
            '- Silver Bullet window\n- Displacement + 15m FVG\n- Clear draw on liquidity',
          defaultRiskPct: 50,
          defaultInvalidationChip: null,
          createdAt: startDate,
          updatedAt: startDate,
          version: 1,
        })
        .run()
    }

    // Welcome notebook entry.
    db.insert(schema.notebookEntries)
      .values({
        id: uuidv7(),
        accountId: DEMO_ACCOUNT_ID,
        title: 'Welcome to the Cairn demo',
        content:
          '# Welcome\n\nThis is a **demo account** preloaded with a few weeks of sample trades so you can explore Cairn:\n\n- The **Dashboard** discipline & performance scores\n- **Analytics** (calendar, time-of-day, expectancy, R-distribution)\n- The **Review** screen insight engine\n- Per-trade **A–F grades** in the trade log\n\nWhen you are ready, use **Exit demo** in the banner to clear this and set up your own account. Nothing here is synced.',
        template: null,
        pinned: 1,
        version: 1,
        createdAt: startDate,
        updatedAt: startDate,
        deletedAt: null,
      })
      .run()
  })

  return { accountId: DEMO_ACCOUNT_ID }
}
