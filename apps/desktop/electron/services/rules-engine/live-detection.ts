/**
 * Live broker detection — prevention, finally, in real time (Wave 4).
 * Spec: `docs/broker-integration.md` §5; principle: prevention over detection
 * (CLAUDE.md §2.1, §14 #14, #40).
 *
 * Cairn cannot block an order that is already live at the broker. What it CAN do
 * is feed the SAME rule engine the live position and raise a non-blocking,
 * mentor-voice warning the instant a planned-vs-actual divergence breaches a rule
 * — a stop widened, a position sized up, a target cut, an over-trade, a trade
 * past the loss-circuit-breaker, an entry outside the killzones.
 *
 * This is NOT a parallel rule implementation. The breach tests are the very pure
 * detectors `close-detection.ts` already uses for the close-time rules-broken
 * checklist (`detectSlWidened`, `detectTpNarrowed`, `detectSizeIncreased`,
 * `detectDailyLimitExceeded`, `detectCircuitBreakerBypassed`,
 * `detectOutsideKillzone`). Only the SOURCE of the "actual" value differs: there
 * it comes from a recorded manual modification; here it comes from the live
 * {@link BrokerEvent}. The rules and the rule keys stay the engine's.
 *
 * Baseline (the "plan" to measure against), per spec §5:
 *  - If the trader logged a Cairn pre-trade draft (a `status = 'planned'` trade)
 *    for the same account + pair + direction shortly before the fill, that draft's
 *    plan is the baseline — the real intent is used.
 *  - Otherwise the FIRST observed SL/TP/size (the `position_opened` event) is the
 *    baseline; subsequent modifications are measured against it.
 *
 * Output: each breach is persisted as a `rule_violations` row (severity
 * `warning`, outcome `detected_live`) so it shows up in analytics and at
 * reflection time, and returned to the caller (the ingest service) so it can
 * surface a calm toast/log. Detections are warnings, never blocks.
 */

import { and, desc, eq, gte, isNull, lte, ne } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../db/schema'
import {
  getConfiguredTimeZone,
  tradingDayEnd,
  tradingDayKey,
  tradingDayStart,
} from '../time/trading-day'
import {
  detectCircuitBreakerBypassed,
  detectDailyLimitExceeded,
  detectOutsideKillzone,
  detectSizeIncreased,
  detectSlWidened,
  detectTpNarrowed,
} from './close-detection'
import type { KillzoneRecord } from './types'
import type { TradeDirection } from '../../../shared/types/index'
import type { CairnDb } from '../../db/index'
import type { BrokerEvent } from '@cairn/shared-types'

/** Tolerance before a mid-trade size increase counts as a breach (percent). */
const SIZE_INCREASE_THRESHOLD_PCT = 10

/** How far before a fill a logged draft may sit and still be its plan (15 min). */
const DRAFT_LINK_WINDOW_MS = 15 * 60_000

/** A single non-blocking breach observed on a live position. */
export interface LiveWarning {
  /** Engine rule key the breach maps to (matches the registry / checklist). */
  ruleKey: string
  /** Calm, mentor-voice line for the toast/log (CLAUDE.md §1 voice). */
  message: string
  /** Machine-readable explanation persisted in `rule_violations.contextJson`. */
  detail: string
}

/** The baseline a live position is measured against (broker-native numbers). */
interface LiveBaseline {
  direction: TradeDirection
  stopLoss: number | null
  takeProfit: number | null
  volumeLots: number
  /** 'draft' = a linked pre-trade plan; 'observed' = the first seen open. */
  source: 'draft' | 'observed'
}

/** Context the ingest service supplies once the live trade row exists. */
export interface LiveDetectionContext {
  /** Cairn account the fill is attributed to. */
  accountId: string
  /** Cairn trade row id (already upserted by ingest) for the violation FK. */
  tradeId: string
  /** Resolved Cairn pair id (to match a logged draft). */
  pairId: string
  /** Pair pip decimals — decodes a draft's integer prices back to broker units. */
  pipDecimal: number
}

