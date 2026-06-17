import { useState } from 'react'
import { Button, ErrorText, Heading, Screen, SegmentedToggle } from '@web/components/ui'
import {
  DISPLAY_PLANS,
  detectCountry,
  formatPrice,
  pricingForCountry,
  startCheckout,
} from '@web/lib/billing'
import type { BillingInterval } from '@cairn/shared-zod'

/**
 * Pricing page (task §5). Two plans — Free (the offline desktop app) and Pro (web +
 * E2E-encrypted sync) — with a monthly/annual toggle. Prices localize to the user's
 * region: INR for India (Razorpay/GST-inclusive), USD elsewhere (Stripe/tax-exclusive).
 *
 * The country is geo-detected (the `cf-country` cookie the edge middleware reflects from
 * Cloudflare, falling back to the browser locale) and editable here, so a traveller or a
 * VPN user can pick the right region. The renderer never names a provider — it sends the
 * country to `POST /billing/checkout` and the SERVER picks the gateway (§20.9). Clicking
 * "Upgrade" seeds the trial server-side and redirects to the provider-hosted page.
 */

/** A compact, representative country list; India is the one that routes to Razorpay/INR. */
const COUNTRIES: readonly { readonly code: string; readonly name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IN', name: 'India' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
]

const INTERVAL_OPTIONS: readonly { readonly value: BillingInterval; readonly label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
]

export function Pricing(): JSX.Element {
  const [country, setCountry] = useState<string>(() => normalizeCountry(detectCountry()))
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pricing = pricingForCountry(country)
  const proPrice = formatPrice(pricing, interval)

  async function onUpgrade(): Promise<void> {
    setBusy(true)
    setError('')
    const res = await startCheckout({ country, interval })
    if (res.ok) {
      // Redirect to the provider-hosted checkout page.
      window.location.href = res.data.url
      return
    }
    setBusy(false)
    setError(res.error.message)
  }

  return (
    <Screen>
      <div className="w-full max-w-3xl">
        <Heading sub="Discipline-first journaling. Local-first, privacy-first.">
          Choose your plan
        </Heading>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <SegmentedToggle options={INTERVAL_OPTIONS} value={interval} onChange={setInterval} />
          <label className="flex items-center gap-2 text-sm text-white/50">
            <span>Region</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded-lg border border-border bg-black/30 px-2.5 py-1.5 text-sm text-white/90 outline-none focus:border-white/30"
              data-testid="country-select"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {DISPLAY_PLANS.map((plan) => {
            const isPro = plan.id === 'pro'
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-6 ${
                  isPro ? 'border-white/25 bg-white/[0.04]' : 'border-border bg-surface'
                }`}
                data-testid={`plan-${plan.id}`}
              >
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="mt-1 text-sm text-white/50">{plan.tagline}</p>
                <div className="mt-4">
                  {isPro ? (
                    <p>
                      <span className="text-3xl font-semibold" data-testid="pro-price">
                        {proPrice}
                      </span>
                      <span className="text-sm text-white/50">
                        {' '}
                        / {interval === 'annual' ? 'year' : 'month'}
                      </span>
                    </p>
                  ) : (
                    <p className="text-3xl font-semibold">Free</p>
                  )}
                  {isPro ? (
                    <p className="mt-1 text-xs text-white/40">
                      {pricing.taxInclusive ? 'GST included' : 'plus tax where applicable'} · 14-day
                      free trial
                    </p>
                  ) : null}
                </div>
                <ul className="mt-5 space-y-2 text-sm text-white/70">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden className="text-white/40">
                        —
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  {isPro ? (
                    <Button onClick={() => void onUpgrade()} disabled={busy} data-testid="upgrade-pro">
                      {busy ? 'Redirecting…' : 'Start 14-day trial'}
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => window.location.assign('https://cairn.app/download')}>
                      Download desktop app
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <ErrorText>{error}</ErrorText>
      </div>
    </Screen>
  )
}

/** Coerce a detected/selected country to one in the list, defaulting to US. */
function normalizeCountry(code: string): string {
  const upper = code.toUpperCase()
  return COUNTRIES.some((c) => c.code === upper) ? upper : 'US'
}
