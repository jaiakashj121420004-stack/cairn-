/**
 * Close-time planned-vs-actual detection.
 *
 * When a trade is being closed, Cairn compares the trade's *plan* (the immutable
 * entry/SL/TP/risk captured at creation) against what *actually* happened, and
 * pre-ticks the rules-broken checklist with detected violations. The trader
 * still confirms or unticks each one — honesty is preserved; recall friction is
 * removed.
 *
 * Source of "actual" values
 * ─────────────────────────
 * Cairn has no broker connection, so a trade's stored SL/TP/risk never change
 * after creation — they ARE the plan. The only way an SL/TP/lot differs from
 * plan is when the trader logged a modification through the real-time
 * modification gate (`evaluateModification`), which records the proposed value
 * in `rule_violations.contextJson` as `{ field, current, proposed }`. So the
 * "actual" SL/TP/lot is sourced from the most recent recorded modification for
 * that field. Detectors 4–6 (killzone, daily limit, circuit breaker) need no
 * modification record — they are computed fresh from the trade + context.
 *
 * Each detector below is a PURE function so it can be unit-tested in isolation;
 * `detectCloseViolations` is the DB-backed orchestrator that sources their
 * inputs and maps each hit to the checklist rule key it should pre-tick.
 */

import { and, eq, gte, isNull, lte, ne } from 'drizzle-orm'
import * as schema from '../../db/schema'
import type { CairnDb } from '../../db/index'
import { findEnclosingKillzone } from './helpers'
import {
  getConfiguredTimeZone,
  tradingDayEnd,
  tradingDayKey,
  tradingDayStart,
} from '../time/trading-day'
import type { KillzoneRecord } from './types'
import type { TradeDirection } from '../../../shared/types/index'

export interface DetectedViolation {
  /** Checklist rule key to pre-tick (matches a registry rule). */
  ruleKey: string
  /** Human-readable explanation of what diverged from plan. */
  detail: string
}

// ─── Pure detectors ─────────────────────────────────────────────────────────

/** SL widened: the actual stop sits further from entry than the planned stop.
 *  Long  → stop below entry, so widening = actual stop is lower than planned.
 *  Short → stop above entry, so widening = actual stop is higher than planned. */
export function detectSlWidened(p: {
  direction: TradeDirection
  plannedSl: number
  actualSl: number
}): boolean {
  return p.direction === 'long' ? p.actualSl < p.plannedSl : p.actualSl > p.plannedSl
}

/** TP narrowed: the actual target sits closer to entry than the planned target.
 *  Long  → target above entry, so narrowing = actual target is lower than planned.
 *  Short → target below entry, so narrowing = actual target is higher than planned. */
export function detectTpNarrowed(p: {
  direction: TradeDirection
  plannedTp: number
  actualTp: number
}): boolean {
  return p.direction === 'long' ? p.actualTp < p.plannedTp : p.actualTp > p.plannedTp
}

/** Risk increased mid-trade: actual risk exceeds planned risk by more than the
 *  threshold percentage. All integer math — no floats (§2.5). */
export function detectRiskIncreased(p: {
  plannedRiskCents: number
  actualRiskCents: number
  thresholdPct: number
}): boolean {
  if (p.plannedRiskCents <= 0) return false
  // actual > planned * (1 + threshold/100)  ⟺  actual*100 > planned*(100+threshold)
  return p.actualRiskCents * 100 > p.plannedRiskCents * (100 + p.thresholdPct)
}

/** Outside killzone: the entry timestamp falls inside no active killzone. */
export function detectOutsideKillzone(p: {
  entryTs: number
  killzones: KillzoneRecord[]
}): boolean {
  return findEnclosingKillzone(p.killzones, p.entryTs) === null
}

/** Daily trade limit exceeded: this trade is the (N+1)-th of the day, where N is
 *  the configured limit. `priorTradeCountToday` counts same-day non-cancelled
 *  trades placed strictly before this one. */
export function detectDailyLimitExceeded(p: {
  priorTradeCountToday: number
  maxTrades: number
}): boolean {
  if (p.maxTrades <= 0) return false
  return p.priorTradeCountToday + 1 > p.maxTrades
}

/** Circuit-breaker bypass: the session was locked by the loss breaker at or
 *  before the moment this trade was opened, yet the trade was still placed. */
