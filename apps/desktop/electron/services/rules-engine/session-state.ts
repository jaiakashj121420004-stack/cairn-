import { tradingDayEnd } from '../time/trading-day'
import { activeCooldownsNow } from './helpers'
import { getRule, listRules } from './registry'
import type { RuleContext, SessionStateDTO } from './types'

export function deriveSessionState(ctx: RuleContext): SessionStateDTO {
  const active = activeCooldownsNow(ctx.activeCooldowns, ctx.now)

  // Hard-lock rules: evaluate with no tradeInProgress to see if the session itself is locked.
  const hardLockCtx: RuleContext = { ...ctx, tradeInProgress: undefined }
  for (const r of listRules()) {
    if (!r.isHardLock) continue
    const cfg = ctx.accountRules.find((ar) => ar.ruleKey === r.key)
    if (!cfg || cfg.enabled !== 1) continue
    const parsedConfig = safeParseValue(cfg.value)
    const result = r.evaluate(hardLockCtx, parsedConfig)
    if (!result.passed) {
      return {
        state: 'locked',
        lockedReason: `${r.label}: ${result.message}`,
        unlockAt: tradingDayEnd(ctx.now, ctx.timeZone),
        activeCooldowns: active,
      }
    }
  }

  if (active.length > 0) {
    // Session is "active" but partially gated by cooldown — expose the cooldown expiry as unlockAt.
    const soonest = active.reduce((a, b) => (a.expiresAt < b.expiresAt ? a : b))
    return {
      state: 'active',
      lockedReason: null,
      unlockAt: soonest.expiresAt,
      activeCooldowns: active,
    }
  }

  if (ctx.currentSession === null) {
    return { state: 'idle', lockedReason: null, unlockAt: null, activeCooldowns: [] }
  }

  return { state: 'active', lockedReason: null, unlockAt: null, activeCooldowns: [] }
}

function safeParseValue(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

// Ensure tree-shakers retain getRule (used indirectly by other modules)
void getRule
