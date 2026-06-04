import { RazorpayBillingProvider } from './razorpay-provider'
import { StripeBillingProvider } from './stripe-provider'
import type { BillingProviders } from './provider'
import type { Env } from '../env'

/**
 * Build the set of billing providers that are fully configured in this environment
 * (CLAUDE.md §20.2). A provider is only instantiated when all of its secrets are
 * present, so a deployment can ship with Stripe only, Razorpay only, both, or neither.
 * Tests bypass this and inject fakes into `buildApp`.
 */
export function createBillingProviders(env: Env): BillingProviders {
  const providers: BillingProviders = {}
  if (env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && env.STRIPE_WEBHOOK_SECRET) {
    providers.stripe = new StripeBillingProvider(env)
  }
  if (
    env.RAZORPAY_KEY_ID &&
    env.RAZORPAY_KEY_SECRET &&
    env.RAZORPAY_PLAN_ID &&
    env.RAZORPAY_WEBHOOK_SECRET
  ) {
    providers.razorpay = new RazorpayBillingProvider(env)
  }
  return providers
}
