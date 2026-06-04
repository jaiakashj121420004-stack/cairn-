import { z } from 'zod'

/**
 * Billing schemas (CLAUDE.md §20). The renderer only ever speaks `Feature`/plan strings
 * and provider names — never a provider SDK. These schemas are the contract for the
 * `/billing/*` HTTP surface, reused at both the server boundary and the client.
 */

export const billingProviderSchema = z.enum(['stripe', 'razorpay'])
export type BillingProviderName = z.infer<typeof billingProviderSchema>

/** The single purchasable plan today. The matrix (§20.3) is the source of truth. */
export const purchasablePlanSchema = z.enum(['pro'])

/** POST /billing/checkout request. */
export const checkoutInputSchema = z.object({
  provider: billingProviderSchema,
  plan: purchasablePlanSchema.default('pro'),
})
export type CheckoutInputBody = z.infer<typeof checkoutInputSchema>

/** POST /billing/checkout + POST /billing/portal response. */
export const checkoutOutputSchema = z.object({
  /** Provider-hosted URL the client redirects the user to. */
  url: z.string().url(),
})
export type CheckoutOutput = z.infer<typeof checkoutOutputSchema>

/** POST /billing/cancel request. */
export const cancelInputSchema = z.object({
  when: z.enum(['now', 'period_end']).default('period_end'),
})
export type CancelInputBody = z.infer<typeof cancelInputSchema>

/** POST /billing/cancel response. */
export const cancelOutputSchema = z.object({
  scheduled: z.enum(['now', 'period_end']),
})
export type CancelOutput = z.infer<typeof cancelOutputSchema>

/** GET /billing/status response — read straight off the canonical subscription row. */
export const billingStatusOutputSchema = z.object({
  plan: z.enum(['free', 'pro']),
  state: z.enum(['free', 'trial', 'active', 'past_due', 'canceled']),
  /** The expanded feature set the current plan grants. */
  features: z.array(z.string()),
  current_period_end: z.string().datetime().nullable(),
})
export type BillingStatusOutput = z.infer<typeof billingStatusOutputSchema>
