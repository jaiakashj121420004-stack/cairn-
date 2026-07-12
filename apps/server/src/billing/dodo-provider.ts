import { ERROR_CODES } from '@cairn/shared-types'
import { AppError } from '../lib/errors'
import { verifyDodoSignature } from './dodo-signature'
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
 * Dodo Payments billing provider (CLAUDE.md §3.1d, §20.2). Dodo is a Merchant-of-Record
 * gateway that handles India GST **and** international tax from the address collected at
 * checkout, so when it is configured it is the default gateway for every country
 * (docs/billing.md §4). Calls go through Dodo's REST API with a Bearer token; only the
 * surface the server needs is implemented, all behind the shared {@link BillingProvider}
 * interface so tests inject a fake and never hit the network. `cairn_user_id` rides in the
 * checkout `metadata` so the webhook receiver can reconcile to a user (§20.4). Webhook
 * signatures follow the Standard Webhooks spec — see {@link verifyDodoSignature}.
 */
const DODO_API_BASE = {
  test: 'https://test.dodopayments.com',
  live: 'https://live.dodopayments.com',
} as const

export class DodoBillingProvider implements BillingProvider {
  readonly name = 'dodo' as const
  private readonly apiKey: string
  private readonly apiBase: string
  private readonly productMonthly: string
  private readonly productAnnual: string | null
  private readonly webhookSecret: string

  constructor(env: Env) {
    if (!env.DODO_API_KEY) throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'dodo is not configured')
    if (!env.DODO_PRODUCT_ID)
      throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'DODO_PRODUCT_ID is not configured')
    if (!env.DODO_WEBHOOK_SECRET)
      throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'DODO_WEBHOOK_SECRET is not configured')
    this.apiKey = env.DODO_API_KEY
    this.apiBase = DODO_API_BASE[env.DODO_ENVIRONMENT]
    this.productMonthly = env.DODO_PRODUCT_ID
    this.productAnnual = env.DODO_PRODUCT_ID_ANNUAL ?? null
    this.webhookSecret = env.DODO_WEBHOOK_SECRET
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!res.ok) {
      throw new AppError(ERROR_CODES.INTERNAL, `dodo request failed (${String(res.status)})`)
    }
    return (await res.json()) as T
  }

  async createCustomer(input: CreateCustomerInput): Promise<ProviderCustomer> {
    const customer = await this.request<{ customer_id: string }>('POST', '/customers', {
      email: input.email,
      name: input.email,
    })
    return { customerId: customer.customer_id }
  }

  async createCheckout(input: CheckoutInput): Promise<{ url: string }> {
    // Annual product when configured; otherwise fall back to monthly (docs/billing.md §4).
    const productId =
      input.interval === 'annual' && this.productAnnual ? this.productAnnual : this.productMonthly
    // A checkout session returns a hosted `checkout_url` the user completes payment on. Dodo
    // collects the billing address there and computes GST / VAT / sales tax itself (§20.6).
    const session = await this.request<{ checkout_url?: string }>('POST', '/checkouts', {
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: input.customerId ? { customer_id: input.customerId } : { email: input.email },
      return_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Stamp the user id so the subscription/payment webhook can reconcile to a Cairn user.
      metadata: { cairn_user_id: input.userId },
    })
    if (!session.checkout_url)
      throw new AppError(ERROR_CODES.INTERNAL, 'dodo did not return a checkout url')
    return { url: session.checkout_url }
  }

  async openPortal(input: PortalInput): Promise<{ url: string }> {
    // Dodo hosts a customer portal; the return_url renders a "Return to Cairn" back button.
    const query = `?return_url=${encodeURIComponent(input.returnUrl)}`
    const session = await this.request<{ link?: string }>(
      'POST',
      `/customers/${input.customerId}/customer-portal/session${query}`,
    )
    if (!session.link) throw new AppError(ERROR_CODES.INTERNAL, 'dodo did not return a portal url')
    return { url: session.link }
  }

  async cancelSubscription(subscriptionId: string, when: CancelWhen): Promise<void> {
    // `period_end` keeps Pro until the next billing date; `now` cancels immediately (§20.5).
    const body =
      when === 'now' ? { status: 'cancelled' as const } : { cancel_at_next_billing_date: true }
    await this.request('PATCH', `/subscriptions/${subscriptionId}`, body)
  }

  verifyWebhook(body: Buffer, headers: IncomingHttpHeaders): WebhookEvent {
    const { id } = verifyDodoSignature(body, headers, this.webhookSecret)
    const parsed = JSON.parse(body.toString('utf8')) as { type?: string }
    return { id, type: parsed.type ?? 'unknown', raw: parsed }
  }
}
