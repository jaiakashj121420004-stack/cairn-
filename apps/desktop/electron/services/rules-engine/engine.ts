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

export function evaluateAll(ctx: RuleContext): RuleEvaluation[] {
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

export function evaluatePreTrade(
  db: CairnDb,
  accountId: string,
  draft: DraftTrade,
  now?: number,
): RuleEvaluation[] {
  const ctx = buildContext(db, accountId, { draft, now })
  const evaluations = evaluateAll(ctx)
  recordEvaluations(db, accountId, null, evaluations, 'blocked')
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
      try {
        const parsed = JSON.parse(cfgRow.value) as { minutes?: number }
        const minutes = parsed.minutes ?? 30
        if (minutes > 0) {
          db.transaction(() => {
            insertCooldown(db, trade.accountId, 'post_loss', minutes * 60_000, ts)
          })
        }
      } catch {
        // malformed config — skip cooldown creation
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

  if (hasPct && pctCfg) {
    try {
      const cfg = JSON.parse(pctCfg.value) as { maxPct?: number }
      if (cfg.maxPct && cfg.maxPct > 0) {
        const account = db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.id, accountId))
          .get()
        if (account) {
          const limitCents = Math.floor((account.accountSizeCents * cfg.maxPct) / 10_000)
          if (lossCents >= limitCents) shouldLock = true
        }
      }
    } catch {
      /* malformed config */
    }
  }

  if (!shouldLock && hasFixed && fixedCfg) {
    try {
      const cfg = JSON.parse(fixedCfg.value) as { maxLossCents?: number }
      if (cfg.maxLossCents && cfg.maxLossCents > 0 && lossCents >= cfg.maxLossCents) {
        shouldLock = true
      }
    } catch {
      /* malformed config */
    }
  }

  if (!shouldLock) return

  const todayDateStr = tradingDayKey(ts, timeZone)
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
