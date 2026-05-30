import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'
import { findEnclosingKillzone } from '../helpers'

const configSchema = z.object({
  zoneIds: z.array(z.string()).optional(),
  zoneNames: z.array(z.string()).optional(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: require_killzone',
      canOverride: true,
    }
  }
  const draft = ctx.tradeInProgress
  if (!draft) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'No pending trade',
      canOverride: true,
    }
  }
  // Sim/backtest trades have no live exposure — killzone timing is not enforced.
  if (ctx.mode !== 'live') {
    return { ruleKey: rule.key, ruleLabel: rule.label, passed: true, severity: 'info', message: 'Killzone check skipped for non-live mode', canOverride: true }
  }
  const ts = draft.timestamp ?? ctx.now
  const current = findEnclosingKillzone(ctx.killzones, ts)
  const ids = parsed.data.zoneIds
  const names = parsed.data.zoneNames
  let passed: boolean
  if (!current) {
    passed = false
  } else if ((!ids || ids.length === 0) && (!names || names.length === 0)) {
    passed = true
  } else {
    const matchId = ids ? ids.includes(current.id) : false
    const matchName = names ? names.includes(current.name) : false
    passed = matchId || matchName
  }
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? `Inside killzone${current ? ` (${current.name})` : ''}`
      : 'Entry is outside allowed killzones.',
    canOverride: true,
    suggestedAction: passed ? undefined : 'Wait for an allowed killzone.',
    contextSnapshot: { currentKillzone: current?.name ?? null },
  }
}

export const rule: Rule = {
  key: 'require_killzone',
  label: 'Require Killzone',
  description: 'Blocks entries outside the configured killzones.',
  category: 'timing',
  severity: 'blocking',
  defaultConfig: { zoneNames: ['London', 'NY AM'] },
  configSchema,
  evaluate,
}
