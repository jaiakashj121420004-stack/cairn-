import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  Button,
  Card,
  ErrorText,
  Field,
  Heading,
  Input,
  MutedLink,
  Screen,
} from '@web/components/ui'
import { useSession } from '@web/lib/session'

/**
 * `/magic` requests a sign-in link; `/magic?token=…` consumes one. One screen, two modes.
 */
export function MagicConsume(): JSX.Element {
  const [params] = useSearchParams()
  const token = params.get('token')
  const { magicRequest, magicConsume } = useSession(
    useShallow((s) => ({ magicRequest: s.magicRequest, magicConsume: s.magicConsume })),
  )
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (token === null) return
    setBusy(true)
    void magicConsume(token).then((res) => {
      setBusy(false)
      if (res.ok) void navigate('/')
      else setError(res.error.message || 'That link is invalid or expired.')
    })
  }, [token, magicConsume, navigate])

  async function onRequest(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await magicRequest(email)
    setBusy(false)
    if (res.ok) setSent(true)
    else setError(res.error.message)
  }

  if (token !== null) {
    return (
      <Screen>
        <Card>
          <Heading>{busy ? 'Signing you in…' : 'Sign-in link'}</Heading>
          <ErrorText>{error}</ErrorText>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen>
      <Card>
        <Heading sub="No password needed — we'll email you a one-time link.">
          Email sign-in link
        </Heading>
        {sent ? (
          <p className="text-sm text-white/60" data-testid="magic-sent">
            If that email is registered, a sign-in link is on its way.
          </p>
        ) : (
          <form onSubmit={(e) => void onRequest(e)} data-testid="magic-form">
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
              {busy ? 'Sending…' : 'Send link'}
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
