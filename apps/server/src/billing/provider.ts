import type { PlanId } from './plans'
import type { BillingInterval } from '@cairn/shared-zod'
import type { IncomingHttpHeaders } from 'node:http'

/**
 * Generic billing-provider interface (CLAUDE.md §20.2).
 *
 * Stripe is provider #1, Razorpay #2. Adding Paddle / LemonSqueezy later is a new
 * class that implements this — never a rewrite. The rest of the server depends only on
 * this interface; the canonical subscription state always lives in the `subscription`
 * table (populated by webhooks), so hot paths never call a provider API (§2.14).
 */

export interface CreateCustomerInput {
  readonly userId: string
  readonly email: string
}

export interface ProviderCustomer {
  /** Provider-side customer id (e.g. Stripe `cus_…`, Razorpay `cust_…`). */
  readonly customerId: string
}

export interface CheckoutInput {
  readonly userId: string
  readonly email: string
  readonly plan: PlanId
  /** Monthly or annual — selects which provider price/plan id is charged. */
  readonly interval: BillingInterval
  /** Where the provider redirects after a successful checkout. */
  readonly successUrl: string
  /** Where the provider redirects if the user abandons checkout. */
  readonly cancelUrl: string
  /** An existing provider customer id to attach the subscription to, if known. */
  readonly customerId?: string
}

export interface PortalInput {
  readonly customerId: string
  readonly returnUrl: string
}

/** Minimal, provider-agnostic view of a verified webhook event. */
export interface WebhookEvent {
  readonly id: string
  readonly type: string
  readonly raw: unknown
}

/** When a cancellation takes effect. */
export type CancelWhen = 'now' | 'period_end'

export interface BillingProvider {
  readonly name: 'stripe' | 'razorpay' | string
  createCustomer(input: CreateCustomerInput): Promise<ProviderCustomer>
  createCheckout(input: CheckoutInput): Promise<{ url: string }>
  openPortal(input: PortalInput): Promise<{ url: string }>
  cancelSubscription(subscriptionId: string, when: CancelWhen): Promise<void>
  verifyWebhook(body: Buffer, headers: IncomingHttpHeaders): WebhookEvent
}

/** The set of billing providers available to the server, keyed by name. */
export type BillingProviders = Partial<Record<'stripe' | 'razorpay', BillingProvider>>
