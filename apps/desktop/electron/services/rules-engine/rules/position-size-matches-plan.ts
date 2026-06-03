import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({
  tolerancePct: z.number().int().nonnegative(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: position_size_matches_plan',
      canOverride: true,
    }
  }
  const tolerancePct = parsed.data.tolerancePct

  // Real-time hook: sizing up mid-trade. When a lot-size modification is
  // evaluated, compare the proposed lot against the *plan* (the immutable lot the
  // trade was opened with) and record it so the close-time risk-increase detector
  // can surface it. This is the live counterpart to detector #3 in
  // close-detection.ts (prevention over detection, §14 #14).
  const mod = ctx.tradeModification
  const target = ctx.tradeUnderModification
  if (mod && target && mod.field === 'lot_size') {
    const plannedLot = target.lotSize
    if (plannedLot <= 0) {
      return {
        ruleKey: rule.key,
        ruleLabel: rule.label,
        passed: true,
        severity: 'info',
        message: 'No planned lot size to compare',
        canOverride: true,
      }
    }
    const allowedDelta = Math.ceil((plannedLot * tolerancePct) / 100)
    const passed = Math.abs(mod.newValue - plannedLot) <= allowedDelta
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed,
      severity: passed ? 'info' : 'warning',
      message: passed
        ? 'Lot still matches plan'
        : `Lot ${(mod.newValue / 100).toFixed(2)} differs from plan ${(plannedLot / 100).toFixed(2)} by more than ${tolerancePct}%`,
      canOverride: true,
      suggestedAction: passed
        ? undefined
        : 'Return to your planned size, or accept the higher risk consciously.',
      contextSnapshot: {
        field: 'lot_size',
        current: plannedLot,
        proposed: mod.newValue,
        tolerancePct,
      },
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
  const planned = draft.plannedLotSize
  if (planned === undefined || planned === 0) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'No planned lot size to compare',
      canOverride: true,
    }
  }
  const delta = Math.abs(draft.lotSize - planned)
  const allowed = Math.ceil((planned * tolerancePct) / 100)
  const passed = delta <= allowed
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'warning',
    message: passed
      ? 'Actual lot matches plan'
      : `Actual lot ${(draft.lotSize / 100).toFixed(2)} differs from plan ${(planned / 100).toFixed(2)} by more than ${tolerancePct}%`,
    canOverride: true,
    contextSnapshot: { actual: draft.lotSize, planned, tolerancePct },
  }
}

export const rule: Rule = {
  key: 'position_size_matches_plan',
  label: 'Position Size Matches Plan',
  description: 'Warns when the actual lot size deviates from the planned size beyond tolerance.',
  category: 'risk',
  severity: 'warning',
  defaultConfig: { tolerancePct: 5 },
  configSchema,
  evaluate,
}
