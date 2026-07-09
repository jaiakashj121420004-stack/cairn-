import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../db/schema'
import {
  getConfiguredTimeZone,
  tradingDayEnd,
  tradingDayKey,
  tradingDayStart,
} from '../time/trading-day'
import { buildContext } from './context-builder'
import { insertCooldown } from './cooldowns'
import { parseRuleConfig } from './guardrail'
import { listRules, getRule } from './registry'
import { deriveSessionState } from './session-state'
import {
  OVERRIDE_ACK_PHRASE,
  OVERRIDE_MIN_REASON_CHARS,
  type DraftTrade,
  type OverrideInput,
  type Rule,
  type RuleContext,
  type RuleEvaluation,
  type SessionStateDTO,
  type TradeModification,
} from './types'
import type { CairnDb } from '../../db/index'

const SEVERITY_RANK: Record<RuleEvaluation['severity'], number> = {
  blocking: 0,
  warning: 1,
  info: 2,
}

/**
 * Synthetic rule key for a persisted daily-loss circuit-breaker lock
 * (`daily_locks`, migration 0017). Not a registered {@link Rule} — it is a
 * system-level lock produced by {@link checkAndLockSession}, not a
 * user-configurable account rule, so it is never listed by `rules:listAvailable`
 * and never subject to per-account enable/disable.
 */
export const DAILY_LOCK_RULE_KEY = 'daily_loss_circuit_breaker'

