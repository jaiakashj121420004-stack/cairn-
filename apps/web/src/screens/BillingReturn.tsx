import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Heading, Screen } from '@web/components/ui'
import { getBillingStatus } from '@web/lib/billing'
import { useSession } from '@web/lib/session'

/**
 * Landing page after the provider-hosted checkout redirects back (task §5). The server's
 * `BILLING_SUCCESS_URL` / `BILLING_CANCEL_URL` default to `${APP_URL}/billing/success|cancel`.
 *
 * On success the subscription is already (or imminently) `active`/`trial` via the webhook;
 * we re-read `/billing/status` to refresh the entitlement view and then send the user into
 * the app. On cancel we drop them back on the pricing page. We never trust the redirect as
 * proof of payment — the webhook + `subscription` table remain the source of truth (§2.14).
 */
export function BillingReturn({ outcome }: { outcome: 'success' | 'cancel' }): JSX.Element {
  const navigate = useNavigate()
  const restore = useSession((s) => s.restore)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (outcome !== 'success') return
    // Refresh entitlement claims, then confirm the canonical status before proceeding.
    void (async () => {
      await restore()
      await getBillingStatus()
      setChecked(true)
    })()
  }, [outcome, restore])

  if (outcome === 'cancel') {
    return (
      <Screen>
        <Card>
          <Heading sub="No charge was made.">Checkout canceled</Heading>
          <p className="mb-6 text-sm text-white/60">
            You can pick a plan whenever you're ready. The desktop app stays free, forever.
          </p>
          <Button onClick={() => navigate('/pricing')}>Back to plans</Button>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen>
      <Card>
        <Heading sub={checked ? 'Your subscription is being activated.' : 'Confirming your subscription…'}>
          {checked ? "You're all set" : 'Almost there'}
        </Heading>
        <p className="mb-6 text-sm text-white/60">
          Thanks for upgrading to Cairn Pro. Your trades stay end-to-end encrypted — the server
          never sees plaintext.
        </p>
        <Button onClick={() => navigate('/app')} disabled={!checked} data-testid="billing-continue">
          {checked ? 'Continue to Cairn' : 'Confirming…'}
        </Button>
      </Card>
    </Screen>
  )
}
