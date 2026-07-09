import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, ErrorText, Heading, MutedLink, Screen } from '@web/components/ui'
import { useSession } from '@web/lib/session'

/**
 * Two modes: with `?token=…` it consumes the verification token; without one it shows a
 * "check your inbox" pending state after signup.
 */
export function VerifyEmail(): JSX.Element {
  const [params] = useSearchParams()
  const token = params.get('token')
  const email = params.get('email')
  const verifyEmail = useSession((s) => s.verifyEmail)
  const navigate = useNavigate()
  const [state, setState] = useState<'idle' | 'verifying' | 'done' | 'error'>(
    token ? 'verifying' : 'idle',
  )
  const [error, setError] = useState('')

  useEffect(() => {
    if (token === null) return
    void verifyEmail(token).then((res) => {
      if (res.ok) setState('done')
      else {
        setState('error')
        setError(res.error.message)
      }
    })
  }, [token, verifyEmail])

  return (
    <Screen>
      <Card>
        {state === 'idle' && (
          <>
            <Heading sub={email ?? undefined}>Check your inbox</Heading>
            <p className="text-sm text-white/60" data-testid="verify-pending">
              We sent a verification link to your email. Open it to verify, then sign in.
            </p>
          </>
        )}
        {state === 'verifying' && <Heading>Verifying…</Heading>}
        {state === 'done' && (
          <>
            <Heading>Email verified</Heading>
            <p className="mb-6 text-sm text-white/60" data-testid="verify-done">
              Your email is verified. You can now sign in and sync.
            </p>
            <Button onClick={() => navigate('/login')} data-testid="to-login">
              Continue to sign in
            </Button>
          </>
        )}
        {state === 'error' && (
          <>
            <Heading>Verification failed</Heading>
            <ErrorText>{error || 'That link is invalid or expired.'}</ErrorText>
          </>
        )}
        <div className="mt-6">
          <MutedLink to="/login">Back to sign in</MutedLink>
        </div>
      </Card>
    </Screen>
  )
}
