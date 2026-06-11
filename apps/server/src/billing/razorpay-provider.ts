import { createHmac, timingSafeEqual } from 'node:crypto'
import { ERROR_CODES } from '@cairn/shared-types'
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
 * Razorpay billing provider (CLAUDE.md §3.1d, §20.2) for the Indian market (UPI / INR).
 *
 * Razorpay has no official Node SDK we depend on, so calls go through its REST API with
 * HTTP Basic auth (key id + secret). Only the surface the server needs is implemented;
 * everything routes through the shared {@link BillingProvider} interface so tests inject
 * a fake and never touch the network. `cairn_user_id` rides in subscription `notes` so
 * the webhook receiver can reconcile to a user (§20.4).
 */
const RAZORPAY_API = 'https://api.razorpay.com/v1'

export class RazorpayBillingProvider implements BillingProvider {
  readonly name = 'razorpay' as const
  private readonly authHeader: string
  private readonly planMonthly: string
  private readonly planAnnual: string | null
  private readonly webhookSecret: string

  constructor(env: Env) {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'razorpay is not configured')
    }
    if (!env.RAZORPAY_PLAN_ID)
      throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'RAZORPAY_PLAN_ID is not configured')
    if (!env.RAZORPAY_WEBHOOK_SECRET)
      throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'RAZORPAY_WEBHOOK_SECRET is not configured')
    this.authHeader = `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`
    this.planMonthly = env.RAZORPAY_PLAN_ID
    this.planAnnual = env.RAZORPAY_PLAN_ID_ANNUAL ?? null
    this.webhookSecret = env.RAZORPAY_WEBHOOK_SECRET
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${RAZORPAY_API}${path}`, {
      method,
      headers: { authorization: this.authHeader, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!res.ok) {
      throw new AppError(ERROR_CODES.INTERNAL, `razorpay request failed (${String(res.status)})`)
    }
    return (await res.json()) as T
  }

  async createCustomer(input: CreateCustomerInput): Promise<ProviderCustomer> {
    const customer = await this.request<{ id: string }>('POST', '/customers', {
      email: input.email,
      fail_existing: 0,
      notes: { cairn_user_id: input.userId },
    })
    return { customerId: customer.id }
  }

  async createCheckout(input: CheckoutInput): Promise<{ url: string }> {
    // Annual plan when configured; otherwise fall back to the monthly plan.
    const planId =
      input.interval === 'annual' && this.planAnnual ? this.planAnnual : this.planMonthly
    // Annual bills 10 cycles, monthly 120 — both ~10 years of a long-lived subscription.
    const totalCount = input.interval === 'annual' ? 10 : 120
    // A Razorpay subscription exposes a hosted `short_url` the user completes payment on.
    const subscription = await this.request<{ short_url?: string }>('POST', '/subscriptions', {
      plan_id: planId,
      total_count: totalCount,
      customer_notify: 1,
      notes: { cairn_user_id: input.userId },
    })
    if (!subscription.short_url)
      throw new AppError(ERROR_CODES.INTERNAL, 'razorpay did not return a checkout url')
    return { url: subscription.short_url }
  }

  openPortal(_input: PortalInput): Promise<{ url: string }> {
    // Razorpay has no hosted customer portal; management happens in-app or via support.
    return Promise.reject(
      new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'razorpay has no customer portal'),
    )
  }

  async cancelSubscription(subscriptionId: string, when: CancelWhen): Promise<void> {
    await this.request('POST', `/subscriptions/${subscriptionId}/cancel`, {
      cancel_at_cycle_end: when === 'period_end' ? 1 : 0,
    })
  }

  verifyWebhook(body: Buffer, headers: IncomingHttpHeaders): WebhookEvent {
    const sig = headers['x-razorpay-signature']
    if (typeof sig !== 'string')
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'missing x-razorpay-signature header')
    const expected = createHmac('sha256', this.webhookSecret).update(body).digest('hex')
    const sigBuf = Buffer.from(sig, 'utf8')
    const expBuf = Buffer.from(expected, 'utf8')
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'invalid razorpay webhook signature')
    }
    const parsed = JSON.parse(body.toString('utf8')) as {
      event?: string
      payload?: { payment?: { entity?: { id?: string } } }
    }
    const id = parsed.payload?.payment?.entity?.id ?? parsed.event ?? 'unknown'
    return { id, type: parsed.event ?? 'unknown', raw: parsed }
  }
}
