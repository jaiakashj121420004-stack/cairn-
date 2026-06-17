import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ErrorText, Field, Heading, Input, MutedLink, Screen } from '@web/components/ui'
import { useSession } from '@web/lib/session'

export function Login(): JSX.Element {
  const login = useSession((s) => s.login)
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await login(email, password)
    setBusy(false)
    if (res.ok) void navigate('/')
    else setError(res.error.code === 'INVALID_CREDENTIALS' ? 'Wrong email or password.' : res.error.message)
  }

  return (
    <Screen>
      <Card>
        <Heading sub="Sign in to sync your vault on the web.">Welcome back</Heading>
        <form onSubmit={(e) => void onSubmit(e)} data-testid="login-form">
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="password"
              required
            />
          </Field>
          <Button type="submit" disabled={busy} data-testid="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <ErrorText>{error}</ErrorText>
        </form>
        <div className="mt-6 flex items-center justify-between">
          <MutedLink to="/signup">Create account</MutedLink>
          <MutedLink to="/forgot-password">Forgot password?</MutedLink>
        </div>
        <div className="mt-3">
          <MutedLink to="/magic">Email me a sign-in link</MutedLink>
        </div>
      </Card>
    </Screen>
  )
}
