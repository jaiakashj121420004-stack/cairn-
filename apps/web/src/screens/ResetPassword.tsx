import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, ErrorText, Field, Heading, Input, MutedLink, Screen } from '@web/components/ui'
import { useSession } from '@web/lib/session'

export function ResetPassword(): JSX.Element {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const resetPassword = useSession((s) => s.resetPassword)
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await resetPassword(token, password)
    setBusy(false)
    if (res.ok) navigate('/login')
    else setError(res.error.message)
  }

  return (
    <Screen>
      <Card>
        <Heading sub="Choose a new password. You'll re-unlock the vault with your recovery phrase.">
          Set a new password
        </Heading>
        {token === '' ? (
          <ErrorText>This reset link is missing its token.</ErrorText>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} data-testid="reset-form">
            <Field label="New password">
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="password"
                minLength={8}
                required
              />
            </Field>
            <Button type="submit" disabled={busy} data-testid="submit">
              {busy ? 'Saving…' : 'Save password'}
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
