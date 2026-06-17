import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ErrorText, Field, Heading, Input, MutedLink, Screen } from '@web/components/ui'
import { useSession } from '@web/lib/session'

export function Signup(): JSX.Element {
  const signup = useSession((s) => s.signup)
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await signup(email, password)
    setBusy(false)
    if (res.ok) void navigate(`/verify?email=${encodeURIComponent(email)}`)
    else setError(res.error.message)
  }

  return (
    <Screen>
      <Card>
        <Heading sub="Free accounts use the desktop app. Cairn Pro adds web + sync.">
          Create your account
        </Heading>
        <form onSubmit={(e) => void onSubmit(e)} data-testid="signup-form">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="email"
              required
            />
          </Field>
          <Field label="Password">
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
            {busy ? 'Creating…' : 'Create account'}
          </Button>
          <ErrorText>{error}</ErrorText>
        </form>
        <div className="mt-6">
          <MutedLink to="/login">Already have an account? Sign in</MutedLink>
        </div>
      </Card>
    </Screen>
  )
}
