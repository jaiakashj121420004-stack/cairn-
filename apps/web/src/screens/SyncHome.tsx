import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Button, Card, ErrorText, Heading, Screen } from '@web/components/ui'
import { useSession } from '@web/lib/session'

/**
 * The signed-in, Pro, vault-unlocked landing screen for this stage. It exercises the full
 * encrypted path — pull ciphertext, decrypt in-browser, land in IndexedDB — and reports
 * how many ops were applied. The full trading UI (the reused desktop features) mounts here
 * once the storage-agnostic data layer reads from the decrypted cache (next stage).
 */
export function SyncHome(): JSX.Element {
  const navigate = useNavigate()
  const { email, syncNow, logout } = useSession(
    useShallow((s) => ({ email: s.user?.email ?? null, syncNow: s.syncNow, logout: s.logout })),
  )
  const [applied, setApplied] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSync(): Promise<void> {
    setBusy(true)
    setError('')
    const res = await syncNow()
    setBusy(false)
    if (res.ok) setApplied(res.data.applied)
    else setError(res.error.message)
  }

  return (
    <Screen>
      <Card>
        <Heading sub={email ?? 'Vault unlocked'}>Synced &amp; encrypted</Heading>
        <p className="mb-6 text-sm text-white/60">
          Your vault is unlocked in this browser. Pulling downloads ciphertext and decrypts it
          locally — plaintext never leaves this device.
        </p>
        <Button onClick={() => void onSync()} disabled={busy} data-testid="sync-now">
          {busy ? 'Syncing…' : 'Sync now'}
        </Button>
        {applied !== null ? (
          <p className="mt-3 text-sm text-emerald-400" data-testid="sync-result">
            Applied {applied} change{applied === 1 ? '' : 's'} from the server.
          </p>
        ) : null}
        <ErrorText>{error}</ErrorText>
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            className="text-sm text-white/50 hover:text-white/80"
            onClick={() => navigate('/billing')}
            data-testid="billing-link"
          >
            Billing
          </button>
          <button
            type="button"
            className="text-sm text-white/50 hover:text-white/80"
            onClick={() => void logout()}
            data-testid="logout"
          >
            Sign out
          </button>
        </div>
      </Card>
    </Screen>
  )
}