export function evaluateAll(ctx: RuleContext): RuleEvaluation[] {
  // A persisted circuit-breaker lock for today is definitive: the trading day
  // is over regardless of which account-rules are currently enabled or what a
  // fresh sum of today's trades would say. Short-circuits everything else,
  // exactly like a hard lock, and can never be overridden (§14 #13).
  if (ctx.dailyLock) {
    return [
      {
        ruleKey: DAILY_LOCK_RULE_KEY,
        ruleLabel: 'Daily Loss Circuit Breaker',
        passed: false,
        severity: 'blocking',
        message: `Trading is locked for the rest of today: ${ctx.dailyLock.reason}`,
        canOverride: false,
        contextSnapshot: {
          trigger: 'daily_lock',
          reason: ctx.dailyLock.reason,
          lockedAt: ctx.dailyLock.createdAt,
        },
      },
    ]
  }

  const evaluations: RuleEvaluation[] = []
  const enabledByKey = new Map(ctx.accountRules.map((ar) => [ar.ruleKey, ar]))

  // Hard locks first. If any hard lock fails, short-circuit: remaining rules do not run.
  const rules = listRules()
  const hardLocks = rules.filter((r) => r.isHardLock)
  const normals = rules.filter((r) => !r.isHardLock)

  let hardLockFailed = false
  for (const r of hardLocks) {
    const cfg = enabledByKey.get(r.key)
    if (!cfg || cfg.enabled !== 1) continue
    const result = runRule(r, ctx, cfg.value)
    evaluations.push(result)
    if (!result.passed) hardLockFailed = true
  }

  if (!hardLockFailed) {
    for (const r of normals) {
      const cfg = enabledByKey.get(r.key)
      if (!cfg || cfg.enabled !== 1) continue
      const result = runRule(r, ctx, cfg.value)
      evaluations.push(result)
    }
  }

  return evaluations.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

function runRule(r: Rule, ctx: RuleContext, rawConfig: string): RuleEvaluation {
  let config: unknown = null
  try {
    config = JSON.parse(rawConfig)
  } catch {
    config = null
  }
  try {
    return r.evaluate(ctx, config)
  } catch (err) {
    return {
      ruleKey: r.key,
      ruleLabel: r.label,
      passed: false,
      severity: 'warning',
      message: `Rule crashed: ${(err as Error).message}`,
      canOverride: true,
    }
  }
}

/**
 * Full pre-trade rule evaluation. Used both by the live pre-trade panel gate
 * (no `tradeId` — the trade does not exist yet) and by draft activation
 * (`trades:setOpen` passes the draft's `tradeId` so any recorded violation is
 * linked to the trade being activated). One code path, one rule set.
 */
export function evaluatePreTrade(
  db: CairnDb,
  accountId: string,
  draft: DraftTrade,
  now?: number,
  tradeId: string | null = null,
): RuleEvaluation[] {
  const ctx = buildContext(db, accountId, { draft, now })
  const evaluations = evaluateAll(ctx)
  recordEvaluations(db, accountId, tradeId, evaluations, 'blocked')
  return evaluations
}

export function evaluateModification(
  db: CairnDb,
  accountId: string,
  tradeId: string,
  modification: TradeModification,
  now?: number,
): RuleEvaluation[] {
  const ctx = buildContext(db, accountId, {
    modification,
    tradeUnderModificationId: tradeId,
    now,
  })
  const evaluations = evaluateAll(ctx)
  recordEvaluations(db, accountId, tradeId, evaluations, 'logged_post_hoc')
  return evaluations
}

export function getSessionState(db: CairnDb, accountId: string, now?: number): SessionStateDTO {
  const ctx = buildContext(db, accountId, { now })
  return deriveSessionState(ctx)
}

export function recordOverride(db: CairnDb, input: OverrideInput, now?: number): void {
  if (input.ack !== OVERRIDE_ACK_PHRASE) {
    throw new Error(`Override requires typing ${OVERRIDE_ACK_PHRASE} exactly.`)
  }
  if (input.reason.trim().length < OVERRIDE_MIN_REASON_CHARS) {
    throw new Error(`Override reason must be at least ${OVERRIDE_MIN_REASON_CHARS} characters.`)
  }
  const r = getRule(input.ruleKey)
  if (r?.isHardLock) {
    throw new Error('This rule cannot be overridden.')
  }
  const ts = now ?? Date.now()
  db.insert(schema.ruleViolations)
    .values({
      id: uuidv7(),
      accountId: input.accountId,
      tradeId: input.tradeId ?? null,
      ruleKey: input.ruleKey,
      severity: 'blocking',
      outcome: 'user_overrode',
      contextJson: JSON.stringify({ reason: input.reason, ack: input.ack }),
      createdAt: ts,
    })
    .run()
}

export function onTradeClosed(db: CairnDb, tradeId: string, now?: number): void {
  const trade = db.select().from(schema.trades).where(eq(schema.trades.id, tradeId)).get()
  if (!trade || trade.pnlCents === null) return
  const ts = now ?? Date.now()

  if (trade.pnlCents < 0) {
    const cfgRow = db
      .select()
      .from(schema.accountRules)
      .where(
        and(
          eq(schema.accountRules.accountId, trade.accountId),
          eq(schema.accountRules.ruleKey, 'cooldown_after_loss_minutes'),
        ),
      )
      .get()
    if (cfgRow && cfgRow.enabled === 1) {
      const parsed = parseRuleConfig<{ minutes?: number }>(
        cfgRow.value,
        'cooldown_after_loss_minutes',
        'onTradeClosed',
      )
      if (parsed) {
        const minutes = parsed.minutes ?? 30
        if (minutes > 0) {
          db.transaction(() => {
            insertCooldown(db, trade.accountId, 'post_loss', minutes * 60_000, ts)
          })
        }
      }
    }
  }

  // Circuit breaker: lock today's session if cumulative daily loss limit is hit
  checkAndLockSession(db, trade.accountId, ts)
}

function checkAndLockSession(db: CairnDb, accountId: string, ts: number): void {
  const pctCfg = db
    .select()
    .from(schema.accountRules)
    .where(
      and(
        eq(schema.accountRules.accountId, accountId),
        eq(schema.accountRules.ruleKey, 'max_daily_loss_pct'),
      ),
    )
    .get()
  const fixedCfg = db
    .select()
    .from(schema.accountRules)
    .where(
      and(
        eq(schema.accountRules.accountId, accountId),
        eq(schema.accountRules.ruleKey, 'max_daily_loss_fixed'),
      ),
    )
    .get()

  const hasPct = pctCfg && pctCfg.enabled === 1
  const hasFixed = fixedCfg && fixedCfg.enabled === 1
  if (!hasPct && !hasFixed) return

  const timeZone = getConfiguredTimeZone(db)
  const todayStart = tradingDayStart(ts, timeZone)
  const todayEnd = tradingDayEnd(ts, timeZone)
  const tradesToday = db
    .select()
    .from(schema.trades)
    .where(
      and(
        eq(schema.trades.accountId, accountId),
        gte(schema.trades.createdAt, todayStart),
        lte(schema.trades.createdAt, todayEnd),
        isNull(schema.trades.deletedAt),
      ),
    )
    .all()

  const realizedCents = tradesToday.reduce((sum, t) => sum + (t.pnlCents ?? 0), 0)
  const lossCents = Math.max(0, -realizedCents)
  if (lossCents === 0) return

  let shouldLock = false
  let lockReason = 'daily loss limit reached'

  if (hasPct && pctCfg) {
    const cfg = parseRuleConfig<{ maxPct?: number }>(
      pctCfg.value,
      'max_daily_loss_pct',
      'checkAndLockSession',
    )
    if (cfg?.maxPct && cfg.maxPct > 0) {
      const account = db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, accountId))
        .get()
      if (account) {
        const limitCents = Math.floor((account.accountSizeCents * cfg.maxPct) / 10_000)
        if (lossCents >= limitCents) {
          shouldLock = true
          lockReason = `max daily loss % breached (${lossCents}¢ >= ${limitCents}¢ limit)`
        }
      }
    }
  }

  if (!shouldLock && hasFixed && fixedCfg) {
    const cfg = parseRuleConfig<{ maxLossCents?: number }>(
      fixedCfg.value,
      'max_daily_loss_fixed',
      'checkAndLockSession',
    )
    if (cfg?.maxLossCents && cfg.maxLossCents > 0 && lossCents >= cfg.maxLossCents) {
      shouldLock = true
      lockReason = `max daily loss $ breached (${lossCents}¢ >= ${cfg.maxLossCents}¢ limit)`
    }
  }

  if (!shouldLock) return

  const todayDateStr = tradingDayKey(ts, timeZone)

  // Persist the lock of record independent of whether a `sessions` row exists
  // (migration 0017 `daily_locks`) — `sessions.daily_bias` and its siblings are
  // NOT NULL with no default, so a bare lock cannot always be expressed as a
  // session row (the trader may never have logged today's bias). The rules
  // engine consults this table on every subsequent pre-trade evaluation this
  // trading day (context-builder.ts -> RuleContext.dailyLock,
  // engine.ts#evaluateAll) and session-state.ts folds it into the
  // session-locked UI state. onConflictDoNothing: the lock is a fact about the
  // FIRST breach — a later trade close the same locked day must not move its
  // reason/timestamp.
  db.insert(schema.dailyLocks)
    .values({
      id: uuidv7(),
      accountId,
      tradingDay: todayDateStr,
      reason: lockReason,
      createdAt: ts,
    })
    .onConflictDoNothing({ target: [schema.dailyLocks.accountId, schema.dailyLocks.tradingDay] })
    .run()

  // Existing behavior, preserved: when a session row already exists for today
  // and isn't locked yet, stamp it too (drives the Dashboard / SessionBiasModal
  // "session locked" UI, which reads sessions.locked_at directly).
  const session = db
    .select()
    .from(schema.sessions)
    .where(
      and(eq(schema.sessions.accountId, accountId), eq(schema.sessions.sessionDate, todayDateStr)),
    )
    .get()

  if (session && !session.lockedAt) {
    db.update(schema.sessions)
      .set({ lockedAt: ts, updatedAt: ts })
      .where(eq(schema.sessions.id, session.id))
      .run()
  }
}

function recordEvaluations(
  db: CairnDb,
  accountId: string,
  tradeId: string | null,
  evaluations: RuleEvaluation[],
  defaultOutcome: 'blocked' | 'logged_post_hoc',
): void {
  const violations = evaluations.filter((e) => !e.passed)
  if (violations.length === 0) return
  const now = Date.now()
  db.transaction(() => {
    for (const v of violations) {
      db.insert(schema.ruleViolations)
        .values({
          id: uuidv7(),
          accountId,
          tradeId,
          ruleKey: v.ruleKey,
          severity: v.severity === 'info' ? 'logged' : v.severity,
          outcome: defaultOutcome,
          contextJson: JSON.stringify(v.contextSnapshot ?? {}),
          createdAt: now,
        })
        .run()
    }
  })
}
