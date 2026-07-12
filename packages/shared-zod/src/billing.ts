import { z } from 'zod'

/**
 * Billing schemas (CLAUDE.md §20). The renderer only ever speaks `Feature`/plan strings
 * and provider names — never a provider SDK. These schemas are the contract for the
 * `/billing/*` HTTP surface, reused at both the server boundary and the client.
 */

export const billingProviderSchema = z.enum(['stripe', 'razorpay', 'dodo'])
export type BillingProviderName = z.infer<typeof billingProviderSchema>

/** The single purchasable plan today. The matrix (§20.3) is the source of truth. */
export const purchasablePlanSchema = z.enum(['pro'])

/** Billing interval. The price/plan id the provider charges is selected from this. */
export const billingIntervalSchema = z.enum(['monthly', 'annual'])
export type BillingInterval = z.infer<typeof billingIntervalSchema>

/**
 * ISO 3166-1 alpha-2 country code, normalised to upper-case. The server routes the
 * checkout to a gateway from this and the configured providers — when Dodo Payments is
 * configured it is the default for every country (it handles both India GST and
 * international tax); otherwise `IN` ⇒ Razorpay, else Stripe. The client never names a
 * provider (§20.9: no hard-coded provider ids in the renderer).
 */
export const countrySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, 'expected a 2-letter ISO country code')
  .transform((c) => c.toUpperCase())

/** POST /billing/checkout request. */
export const checkoutInputSchema = z.object({
  country: countrySchema,
  plan: purchasablePlanSchema.default('pro'),
  interval: billingIntervalSchema.default('monthly'),
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
