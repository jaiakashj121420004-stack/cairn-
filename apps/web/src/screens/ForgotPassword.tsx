import { useState, type FormEvent } from 'react'
import { Button, Card, ErrorText, Field, Heading, Input, MutedLink, Screen } from '@web/components/ui'
import { useSession } from '@web/lib/session'

export function ForgotPassword(): JSX.Element {
  const forgotPassword = useSession((s) => s.forgotPassword)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await forgotPassword(email)
    setBusy(false)
    if (res.ok) setSent(true)
    else setError(res.error.message)
  }

  return (
    <Screen>
      <Card>
        <Heading sub="We'll email a reset link if the account exists.">Reset your password</Heading>
        {sent ? (
          <p className="text-sm text-white/60" data-testid="forgot-sent">
            If that email is registered, a reset link is on its way. Note: a password reset cannot
            decrypt your vault — you&apos;ll re-unlock with your recovery phrase.
          </p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} data-testid="forgot-form">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="email"
                required
              />
            </Field>
            <Button type="submit" disabled={busy} data-testid="submit">
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
            <ErrorText>{error}</ErrorText>
          </form>
        )}
        <div className="mt-6">
          <MutedLink to="/login">Back to sign in</MutedLink>
        </div>
      </Card>
    </Screen>
  )
}
