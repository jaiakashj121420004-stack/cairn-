/**
 * Plan / feature matrix (CLAUDE.md §20.3).
 *
 * Features are plain strings. A gate is one line — `planHasFeature(plan, 'cloud_sync')`
 * — never `if (plan === 'pro')` scattered through the codebase (§2.14, §20.9). New SKUs
 * extend this matrix; nothing else changes. The `pro` plan holds the wildcard `*`,
 * meaning "every feature", so adding a feature string grants it to pro automatically.
 */

export const PLAN_IDS = ['free', 'pro'] as const
export type PlanId = (typeof PLAN_IDS)[number]

/** Every feature the app gates on. Add here, then reference by string at the gate. */
export const FEATURES = [
  'local_journal',
  'rule_engine',
  'analytics_basic',
  'analytics_advanced',
  'cloud_sync',
  'multi_device',
] as const
export type Feature = (typeof FEATURES)[number]

const WILDCARD = '*' as const

/** The plan → feature mapping. `pro` is the wildcard set (`['*']`). */
export const PLANS: Readonly<
  Record<PlanId, { readonly features: readonly (Feature | typeof WILDCARD)[] }>
> = {
  free: { features: ['local_journal', 'rule_engine', 'analytics_basic'] },
  pro: { features: [WILDCARD] },
}

/** True when `plan` includes `feature` (directly or via the `*` wildcard). */
export function planHasFeature(plan: PlanId, feature: Feature): boolean {
  const features = PLANS[plan].features
  return features.includes(WILDCARD) || features.includes(feature)
}

/** The concrete feature list for a plan, expanding the `*` wildcard for free plans. */
export function featuresForPlan(plan: PlanId): readonly Feature[] {
  const features = PLANS[plan].features
  return features.includes(WILDCARD)
    ? FEATURES
    : (features.filter((f) => f !== WILDCARD) as readonly Feature[])
}

/**
 * The plan an entitlement grants. `trial` and `pro` entitlements both grant the `pro`
 * plan's features; `free` (or a lapsed entitlement) grants `free`.
 */
export function planForEntitlement(entitlement: 'free' | 'trial' | 'pro'): PlanId {
  return entitlement === 'free' ? 'free' : 'pro'
}
