import { ERROR_CODES } from '@cairn/shared-types'
import Stripe from 'stripe'
import { AppError } from '../lib/errors'
import type {
  BillingProvider,
  CancelWhen,
  CheckoutInput,
  CreateCustomerInput,
  PortalInput,
  ProviderCustomer,
  WebhookEvent,
} from './provider'
import type { Env } from '../env'
import type { IncomingHttpHeaders } from 'node:http'

/**
 * Stripe billing provider (CLAUDE.md §3.1d, §20.2). All network calls live behind the
 * {@link BillingProvider} interface so routes stay provider-agnostic and tests inject a
 * fake. The `cairn_user_id` is stamped into subscription metadata at checkout so the
 * webhook receiver can reconcile state back to a user (§20.4).
 */
export class StripeBillingProvider implements BillingProvider {
  readonly name = 'stripe' as const
  private readonly stripe: Stripe
  private readonly priceMonthly: string
  private readonly priceAnnual: string | null
  private readonly webhookSecret: string

  constructor(env: Env) {
    if (!env.STRIPE_SECRET_KEY)
      throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'stripe is not configured')
    if (!env.STRIPE_PRICE_ID)
      throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'STRIPE_PRICE_ID is not configured')
    if (!env.STRIPE_WEBHOOK_SECRET)
      throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'STRIPE_WEBHOOK_SECRET is not configured')
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' as const })
    this.priceMonthly = env.STRIPE_PRICE_ID
    this.priceAnnual = env.STRIPE_PRICE_ID_ANNUAL ?? null
    this.webhookSecret = env.STRIPE_WEBHOOK_SECRET
  }

  async createCustomer(input: CreateCustomerInput): Promise<ProviderCustomer> {
    const customer = await this.stripe.customers.create({
      email: input.email,
      metadata: { cairn_user_id: input.userId },
    })
    return { customerId: customer.id }
  }

  async createCheckout(input: CheckoutInput): Promise<{ url: string }> {
    // Annual price when configured; otherwise fall back to monthly (documented in
    // docs/billing.md). The webhook reconciles state — the price only sets the cadence.
    const price =
      input.interval === 'annual' && this.priceAnnual ? this.priceAnnual : this.priceMonthly
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Stripe Tax computes VAT / sales tax from the address collected at checkout
      // (CLAUDE.md §20.6). India is served by Razorpay (GST), never this path.
      automatic_tax: { enabled: true },
      ...(input.customerId
        ? { customer: input.customerId, customer_update: { address: 'auto' as const } }
        : { customer_email: input.email }),
      // Stamp the user id so the subscription webhook can reconcile to a Cairn user.
      subscription_data: { metadata: { cairn_user_id: input.userId } },
      client_reference_id: input.userId,
    })
    if (!session.url)
      throw new AppError(ERROR_CODES.INTERNAL, 'stripe did not return a checkout url')
    return { url: session.url }
  }

  async openPortal(input: PortalInput): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    })
    return { url: session.url }
  }

  async cancelSubscription(subscriptionId: string, when: CancelWhen): Promise<void> {
    if (when === 'now') {
      await this.stripe.subscriptions.cancel(subscriptionId)
      return
    }
    await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
  }

  verifyWebhook(body: Buffer, headers: IncomingHttpHeaders): WebhookEvent {
    const sig = headers['stripe-signature']
    if (typeof sig !== 'string')
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'missing stripe-signature header')
    let event: Stripe.Event
    try {
      event = this.stripe.webhooks.constructEvent(body, sig, this.webhookSecret)
    } catch {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'invalid stripe webhook signature')
    }
    return { id: event.id, type: event.type, raw: event }
  }
}
