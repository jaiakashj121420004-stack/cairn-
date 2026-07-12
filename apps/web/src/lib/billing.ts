import { type Result } from '@cairn/shared-types'
import { ERROR_CODES, err, ok } from '@cairn/shared-types'
import {
  billingStatusOutputSchema,
  cancelOutputSchema,
  checkoutOutputSchema,
  type BillingInterval,
  type BillingStatusOutput,
  type CancelOutput,
  type CheckoutOutput,
} from '@cairn/shared-zod'
import { core } from './transport-http'

/**
 * Web billing client (CLAUDE.md §20, docs/billing.md, task §3–§5).
 *
 * The renderer only ever speaks plan strings, a `BillingInterval`, and an ISO country
 * code — it NEVER names a provider (§20.9). The server picks the gateway from the country
 * (IN ⇒ Razorpay, else Stripe) and returns a hosted `url` the browser redirects to. The
 * canonical subscription state is read from `GET /billing/status`, which reads the
 * `subscription` table directly and never calls a provider in the hot path (§2.14).
 *
 * All four calls go through {@link HttpCore}, so they share the single-flight refresh and
 * the Result mapping; responses are re-validated against the shared Zod schemas so a
 * drifted server contract becomes a typed error rather than a wrong render (§2.12).
 */

/** A purchasable plan and its display copy. Free is shown for contrast only. */
export interface DisplayPlan {
  readonly id: 'free' | 'pro'
  readonly name: string
  readonly tagline: string
  readonly features: readonly string[]
}

export const DISPLAY_PLANS: readonly DisplayPlan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'The desktop app, fully offline. Forever.',
    features: [
      'Local-first journaling',
      'Real-time rule blocks & hard locks',
      'Core dashboards',
      'No account required',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Everything in Free, plus the web app & encrypted sync.',
    features: [
      'Web app access',
      'End-to-end-encrypted multi-device sync',
      'Expanded reports & insight surfacing',
      'Your data stays encrypted — the server can never read it',
    ],
  },
]

/**
 * Region pricing. These are DISPLAY figures only — the amount actually charged comes from
 * the provider plan/price id configured in the Stripe / Razorpay dashboards (docs/billing.md
 * §6, §10). Keep these in sync with the dashboard config when prices change. The Stripe
 * (USD) headline is tax-EXCLUSIVE (Stripe Tax adds VAT/sales tax on top at checkout); the
 * Razorpay (INR) headline is GST-INCLUSIVE (the user sees the final price).
 */
export interface RegionPricing {
  /** ISO-4217 currency for `Intl.NumberFormat`. */
  readonly currency: 'USD' | 'INR'
  /** Whether the displayed price already includes tax (true for INR/GST). */
  readonly taxInclusive: boolean
  /** Integer major-unit amounts (dollars / rupees). */
  readonly monthly: number
  readonly annual: number
}

const USD_PRICING: RegionPricing = {
  currency: 'USD',
  taxInclusive: false,
  monthly: 15,
  annual: 150, // $12.50/mo billed yearly (2 months free)
}

const INR_PRICING: RegionPricing = {
  currency: 'INR',
  taxInclusive: true,
  monthly: 1_299,
  annual: 12_990, // ₹1,082/mo billed yearly (2 months free), GST-inclusive
}

/**
 * Region display currency. When Dodo Payments is the gateway (its default) it handles both
 * India GST and international tax; otherwise India → Razorpay (INR), else Stripe (USD). The
 * display currency tracks the region regardless of which gateway ultimately charges (§20.6).
 */
export function pricingForCountry(country: string): RegionPricing {
  return country.toUpperCase() === 'IN' ? INR_PRICING : USD_PRICING
}

