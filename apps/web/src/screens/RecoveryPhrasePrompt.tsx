import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ErrorText, Field, Heading, Input, Screen } from '@web/components/ui'
import { useSession } from '@web/lib/session'

/**
 * First-time vault enrollment + recovery-phrase capture (CLAUDE.md §18.4, task §3/§4).
 *
 * The user sets a vault password; the browser generates the data key + a 24-word phrase,
 * wraps the key under both, and uploads ciphertext only. The phrase is shown exactly once
 * — Cairn never stores it and cannot show it again — and the user must confirm they saved
 * it before continuing. This is the only moment the phrase exists in cleartext anywhere.
 */
export function RecoveryPhrasePrompt(): JSX.Element {
  const enrollVault = useSession((s) => s.enrollVault)
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState<readonly string[] | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onEnroll(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await enrollVault(password)
    setBusy(false)
    if (res.ok) setPhrase(res.data.recoveryPhrase)
    else setError(res.error.message)
  }

  if (phrase !== null) {
    return (
      <Screen>
        <Card>
          <Heading sub="Write these 24 words down and store them offline. This is the only time they're shown.">
            Your recovery phrase
          </Heading>
          <ol
            className="mb-6 grid grid-cols-3 gap-2 rounded-lg border border-border bg-black/30 p-4 font-mono text-sm"
            data-testid="recovery-phrase"
          >
            {phrase.map((word, i) => (
              <li key={`${i}-${word}`} className="text-white/80">
                <span className="mr-1 text-white/30">{i + 1}.</span>
                {word}
              </li>
            ))}
          </ol>
          <label className="mb-4 flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              data-testid="recovery-confirm"
            />
            I&apos;ve saved my recovery phrase somewhere safe.
          </label>
          <Button disabled={!confirmed} onClick={() => navigate('/')} data-testid="recovery-continue">
            Continue
          </Button>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen>
      <Card>
        <Heading sub="This password unlocks your vault on every device. It is never sent to the server.">
          Set your vault password
        </Heading>
        <form onSubmit={(e) => void onEnroll(e)} data-testid="enroll-form">
          <Field label="Vault password">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="vault-password"
              minLength={8}
              required
            />
          </Field>
          <Button type="submit" disabled={busy} data-testid="submit">
            {busy ? 'Setting up your vault…' : 'Create vault'}
          </Button>
          <ErrorText>{error}</ErrorText>
        </form>
      </Card>
    </Screen>
  )
}
