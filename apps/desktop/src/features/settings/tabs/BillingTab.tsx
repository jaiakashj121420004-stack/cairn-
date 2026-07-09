import { useEffect, useMemo, useState } from 'react'
import { Button, GlassCard, Select, useToast } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'
import { useAuthStore } from '../../../stores/auth-store'
import type { BillingInterval, BillingStatusOutput } from '@cairn/shared-zod'

/**
 * Settings → Billing (CLAUDE.md §20, docs/billing.md, task §5).
 *
 * Cairn Pro (web + E2E-encrypted sync) is the only paid plan; the desktop journal is free
 * forever, so this tab is account-gated and never blocks local use. The renderer never
 * names a provider (§20.9): it sends a country (a dropdown here, since the desktop has no
 * Cloudflare geo header) and the server routes IN → Razorpay / INR, else Stripe / USD.
 *
 * Checkout and the billing portal open in the user's default browser — the hosted payment
 * page must never render inside the Electron window. The canonical subscription state is
 * read from `/billing/status`; we never optimistically mutate on cancel (§2.14, §20.5).
 */

const COUNTRIES = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'IN', label: 'India' },
  { value: 'AU', label: 'Australia' },
  { value: 'CA', label: 'Canada' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AE', label: 'United Arab Emirates' },
]

const INTERVALS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
]

/** Display prices mirror the provider dashboard config (docs/billing.md §6); see web billing.ts. */
const PRICE: Record<'USD' | 'INR', { monthly: string; annual: string }> = {
  USD: { monthly: '$12 / mo', annual: '$108 / yr' },
  INR: { monthly: '₹999 / mo (incl. GST)', annual: '₹8,999 / yr (incl. GST)' },
}

const STATE_COPY: Record<BillingStatusOutput['state'], string> = {
  free: 'Free — local desktop app only',
  trial: 'Trial — Pro features active',
  active: 'Active — Cairn Pro',
  past_due: 'Past due — update your payment method',
  canceled: 'Canceled',
}

const ERROR_COPY: Record<string, string> = {
  UNAUTHENTICATED: 'Sign in on the Account & Sync tab to manage billing.',
  NOT_IMPLEMENTED: 'Manage this subscription in the app or contact support — no self-serve portal.',
  NETWORK_ERROR: "Can't reach the Cairn server. Check your connection.",
  VALIDATION_ERROR: 'Pick a country and interval, then try again.',
  INTERNAL: 'Something went wrong on our side. Try again shortly.',
}

function copyFor(code: string): string {
  return ERROR_COPY[code] ?? 'That action could not be completed. Try again.'
}

export function BillingTab() {
  const { status, session, load } = useAuthStore()

  useEffect(() => {
    if (status === 'unknown') void load()
  }, [status, load])

  if (status !== 'signed-in' || !session) {
    return (
      <div className="max-w-md space-y-3">
        <GlassCard className="space-y-2 p-5">
          <h2 className="text-h3 font-semibold text-text-primary">Billing</h2>
          <p className="text-caption text-text-secondary">
            Cairn Pro adds the web app and end-to-end-encrypted sync. Sign in on the{' '}
            <span className="text-text-primary">Account &amp; Sync</span> tab to start a plan. The
            desktop journal stays free and fully usable offline either way.
          </p>
        </GlassCard>
      </div>
    )
  }

  return <SignedInBilling />
}

function SignedInBilling() {
  const toast = useToast()
  const [statusData, setStatusData] = useState<BillingStatusOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [country, setCountry] = useState('US')
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [busy, setBusy] = useState<'checkout' | 'portal' | 'cancel' | null>(null)

  const price = useMemo(() => {
    const currency = country === 'IN' ? 'INR' : 'USD'
    return PRICE[currency][interval]
  }, [country, interval])

  async function refresh() {
    const res = await ipc.billing.status()
    setLoading(false)
    if (res.ok) setStatusData(res.data)
    else if (res.error.code !== 'UNAUTHENTICATED') toast(copyFor(res.error.code), 'error')
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot load on mount
  }, [])

  async function onCheckout() {
    setBusy('checkout')
    const res = await ipc.billing.checkout({ country, plan: 'pro', interval })
    setBusy(null)
    if (res.ok) toast('Opening checkout in your browser…', 'success')
    else toast(copyFor(res.error.code), 'error')
  }

  async function onPortal() {
    setBusy('portal')
    const res = await ipc.billing.portal()
    setBusy(null)
    if (res.ok) toast('Opening the billing portal in your browser…', 'success')
    else toast(copyFor(res.error.code), 'error')
  }

  async function onCancel() {
    setBusy('cancel')
    const res = await ipc.billing.cancel({ when: 'period_end' })
    setBusy(null)
    if (res.ok) {
      toast(
        'Cancellation scheduled for the end of your billing period. Local data is untouched.',
        'success',
      )
      void refresh()
    } else {
      toast(copyFor(res.error.code), 'error')
    }
  }

  const state = statusData?.state ?? 'free'
  const isPaid = state === 'active' || state === 'past_due' || state === 'trial'
  const nextDate = statusData?.current_period_end ? formatDate(statusData.current_period_end) : null

  return (
    <div className="max-w-md space-y-4">
      <GlassCard className="space-y-3 p-5">
        <div>
          <p className="text-caption text-text-secondary">Subscription</p>
          <p className="text-body font-medium text-text-primary">
            {loading ? 'Loading…' : STATE_COPY[state]}
          </p>
          {nextDate && (
            <p className="mt-1 text-caption text-text-secondary">
              {state === 'canceled' ? 'Access until' : 'Next billing date'}: {nextDate}
            </p>
          )}
        </div>

        {isPaid ? (
          <div className="space-y-2">
            <Button variant="secondary" onClick={() => void onPortal()} loading={busy === 'portal'}>
              Open billing portal
            </Button>
            <Button variant="secondary" onClick={() => void onCancel()} loading={busy === 'cancel'}>
              Cancel subscription
            </Button>
          </div>
        ) : null}
      </GlassCard>

      {!isPaid && (
        <GlassCard className="space-y-3 p-5">
          <h3 className="text-h3 font-semibold text-text-primary">Upgrade to Cairn Pro</h3>
          <p className="text-caption text-text-secondary">
            Web app + end-to-end-encrypted multi-device sync. 14-day free trial; cancel anytime.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Region"
              options={COUNTRIES}
              value={country}
              onChange={setCountry}
              searchable
            />
            <Select
              label="Billing"
              options={INTERVALS}
              value={interval}
              onChange={(v) => setInterval(v as BillingInterval)}
            />
          </div>
          <p className="text-body font-medium text-text-primary">{price}</p>
          <Button onClick={() => void onCheckout()} loading={busy === 'checkout'}>
            Start 14-day trial
          </Button>
          <p className="text-caption text-text-muted">
            Checkout opens in your browser. Cancelling later never deletes your local data.
          </p>
        </GlassCard>
      )}
    </div>
  )
}

/** Format an ISO datetime as a plain, locale-aware date. */
function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