/** Format a region price for a given interval as a localized currency string. */
export function formatPrice(pricing: RegionPricing, interval: BillingInterval): string {
  const amount = interval === 'annual' ? pricing.annual : pricing.monthly
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: pricing.currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Best-effort country detection (task §5). On web the edge middleware
 * (`functions/_middleware.ts`) reflects Cloudflare's `CF-IPCountry` into a readable,
 * non-secret `cf-country` cookie; we read it here. Falls back to the browser locale's
 * region, then to `'US'`. The user can always override it on the pricing page, and the
 * server re-derives the gateway from whatever country it ultimately receives.
 */
export function detectCountry(readCookie: () => string = defaultReadCookie): string {
  const fromCookie = parseCountryCookie(readCookie())
  if (fromCookie !== null) return fromCookie
  const fromLocale = regionFromLocale()
  return fromLocale ?? 'US'
}

function parseCountryCookie(cookie: string): string | null {
  const match = cookie.match(/(?:^|;\s*)cf-country=([A-Za-z]{2})(?:;|$)/)
  return match?.[1] !== undefined ? match[1].toUpperCase() : null
}

function regionFromLocale(): string | null {
  try {
    const locale = new Intl.Locale(navigator.language)
    const region = locale.maximize().region
    return region !== undefined && /^[A-Z]{2}$/.test(region) ? region : null
  } catch {
    return null
  }
}

function defaultReadCookie(): string {
  return typeof document === 'undefined' ? '' : document.cookie
}

// ── Server calls ───────────────────────────────────────────────────────────────────────

/**
 * The slice of {@link HttpCore} the billing calls need. Injected (defaulting to the shared
 * {@link core}) so the wrappers are unit-tested with a fake caller and no network.
 */
export interface BillingCaller {
  call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<Result<T>>
}

/** GET /billing/status — the canonical plan/state read (no provider call, §2.14). */
export async function getBillingStatus(
  caller: BillingCaller = core,
): Promise<Result<BillingStatusOutput>> {
  const res = await caller.call<unknown>('GET', '/billing/status')
  if (!res.ok) return res
  const parsed = billingStatusOutputSchema.safeParse(res.data)
  return parsed.success ? ok(parsed.data) : err(ERROR_CODES.INTERNAL, 'malformed billing status')
}

/**
 * POST /billing/checkout — seed the trial (server-side) and get a hosted checkout URL.
 * The caller redirects the browser to `url`. The country selects the gateway server-side.
 */
export async function startCheckout(
  input: { country: string; interval: BillingInterval },
  caller: BillingCaller = core,
): Promise<Result<CheckoutOutput>> {
  const res = await caller.call<unknown>('POST', '/billing/checkout', {
    country: input.country,
    plan: 'pro',
    interval: input.interval,
  })
  if (!res.ok) return res
  const parsed = checkoutOutputSchema.safeParse(res.data)
  return parsed.success ? ok(parsed.data) : err(ERROR_CODES.INTERNAL, 'malformed checkout response')
}

/**
 * POST /billing/portal — get the provider's management URL. Stripe customers get the
 * Stripe Customer Portal; Razorpay has no hosted portal and returns `NOT_IMPLEMENTED`,
 * which the caller surfaces as "manage in-app / contact support" copy (docs/billing.md §4).
 */
export async function openBillingPortal(
  caller: BillingCaller = core,
): Promise<Result<CheckoutOutput>> {
  const res = await caller.call<unknown>('POST', '/billing/portal')
  if (!res.ok) return res
  const parsed = checkoutOutputSchema.safeParse(res.data)
  return parsed.success ? ok(parsed.data) : err(ERROR_CODES.INTERNAL, 'malformed portal response')
}

/**
 * POST /billing/cancel — request cancellation. The resulting provider webhook is the
 * source of truth that flips entitlement; we do not optimistically mutate (docs/billing.md
 * §4). `period_end` keeps Pro until the paid period ends; `now` cancels immediately.
 */
export async function cancelSubscription(
  when: 'now' | 'period_end' = 'period_end',
  caller: BillingCaller = core,
): Promise<Result<CancelOutput>> {
  const res = await caller.call<unknown>('POST', '/billing/cancel', { when })
  if (!res.ok) return res
  const parsed = cancelOutputSchema.safeParse(res.data)
  return parsed.success ? ok(parsed.data) : err(ERROR_CODES.INTERNAL, 'malformed cancel response')
}
