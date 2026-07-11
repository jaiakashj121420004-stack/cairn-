/**
 * Pre-trade gate plan store (P0.7). Owns the `pre_trade_plans` table lifecycle:
 * create a compliant plan (from the overlay's Confirm) or an acknowledged-breach
 * intent (from "Breach Rules"), list the pending plans for a fill, and expire stale
 * ones. Pure DB access — no clock is read except via the injected `now`, so it is
 * unit-tested against a sql.js database.
 */
import { and, eq, lt } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../db/schema'
import type { CairnDb } from '../../db/index'

/** Gate match tolerances (docs/pre-trade-gate-popup.md §5.1). Configurable in Settings. */
export interface GateConfig {
  /** How long a confirmed plan stays matchable (ms). */
  readonly matchWindowMs: number
  /** Max entry drift from the plan that still counts as clean (pips). */
  readonly priceTolerancePips: number
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  matchWindowMs: 5 * 60_000,
  priceTolerancePips: 5,
}

export const GATE_SETTING_WINDOW_MS = 'pre_trade_match_window_ms'
export const GATE_SETTING_TOLERANCE_PIPS = 'pre_trade_price_tolerance_pips'

type PlanRow = typeof schema.preTradePlans.$inferSelect

export interface CompliantPlanInput {
  accountId: string
  pairId: string
  direction: 'long' | 'short'
  /** Integer-encoded, exactly as the trades table stores them. */
  intendedEntry: number
  intendedSl: number
  intendedTp: number
  slPips: number
  rrRatio: number
  lotSize: number
  riskPctBps: number
  confluencesJson?: string | null
  invalidation?: string | null
}

export interface BreachAckInput {
  accountId: string
  pairId: string
  direction: 'long' | 'short'
}

/** Read the gate tolerances from settings, falling back to the defaults. */
export function getGateConfig(db: CairnDb): GateConfig {
  return {
    matchWindowMs: readNumberSetting(db, GATE_SETTING_WINDOW_MS, DEFAULT_GATE_CONFIG.matchWindowMs),
    priceTolerancePips: readNumberSetting(
      db,
      GATE_SETTING_TOLERANCE_PIPS,
      DEFAULT_GATE_CONFIG.priceTolerancePips,
    ),
  }
}

function readNumberSetting(db: CairnDb, key: string, fallback: number): number {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  if (!row) return fallback
  try {
    const parsed = JSON.parse(row.value)
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

/** Create a compliant pending plan (from the overlay Confirm). Returns the plan id. */
export function createCompliantPlan(
  db: CairnDb,
  input: CompliantPlanInput,
  matchWindowMs: number,
  now: number = Date.now(),
): string {
  const id = uuidv7()
  db.insert(schema.preTradePlans)
    .values({
      id,
      accountId: input.accountId,
      pairId: input.pairId,
      direction: input.direction,
      intendedEntry: input.intendedEntry,
      intendedSl: input.intendedSl,
      intendedTp: input.intendedTp,
      slPips: input.slPips,
      rrRatio: input.rrRatio,
      lotSize: input.lotSize,
      riskPctBps: input.riskPctBps,
      confluencesJson: input.confluencesJson ?? null,
      invalidation: input.invalidation ?? null,
      breachAck: 0,
      status: 'pending',
      expiresAt: now + matchWindowMs,
      createdAt: now,
      consumedAt: null,
      consumedTradeId: null,
    })
    .run()
  return id
}

/** Create an acknowledged-breach intent (from "Breach Rules"). Returns the plan id. */
export function createBreachAckIntent(
  db: CairnDb,
  input: BreachAckInput,
  matchWindowMs: number,
  now: number = Date.now(),
): string {
  const id = uuidv7()
  db.insert(schema.preTradePlans)
    .values({
      id,
      accountId: input.accountId,
      pairId: input.pairId,
      direction: input.direction,
      breachAck: 1,
      status: 'pending',
      expiresAt: now + matchWindowMs,
      createdAt: now,
    })
    .run()
  return id
}

/** Pending plans for a fill's (account, pair, direction). */
export function listPendingPlans(
  db: CairnDb,
  accountId: string,
  pairId: string,
  direction: string,
): PlanRow[] {
  return db
    .select()
    .from(schema.preTradePlans)
    .where(
      and(
        eq(schema.preTradePlans.accountId, accountId),
        eq(schema.preTradePlans.pairId, pairId),
        eq(schema.preTradePlans.direction, direction),
        eq(schema.preTradePlans.status, 'pending'),
      ),
    )
    .all()
}

/** Mark pending plans whose window has passed as expired. Returns the count. */
export function expireStalePlans(db: CairnDb, now: number = Date.now()): number {
  const stale = db
    .select({ id: schema.preTradePlans.id })
    .from(schema.preTradePlans)
    .where(and(eq(schema.preTradePlans.status, 'pending'), lt(schema.preTradePlans.expiresAt, now)))
    .all()
  if (stale.length === 0) return 0
  db.update(schema.preTradePlans)
    .set({ status: 'expired' })
    .where(and(eq(schema.preTradePlans.status, 'pending'), lt(schema.preTradePlans.expiresAt, now)))
    .run()
  return stale.length
}
