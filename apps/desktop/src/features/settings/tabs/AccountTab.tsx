import { useEffect, useState } from 'react'
import { Button, GlassCard, Input, useToast } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'
import { useAuthStore } from '../../../stores/auth-store'
import { RecoveryPhraseModal } from '../../auth/RecoveryPhraseModal'
import { VaultUnlockModal } from '../../auth/VaultUnlockModal'

/**
 * Account & Sync settings (CLAUDE.md §18.5, Stage 2 client session layer).
 *
 * A signed-out app is fully functional offline — sync is opt-in and account-gated. This
 * tab is the sign-in / sign-up surface and, once signed in, the vault unlock / enrollment
 * entry point: "Enable sync" derives the key locally, enrolls or unlocks the vault, and
 * (on first enrollment) reveals the recovery phrase once (CLAUDE.md §18.5/§18.6, Stage 3).
 *
 * Error codes from the backend are mapped to calm, mentor-voice copy (§1 voice, §3.7 —
 * the UI never renders a raw lower-layer error string).
 */

const ERROR_COPY: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  EMAIL_NOT_VERIFIED: 'Verify your email before signing in. Check your inbox.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes, then try again.',
  VALIDATION_ERROR: 'Enter a valid email and a password of at least 8 characters.',
  VALIDATION_FAILED: 'Enter a valid email and a password of at least 8 characters.',
  NETWORK_ERROR: "Can't reach the Cairn server. Check your connection.",
  INTERNAL: 'Something went wrong on our side. Try again shortly.',
}

function copyFor(code: string | null): string | null {
  if (code === null) return null
  return ERROR_COPY[code] ?? 'That action could not be completed. Try again.'
}

type Mode = 'login' | 'signup' | 'forgot'

export function AccountTab() {
  const { status, session, busy, errorCode, load, login, signup, logout, clearError } =
    useAuthStore()
  const toast = useToast()

  useEffect(() => {
    if (status === 'unknown') void load()
  }, [status, load])

  if (status === 'signed-in' && session) {
    return (
      <SignedIn
        email={session.email}
        entitlement={session.entitlement}
        onLogout={() => void logout()}
        busy={busy}
      />
    )
  }

  return (
    <AuthForm
      busy={busy}
      error={copyFor(errorCode)}
      onClearError={clearError}
      onLogin={(email, password) => login({ email, password })}
      onSignup={(email, password) => signup({ email, password })}
      onForgot={async (email) => {
        const res = await ipc.auth.forgotPassword({ email })
        if (res.ok) toast('If that account exists, a reset link is on its way.', 'success')
        else toast(copyFor(res.error.code) ?? 'Could not send reset email.', 'error')
        return res.ok
      }}
    />
  )
}

function SignedIn(props: {
  email: string
  entitlement: string
  onLogout: () => void
  busy: boolean
}) {
  const { vaultUnlocked, vaultBusy, vaultErrorCode, unlockVault, clearVaultError } = useAuthStore()
  const toast = useToast()
  const [showUnlock, setShowUnlock] = useState(false)
  // The recovery phrase lives only in this local state, shown once, then dropped (§2.13).
  const [phrase, setPhrase] = useState<readonly string[] | null>(null)

  function openUnlock() {
    clearVaultError()
    setShowUnlock(true)
  }

  async function handleUnlock(password: string) {
    const res = await unlockVault(password)
    if (!res.ok) return // store holds the error code; modal stays open
    setShowUnlock(false)
    if (res.enrolled && res.recoveryPhrase) {
      setPhrase(res.recoveryPhrase)
    } else {
      toast('Vault unlocked. Sync is on.', 'success')
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <GlassCard className="space-y-3 p-5">
        <div>
          <p className="text-caption text-text-secondary">Signed in as</p>
          <p className="text-body font-medium text-text-primary">{props.email}</p>
        </div>
        <div className="flex items-center gap-2 text-caption text-text-secondary">
          <span className="rounded-full border border-border px-2 py-0.5 uppercase tracking-wide">
            {props.entitlement}
          </span>
          <span>{vaultUnlocked ? 'Vault unlocked — sync on' : 'Vault locked'}</span>
        </div>
        {!vaultUnlocked && (
          <Button onClick={openUnlock} loading={vaultBusy}>
            Enable sync
          </Button>
        )}
        <Button variant="secondary" onClick={props.onLogout} loading={props.busy}>
          Sign out
        </Button>
      </GlassCard>
      <p className="text-caption text-text-muted">
        Cloud sync is end-to-end encrypted and optional. Your journal stays fully usable on this
        device whether or not you’re signed in.
      </p>

      <VaultUnlockModal
        open={showUnlock}
        busy={vaultBusy}
        errorCode={vaultErrorCode}
        onClose={() => setShowUnlock(false)}
        onSubmit={(password) => void handleUnlock(password)}
      />
      {phrase && (
        <RecoveryPhraseModal
          open
          phrase={phrase}
          onAcknowledge={() => {
            setPhrase(null)
            toast('Recovery phrase saved. Sync is on.', 'success')
          }}
        />
      )}
    </div>
  )
}

function AuthForm(props: {
  busy: boolean
  error: string | null
  onClearError: () => void
  onLogin: (email: string, password: string) => Promise<boolean>
  onSignup: (email: string, password: string) => Promise<boolean>
  onForgot: (email: string) => Promise<boolean>
}) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const toast = useToast()

  function switchMode(next: Mode) {
    props.onClearError()
    setMode(next)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'forgot') {
      await props.onForgot(email)
      return
    }
    if (mode === 'signup') {
      const ok = await props.onSignup(email, password)
      if (ok) {
        toast('Account created. Check your email to verify, then sign in.', 'success')
        setPassword('')
        setMode('login')
      }
      return
    }
    await props.onLogin(email, password)
  }

  const title =
    mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'
  const cta =
    mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'

  return (
    <div className="max-w-md space-y-4">
      <GlassCard className="p-5">
        <h2 className="mb-1 text-h3 font-semibold text-text-primary">{title}</h2>
        <p className="mb-4 text-caption text-text-secondary">
          Connect an account to enable optional end-to-end-encrypted cloud sync.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {mode !== 'forgot' && (
            <Input
              label="Password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              {...(mode === 'signup' ? { hint: 'At least 8 characters.' } : {})}
              required
            />
          )}
          {props.error && <p className="text-caption text-danger">{props.error}</p>}
          <Button type="submit" loading={props.busy} className="w-full">
            {cta}
          </Button>
        </form>
      </GlassCard>

      <div className="flex flex-wrap justify-between gap-2 text-caption">
        {mode !== 'login' ? (
          <button
            type="button"
            className="text-accent-a hover:underline"
            onClick={() => switchMode('login')}
          >
            Back to sign in
          </button>
        ) : (
          <button
            type="button"
            className="text-accent-a hover:underline"
            onClick={() => switchMode('signup')}
          >
            Create an account
          </button>
        )}
        {mode === 'login' && (
          <button
            type="button"
            className="text-text-secondary hover:underline"
            onClick={() => switchMode('forgot')}
          >
            Forgot password?
          </button>
        )}
      </div>
    </div>
  )
}