export interface LiveDetectionDeps {
  db: CairnDb
  /** Wall-clock provider (injected for deterministic tests). */
  now: () => number
}

export interface LiveDetectionService {
  /**
   * Evaluate one live event against the account's rules. Persists a
   * `rule_violations` row per breach and returns the warnings to surface.
   * Only `position_opened` / `position_modified` carry divergence; anything else
   * returns `[]`. Never throws — a detection fault must not interrupt capture.
   */
  evaluate(event: BrokerEvent, ctx: LiveDetectionContext): LiveWarning[]
}

export function createLiveDetectionService(deps: LiveDetectionDeps): LiveDetectionService {
  const { db, now } = deps

  /** First-observed (or draft-linked) baseline per broker position. */
  const baselines = new Map<string, LiveBaseline>()

  /** Enabled-state of an account rule. `defaultWhenMissing` covers rules added
   *  after some accounts were created (mirrors close-detection.ts). */
  function ruleLookup(accountId: string) {
    const rows = db
      .select()
      .from(schema.accountRules)
      .where(eq(schema.accountRules.accountId, accountId))
      .all()
    const byKey = new Map(rows.map((r) => [r.ruleKey, r]))
    return {
      isActive(key: string, defaultWhenMissing = false): boolean {
        const r = byKey.get(key)
        if (!r) return defaultWhenMissing
        return r.enabled === 1
      },
      config(key: string): Record<string, unknown> | null {
        const r = byKey.get(key)
        if (!r) return null
        try {
          return JSON.parse(r.value) as Record<string, unknown>
        } catch {
          return null
        }
      },
    }
  }

  /** Find a Cairn pre-trade draft to measure this fill against (spec §5). */
  function findLinkedDraft(
    ctx: LiveDetectionContext,
    direction: TradeDirection,
    fillTimeMs: number,
  ): LiveBaseline | null {
    const draft = db
      .select({
        stopLossPrice: schema.trades.stopLossPrice,
        takeProfitPrice: schema.trades.takeProfitPrice,
        lotSize: schema.trades.lotSize,
      })
      .from(schema.trades)
      .where(
        and(
          eq(schema.trades.accountId, ctx.accountId),
          eq(schema.trades.pairId, ctx.pairId),
          eq(schema.trades.direction, direction),
          eq(schema.trades.status, 'planned'),
          gte(schema.trades.createdAt, fillTimeMs - DRAFT_LINK_WINDOW_MS),
          lte(schema.trades.createdAt, fillTimeMs),
          isNull(schema.trades.deletedAt),
        ),
      )
      .orderBy(desc(schema.trades.createdAt))
      .get()
    if (!draft) return null

    // Decode the draft's integer-encoded plan back to broker-native numbers so it
    // compares directly against the live event's prices/lots.
    const unit = Math.pow(10, ctx.pipDecimal + 1)
    return {
      direction,
      stopLoss: draft.stopLossPrice / unit,
      takeProfit: draft.takeProfitPrice / unit,
      volumeLots: draft.lotSize / 100,
      source: 'draft',
    }
  }

  /** SL-widen / TP-cut / size-up against a baseline (runs on a modify, and on an
   *  open that already diverged from a linked draft plan). */
  function divergenceWarnings(
    event: BrokerEvent,
    baseline: LiveBaseline,
    rules: ReturnType<typeof ruleLookup>,
  ): LiveWarning[] {
    const out: LiveWarning[] = []
    const direction = baseline.direction

    if (
      rules.isActive('no_sl_widening') &&
      baseline.stopLoss !== null &&
      event.stopLoss !== null &&
      detectSlWidened({ direction, plannedSl: baseline.stopLoss, actualSl: event.stopLoss })
    ) {
      out.push({
        ruleKey: 'no_sl_widening',
        message: `Stop moved against you on ${event.symbol}. Widening your stop breaks "No SL Widening" on this account.`,
        detail: `Stop moved from the ${baseline.source === 'draft' ? 'planned' : 'opening'} ${baseline.stopLoss} to ${event.stopLoss}, further from entry.`,
      })
    }

    if (
      rules.isActive('no_tp_narrowing', true) &&
      baseline.takeProfit !== null &&
      event.takeProfit !== null &&
      detectTpNarrowed({ direction, plannedTp: baseline.takeProfit, actualTp: event.takeProfit })
    ) {
      out.push({
        ruleKey: 'no_tp_narrowing',
        message: `Target pulled in on ${event.symbol}. Cutting your take-profit toward entry breaks "No TP Narrowing" on this account.`,
        detail: `Target moved from the ${baseline.source === 'draft' ? 'planned' : 'opening'} ${baseline.takeProfit} to ${event.takeProfit}, closer to entry.`,
      })
    }

    if (
      rules.isActive('position_size_matches_plan') &&
      detectSizeIncreased({
        baselineLots: baseline.volumeLots,
        actualLots: event.volumeLots,
        thresholdPct: SIZE_INCREASE_THRESHOLD_PCT,
      })
    ) {
      out.push({
        ruleKey: 'position_size_matches_plan',
        message: `Size increased mid-trade on ${event.symbol}. This position is now larger than your ${baseline.source === 'draft' ? 'plan' : 'opening size'}.`,
        detail: `Size grew from ${baseline.volumeLots} to ${event.volumeLots} lots, past the ${SIZE_INCREASE_THRESHOLD_PCT}% tolerance.`,
      })
    }

    return out
  }

  /** Killzone / daily-limit / circuit-breaker — properties of the ENTRY, so only
   *  evaluated when the position opens (re-firing them on every modify would
   *  double-log the same entry breach). */
  function entryWarnings(
    event: BrokerEvent,
    ctx: LiveDetectionContext,
    rules: ReturnType<typeof ruleLookup>,
  ): LiveWarning[] {
    const out: LiveWarning[] = []
    const nowMs = now()
    const timeZone = getConfiguredTimeZone(db)

    // Outside killzone — use the broker fill time (the true entry moment), UTC.
    if (rules.isActive('require_killzone')) {
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
      if (detectOutsideKillzone({ entryTs: event.eventTimeMs, killzones })) {
        out.push({
          ruleKey: 'require_killzone',
          message: `${event.symbol} entered outside your killzones.`,
          detail: 'The fill time falls inside no active killzone.',
        })
      }
    }

    // Over-trade — this fill is past the account's daily-trade limit.
    if (rules.isActive('max_trades_per_day')) {
      const maxTrades = rules.config('max_trades_per_day')?.maxTrades
      if (typeof maxTrades === 'number' && maxTrades > 0) {
        const dayStart = tradingDayStart(nowMs, timeZone)
        const dayEnd = tradingDayEnd(nowMs, timeZone)
        const priorTradeCountToday = db
          .select({ id: schema.trades.id })
          .from(schema.trades)
          .where(
            and(
              eq(schema.trades.accountId, ctx.accountId),
              gte(schema.trades.createdAt, dayStart),
              lte(schema.trades.createdAt, dayEnd),
              isNull(schema.trades.deletedAt),
              ne(schema.trades.status, 'cancelled'),
              ne(schema.trades.id, ctx.tradeId),
            ),
          )
          .all().length
        if (detectDailyLimitExceeded({ priorTradeCountToday, maxTrades })) {
          out.push({
            ruleKey: 'max_trades_per_day',
            message: `That is trade ${priorTradeCountToday + 1} of the day on ${event.symbol}, past your ${maxTrades}/day limit.`,
            detail: `${priorTradeCountToday} trades already taken today; the limit is ${maxTrades}.`,
          })
        }
      }
    }

    // Circuit breaker — the loss limit already locked this session, yet a fill
    // arrived. Cairn cannot stop it, but it records the breach.
    if (rules.isActive('max_daily_loss_pct') || rules.isActive('max_daily_loss_fixed')) {
      const dayKey = tradingDayKey(nowMs, timeZone)
      const session = db
        .select({ lockedAt: schema.sessions.lockedAt })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.accountId, ctx.accountId),
            eq(schema.sessions.sessionDate, dayKey),
          ),
        )
        .get()
      if (
        session &&
        detectCircuitBreakerBypassed({
          sessionLockedAt: session.lockedAt,
          tradeCreatedAt: nowMs,
        })
      ) {
        out.push({
          ruleKey: 'max_daily_loss_pct',
          message: `The daily-loss limit already locked this session. ${event.symbol} was opened past your circuit breaker.`,
          detail: 'The max-daily-loss circuit breaker had already tripped when this fill arrived.',
        })
      }
    }

    return out
  }

  /** Persist warnings as `rule_violations`, deduping per (trade, rule) so a
   *  reconnect replay of the same event never multiplies rows. */
  function persist(ctx: LiveDetectionContext, warnings: LiveWarning[]): void {
    if (warnings.length === 0) return
    const ts = now()
    const existing = db
      .select({ ruleKey: schema.ruleViolations.ruleKey })
      .from(schema.ruleViolations)
      .where(
        and(
          eq(schema.ruleViolations.tradeId, ctx.tradeId),
          eq(schema.ruleViolations.outcome, 'detected_live'),
        ),
      )
      .all()
    const already = new Set(existing.map((r) => r.ruleKey))

    db.transaction(() => {
      for (const w of warnings) {
        if (already.has(w.ruleKey)) continue
        already.add(w.ruleKey)
        db.insert(schema.ruleViolations)
          .values({
            id: uuidv7(),
            accountId: ctx.accountId,
            tradeId: ctx.tradeId,
            ruleKey: w.ruleKey,
            severity: 'warning',
            outcome: 'detected_live',
            contextJson: JSON.stringify({ live: true, detail: w.detail }),
            createdAt: ts,
          })
          .run()
      }
    })
  }

  function evaluate(event: BrokerEvent, ctx: LiveDetectionContext): LiveWarning[] {
    if (event.type !== 'position_opened' && event.type !== 'position_modified') return []

    try {
      const rules = ruleLookup(ctx.accountId)
      const warnings: LiveWarning[] = []

      if (event.type === 'position_opened') {
        // Establish the baseline: a linked draft plan, else the open itself.
        const baseline =
          findLinkedDraft(ctx, event.direction, event.eventTimeMs) ??
          ({
            direction: event.direction,
            stopLoss: event.stopLoss,
            takeProfit: event.takeProfit,
            volumeLots: event.volumeLots,
            source: 'observed',
          } satisfies LiveBaseline)
        baselines.set(event.brokerTradeId, baseline)

        // Entry-time rules always run on open. Divergence only when the open
        // already differs from a linked plan (an observed baseline equals the
        // open, so it can never diverge from itself).
        warnings.push(...entryWarnings(event, ctx, rules))
        if (baseline.source === 'draft') {
          warnings.push(...divergenceWarnings(event, baseline, rules))
        }
      } else {
        // position_modified: measure the change against the stored baseline. If
        // the baseline was lost (e.g. restart), seed it and skip — there is
        // nothing yet to diverge from.
        let baseline = baselines.get(event.brokerTradeId)
        if (!baseline) {
          baseline = {
            direction: event.direction,
            stopLoss: event.stopLoss,
            takeProfit: event.takeProfit,
            volumeLots: event.volumeLots,
            source: 'observed',
          }
          baselines.set(event.brokerTradeId, baseline)
        } else {
          warnings.push(...divergenceWarnings(event, baseline, rules))
        }
      }

      persist(ctx, warnings)
      return warnings
    } catch {
      // Detection is best-effort; a fault must never interrupt capture (job #2).
      return []
    }
  }

  return { evaluate }
}
