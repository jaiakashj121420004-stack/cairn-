import { ERROR_CODES } from '@cairn/shared-types'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ErrorText, Heading, Screen } from '@web/components/ui'
import {
  cancelSubscription,
  getBillingStatus,
  openBillingPortal,
} from '@web/lib/billing'
import type { BillingStatusOutput } from '@cairn/shared-zod'

/**
 * Settings → Billing (task §5). Reads the canonical subscription status, shows the plan /
 * state / next billing date, and exposes the two account actions: open the provider's
 * portal and cancel. Cancellation does NOT mutate optimistically — it asks the provider,
 * whose webhook is the source of truth (docs/billing.md §4); we just re-read status after.
 *
 * Razorpay has no hosted portal, so `openBillingPortal` may return `NOT_IMPLEMENTED`; we
 * surface honest copy ("manage from the app / contact support") rather than a dead button.
 */

const STATE_COPY: Record<BillingStatusOutput['state'], string> = {
  free: 'Free — local desktop app only',
  trial: 'Trial — Pro features active',
  active: 'Active — Cairn Pro',
  past_due: 'Past due — please update your payment method',
  canceled: 'Canceled',
}

export function Billing(): JSX.Element {
  const navigate = useNavigate()
  const [status, setStatus] = useState<BillingStatusOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<'portal' | 'cancel' | null>(null)

  async function refresh(): Promise<void> {
    const res = await getBillingStatus()
    setLoading(false)
    if (res.ok) setStatus(res.data)
    else setError(res.error.message)
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onPortal(): Promise<void> {
    setBusy('portal')
    setError('')
    setNotice('')
    const res = await openBillingPortal()
    setBusy(null)
    if (res.ok) {
      window.location.href = res.data.url
      return
    }
    setError(
      res.error.code === ERROR_CODES.NOT_IMPLEMENTED
        ? 'Manage this subscription from the Cairn app or contact support — your provider has no self-serve portal.'
        : res.error.message,
    )
  }

  async function onCancel(): Promise<void> {
    if (!window.confirm('Cancel Cairn Pro at the end of the current billing period? Your local data is never deleted.'))
      return
    setBusy('cancel')
    setError('')
    setNotice('')
    const res = await cancelSubscription('period_end')
    setBusy(null)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    setNotice('Cancellation scheduled for the end of your billing period. Sync stays on until then.')
    await refresh()
  }

  const isPaid = status !== null && (status.state === 'active' || status.state === 'past_due' || status.state === 'trial')
  const nextDate = status?.current_period_end !== null && status?.current_period_end !== undefined
    ? formatDate(status.current_period_end)
    : null

  return (
    <Screen>
      <Card>
        <Heading sub="Manage your Cairn Pro subscription">Billing</Heading>

        {loading ? (
          <p className="text-sm text-white/50">Loading…</p>
        ) : status === null ? (
          <ErrorText>{error || 'Could not load billing status.'}</ErrorText>
        ) : (
          <div className="space-y-4" data-testid="billing-status">
            <div className="rounded-lg border border-border bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-white/40">Status</p>
              <p className="mt-1 text-white/90" data-testid="billing-state">
                {STATE_COPY[status.state]}
              </p>
              {nextDate !== null ? (
                <p className="mt-2 text-sm text-white/50">
                  {status.state === 'canceled' ? 'Access until' : 'Next billing date'}: {nextDate}
                </p>
              ) : null}
            </div>

            {isPaid ? (
              <div className="space-y-3">
                <Button onClick={() => void onPortal()} disabled={busy !== null} data-testid="open-portal">
                  {busy === 'portal' ? 'Opening…' : 'Open billing portal'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void onCancel()}
                  disabled={busy !== null}
                  data-testid="cancel-sub"
                >
                  {busy === 'cancel' ? 'Cancelling…' : 'Cancel subscription'}
                </Button>
              </div>
            ) : (
              <Button onClick={() => navigate('/pricing')} data-testid="go-pricing">
                Upgrade to Cairn Pro
              </Button>
            )}

            {notice !== '' ? (
              <p className="text-sm text-emerald-400" data-testid="billing-notice">
                {notice}
              </p>
            ) : null}
            <ErrorText>{error}</ErrorText>
          </div>
        )}
      </Card>
    </Screen>
  )
}

/** Format an ISO datetime as a plain, locale-aware date (no time-of-day noise). */
function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
