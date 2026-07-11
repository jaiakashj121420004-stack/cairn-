/**
 * Pre-trade gate outcome applier (P0.7, docs/pre-trade-gate-popup.md §4/§6).
 *
 * Called after a live fill has been persisted. Binds the fill to a pending gate
 * plan (if any) and records the outcome on the trade row:
 *   - `clean`      — the fill fulfilled a compliant plan (within window + tolerance);
 *   - `breach_ack` — the fill matched an acknowledged-breach intent. A breach is
 *                    NEVER clean regardless of P&L (§2.3), so this also forces
 *                    `is_clean = 0` and appends the breach to `rules_broken`.
 * Returns the outcome, or null when no plan matched (caller leaves gate_outcome
 * n/a). The matched plan is consumed so it can't bind a second fill.
 */
import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { matchFillToPlan } from './matcher'
import { listPendingPlans } from './plan-store'
import type { PendingPlan } from './matcher'
import type { CairnDb } from '../../db/index'

/** rules_broken key recorded when a fill is bound to a breach intent. */
export const GATE_BREACH_RULE_KEY = 'pre_trade_gate_breach'

export interface FillContext {
  tradeId: string
  accountId: string
  pairId: string
  direction: string
  /** Actual fill entry as price ticks (round(price × 10^(pipDecimal+1))). */
  entryPriceTicks: number
  eventTimeMs: number
}

/** Append `key` to a JSON string array (rules_broken), de-duplicated. */
function appendBrokenRule(current: string | null, key: string): string {
  let list: unknown = []
  if (current) {
    try {
      list = JSON.parse(current)
    } catch {
      list = []
    }
  }
  const arr = Array.isArray(list) ? (list as unknown[]).map(String) : []
  if (!arr.includes(key)) arr.push(key)
  return JSON.stringify(arr)
}

export function applyGateOutcome(
  db: CairnDb,
  fill: FillContext,
  priceTolerancePips: number,
): 'clean' | 'breach_ack' | null {
  const rows = listPendingPlans(db, fill.accountId, fill.pairId, fill.direction)
  const plans: PendingPlan[] = rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    breachAck: r.breachAck,
    intendedEntry: r.intendedEntry,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }))

  const match = matchFillToPlan(
    {
      direction: fill.direction,
      entryPriceTicks: fill.entryPriceTicks,
      eventTimeMs: fill.eventTimeMs,
    },
    plans,
    priceTolerancePips,
  )
  if (!match) return null

  const now = Date.now()
  db.transaction(() => {
    db.update(schema.preTradePlans)
      .set({ status: 'consumed', consumedAt: now, consumedTradeId: fill.tradeId })
      .where(eq(schema.preTradePlans.id, match.plan.id))
      .run()

    if (match.outcome === 'clean') {
      db.update(schema.trades)
        .set({ gateOutcome: 'clean', updatedAt: now })
        .where(eq(schema.trades.id, fill.tradeId))
        .run()
    } else {
      const trade = db
        .select({ rulesBroken: schema.trades.rulesBroken })
        .from(schema.trades)
        .where(eq(schema.trades.id, fill.tradeId))
        .get()
      db.update(schema.trades)
        .set({
          gateOutcome: 'breach_ack',
          isClean: 0,
          rulesBroken: appendBrokenRule(trade?.rulesBroken ?? null, GATE_BREACH_RULE_KEY),
          updatedAt: now,
        })
        .where(eq(schema.trades.id, fill.tradeId))
        .run()
    }
  })

  return match.outcome
}

/**
 * Mark an already-persisted live trade as a SILENT breach (the trader never engaged
 * the gate) — used by the caller only when it knows the gate is active for a live,
 * non-imported fill with no matching plan. Never clean (§2.3).
 */
export function markSilentBreach(db: CairnDb, tradeId: string): void {
  const now = Date.now()
  const trade = db
    .select({ rulesBroken: schema.trades.rulesBroken })
    .from(schema.trades)
    .where(and(eq(schema.trades.id, tradeId)))
    .get()
  db.update(schema.trades)
    .set({
      gateOutcome: 'breach_silent',
      isClean: 0,
      rulesBroken: appendBrokenRule(trade?.rulesBroken ?? null, GATE_BREACH_RULE_KEY),
      updatedAt: now,
    })
    .where(eq(schema.trades.id, tradeId))
    .run()
}
