import { useShallow } from 'zustand/react/shallow'
import { Button, Card, Heading, MutedLink, Screen } from '@web/components/ui'
import { useSession } from '@web/lib/session'

/**
 * Cairn Pro gate (CLAUDE.md §2.14, §20, task §7). The web client + sync are a paid
 * entitlement; free accounts use the desktop app only. Shown when a signed-in free/trial
 * user reaches the web app. The entitlement is read from the session (the access-token
 * claim, whose single source of truth is the server's `subscription` table — §20).
 */
export function ProGate(): JSX.Element {
  const { entitlement, logout } = useSession(
    useShallow((s) => ({ entitlement: s.user?.entitlement ?? 'free', logout: s.logout })),
  )

  return (
    <Screen>
      <Card>
        <Heading sub={`Your plan: ${entitlement}`}>Cairn Pro is required on the web</Heading>
        <div className="space-y-4 text-sm text-white/70" data-testid="pro-gate">
          <p>
            The web app and cloud sync are part of <strong className="text-white">Cairn Pro</strong>.
            Your data is end-to-end encrypted — the server stores ciphertext only and can never read
            it.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-black/20 p-3">
              <p className="text-xs uppercase tracking-wide text-white/40">Free</p>
              <p className="mt-1 text-white/80">Desktop app, fully offline. No web, no sync.</p>
            </div>
            <div className="rounded-lg border border-white/20 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wide text-white/40">Pro</p>
              <p className="mt-1 text-white/80">Web app + E2E-encrypted multi-device sync.</p>
            </div>
          </div>
          <p className="text-white/50">
            Cancelling Pro never deletes your local desktop data — it only stops sync.
          </p>
        </div>
        <div className="mt-6">
          <Button onClick={() => (window.location.href = '/pricing')} data-testid="upgrade">
            Upgrade to Cairn Pro
          </Button>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <MutedLink to="https://cairn.app/download">Download the desktop app</MutedLink>
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
