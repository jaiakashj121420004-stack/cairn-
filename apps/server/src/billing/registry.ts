import { DodoBillingProvider } from './dodo-provider'
import { RazorpayBillingProvider } from './razorpay-provider'
import { StripeBillingProvider } from './stripe-provider'
import type { BillingProviders } from './provider'
import type { Env } from '../env'

/**
 * Build the set of billing providers that are fully configured in this environment
 * (CLAUDE.md §20.2). A provider is only instantiated when all of its secrets are
 * present, so a deployment can ship with any subset — Dodo only, Stripe only, Razorpay
 * only, all, or none. Tests bypass this and inject fakes into `buildApp`. Routing
 * (`billing/routes.ts`) prefers Dodo for every country when it is present (docs/billing.md §4).
 */
export function createBillingProviders(env: Env): BillingProviders {
  const providers: BillingProviders = {}
  if (env.DODO_API_KEY && env.DODO_PRODUCT_ID && env.DODO_WEBHOOK_SECRET) {
    providers.dodo = new DodoBillingProvider(env)
  }
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