export function detectCircuitBreakerBypassed(p: {
  sessionLockedAt: number | null
  tradeCreatedAt: number
}): boolean {
  return p.sessionLockedAt !== null && p.sessionLockedAt <= p.tradeCreatedAt
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const RISK_INCREASE_THRESHOLD_PCT = 10

export function detectCloseViolations(db: CairnDb, tradeId: string): DetectedViolation[] {
  const trade = db.select().from(schema.trades).where(eq(schema.trades.id, tradeId)).get()
  if (!trade) return []

  const rules = db
    .select()
    .from(schema.accountRules)
    .where(eq(schema.accountRules.accountId, trade.accountId))
    .all()
  const ruleByKey = new Map(rules.map((r) => [r.ruleKey, r]))

  /** A rule counts as active when its row is enabled, or — for rules added after
   *  some accounts were created (no_tp_narrowing) — when no row exists yet. */
  const isActive = (key: string, defaultWhenMissing = false): boolean => {
    const r = ruleByKey.get(key)
    if (!r) return defaultWhenMissing
    return r.enabled === 1
  }
  const config = (key: string): Record<string, unknown> | null => {
    const r = ruleByKey.get(key)
    if (!r) return null
    try {
      return JSON.parse(r.value) as Record<string, unknown>
    } catch {
      return null
    }
  }

  // Recorded modifications for this trade → latest proposed value per field.
  const violations = db
    .select()
    .from(schema.ruleViolations)
    .where(eq(schema.ruleViolations.tradeId, tradeId))
    .all()
  const latestProposedByField = (field: string): number | null => {
    let best: number | null = null
    let bestTs = -Infinity
    for (const v of violations) {
      try {
        const snap = JSON.parse(v.contextJson) as { field?: string; proposed?: unknown }
        if (snap.field === field && typeof snap.proposed === 'number' && v.createdAt >= bestTs) {
          best = snap.proposed
          bestTs = v.createdAt
        }
      } catch {
        /* ignore malformed snapshots */
      }
    }
    return best
  }

  const direction = trade.direction as TradeDirection
  const out: DetectedViolation[] = []

  // 1. SL widened
  if (isActive('no_sl_widening')) {
    const actualSl = latestProposedByField('stop_loss_price')
    if (
      actualSl !== null &&
      detectSlWidened({ direction, plannedSl: trade.stopLossPrice, actualSl })
    ) {
      out.push({
        ruleKey: 'no_sl_widening',
        detail: `Stop loss was moved from the plan (${trade.stopLossPrice}) to ${actualSl}, further from entry.`,
      })
    }
  }

  // 2. TP narrowed (default-active for accounts created before this rule existed)
  if (isActive('no_tp_narrowing', true)) {
    const actualTp = latestProposedByField('take_profit_price')
    if (
      actualTp !== null &&
      detectTpNarrowed({ direction, plannedTp: trade.takeProfitPrice, actualTp })
    ) {
      out.push({
        ruleKey: 'no_tp_narrowing',
        detail: `Take profit was moved from the plan (${trade.takeProfitPrice}) to ${actualTp}, closer to entry.`,
      })
    }
  }

  // 3. Risk increased mid-trade. Actual risk is derived from a recorded lot-size
  //    modification, scaled from the planned risk (risk ∝ lot at fixed stop).
  if (isActive('position_size_matches_plan') && trade.lotSize > 0) {
    const actualLot = latestProposedByField('lot_size')
    if (actualLot !== null) {
      const actualRiskCents = Math.round((trade.riskAmountCents * actualLot) / trade.lotSize)
      if (
        detectRiskIncreased({
          plannedRiskCents: trade.riskAmountCents,
          actualRiskCents,
          thresholdPct: RISK_INCREASE_THRESHOLD_PCT,
        })
      ) {
        out.push({
          ruleKey: 'position_size_matches_plan',
          detail: `Risk grew from the plan ($${(trade.riskAmountCents / 100).toFixed(2)}) to about $${(actualRiskCents / 100).toFixed(2)} after sizing up mid-trade.`,
        })
      }
    }
  }

  // 4. Traded outside listed killzones (live trades only — timing rule).
  if (trade.mode === 'live' && isActive('require_killzone')) {
    const killzones: KillzoneRecord[] = db
      .select()
      .from(schema.killzones)
      .all()
      .map((k) => ({
        id: k.id,
        name: k.name,
        startTimeUtc: k.startTimeUtc,
        endTimeUtc: k.endTimeUtc,
        active: k.active,
      }))
    const entryTs = trade.openedAt ?? trade.actualEntryTime ?? trade.createdAt
    if (detectOutsideKillzone({ entryTs, killzones })) {
      out.push({
        ruleKey: 'require_killzone',
        detail: 'Entry timestamp falls outside every listed killzone.',
      })
    }
  }

  // 5. Daily trade limit exceeded.
  if (isActive('max_trades_per_day')) {
    const maxTrades = config('max_trades_per_day')?.maxTrades
    if (typeof maxTrades === 'number' && maxTrades > 0) {
      const timeZone = getConfiguredTimeZone(db)
      const dayStart = tradingDayStart(trade.createdAt, timeZone)
      const dayEnd = tradingDayEnd(trade.createdAt, timeZone)
      const priorTradeCountToday = db
        .select({ id: schema.trades.id })
        .from(schema.trades)
        .where(
          and(
            eq(schema.trades.accountId, trade.accountId),
            gte(schema.trades.createdAt, dayStart),
            lte(schema.trades.createdAt, dayEnd),
            isNull(schema.trades.deletedAt),
            ne(schema.trades.status, 'cancelled'),
            ne(schema.trades.id, tradeId),
            lte(schema.trades.createdAt, trade.createdAt - 1),
          ),
        )
        .all().length
      if (detectDailyLimitExceeded({ priorTradeCountToday, maxTrades })) {
        out.push({
          ruleKey: 'max_trades_per_day',
          detail: `This was trade ${priorTradeCountToday + 1} of the day, past your ${maxTrades}/day limit.`,
        })
      }
    }
  }

  // 6. Circuit breaker tripped earlier and the trade was placed anyway.
  if (isActive('max_daily_loss_pct') || isActive('max_daily_loss_fixed')) {
    const timeZone = getConfiguredTimeZone(db)
    const dayKey = tradingDayKey(trade.createdAt, timeZone)
    const session = db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.accountId, trade.accountId),
          eq(schema.sessions.sessionDate, dayKey),
        ),
      )
      .get()
    if (
      session &&
      detectCircuitBreakerBypassed({
        sessionLockedAt: session.lockedAt,
        tradeCreatedAt: trade.createdAt,
      })
    ) {
      out.push({
        ruleKey: 'max_daily_loss_pct',
        detail: 'The daily-loss circuit breaker had already locked the session when this trade was opened.',
      })
    }
  }

  return out
}
