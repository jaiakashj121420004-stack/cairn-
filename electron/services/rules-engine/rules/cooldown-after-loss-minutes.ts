import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'
import { activeCooldownsNow } from '../helpers'

const configSchema = z.object({
  minutes: z.number().int().positive(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: cooldown_after_loss_minutes',
      canOverride: true,
    }
  }
  const active = activeCooldownsNow(ctx.activeCooldowns, ctx.now).filter(
    (c) => c.reason === 'post_loss',
  )
  if (active.length === 0) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'No active post-loss cooldown',
      canOverride: true,
    }
  }
  const soonest = active.reduce((a, b) => (a.expiresAt < b.expiresAt ? a : b))
  const minutesLeft = Math.max(1, Math.ceil((soonest.expiresAt - ctx.now) / 60_000))
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed: false,
    severity: 'blocking',
    message: `Cooldown active. ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} remaining.`,
    canOverride: false,
    suggestedAction: `Wait ${minutesLeft} more minute${minutesLeft === 1 ? '' : 's'}.`,
    contextSnapshot: { minutesLeft, configuredMinutes: parsed.data.minutes },
  }
}

export const rule: Rule = {
  key: 'cooldown_after_loss_minutes',
  label: 'Cooldown After Loss',
  description: 'Blocks new entries during the configured cool-down window after a loss.',
  category: 'behavior',
  severity: 'blocking',
  defaultConfig: { minutes: 30 },
  configSchema,
  evaluate,
}
