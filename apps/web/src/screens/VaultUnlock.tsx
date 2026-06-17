import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Button, Card, ErrorText, Field, Heading, Input, MutedLink, Screen } from '@web/components/ui'
import { useSession } from '@web/lib/session'

/**
 * Returning-device unlock. Default mode unlocks with the vault password; "Use recovery
 * phrase" handles a new device or post-reset unlock (CLAUDE.md §18.4).
 */
export function VaultUnlock(): JSX.Element {
  const { unlockVault, recoverVault } = useSession(
    useShallow((s) => ({ unlockVault: s.unlockVault, recoverVault: s.recoverVault })),
  )
  const navigate = useNavigate()
  const [mode, setMode] = useState<'password' | 'recovery'>('password')
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onUnlock(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res =
      mode === 'password'
        ? await unlockVault(password)
        : await recoverVault(phrase.trim().split(/\s+/))
    setBusy(false)
    if (res.ok) void navigate('/')
    else setError(mode === 'password' ? 'Wrong vault password.' : 'That recovery phrase is invalid.')
  }

  return (
    <Screen>
      <Card>
        <Heading sub="Your vault is encrypted. Unlock it to view and sync your data.">
          Unlock your vault
        </Heading>
        <form onSubmit={(e) => void onUnlock(e)} data-testid="unlock-form">
          {mode === 'password' ? (
            <Field label="Vault password">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="vault-password"
                required
              />
            </Field>
          ) : (
            <Field label="Recovery phrase (24 words)">
              <Input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                data-testid="recovery-phrase-input"
                placeholder="word1 word2 … word24"
                required
              />
            </Field>
          )}
          <Button type="submit" disabled={busy} data-testid="submit">
            {busy ? 'Unlocking…' : 'Unlock'}
          </Button>
          <ErrorText>{error}</ErrorText>
        </form>
        <button
          type="button"
          className="mt-6 block text-sm text-white/50 hover:text-white/80"
          onClick={() => setMode(mode === 'password' ? 'recovery' : 'password')}
          data-testid="toggle-mode"
        >
          {mode === 'password' ? 'Use recovery phrase instead' : 'Use vault password instead'}
        </button>
        <div className="mt-3">
          <MutedLink to="/logout">Sign out</MutedLink>
        </div>
      </Card>
    </Screen>
  )
}
