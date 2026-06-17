import { Card, Heading, MutedLink, Screen } from '@web/components/ui'

/**
 * OAuth (Apple/Google) is stubbed server-side (`GET /auth/oauth/*` returns 501
 * NOT_IMPLEMENTED — CLAUDE.md §18 Stage 5). This page mirrors that on the client so a
 * stray callback lands somewhere honest instead of a blank route.
 */
export function OAuthCallback(): JSX.Element {
  return (
    <Screen>
      <Card>
        <Heading sub="501 — Not implemented yet">Social sign-in is coming</Heading>
        <p className="text-sm text-white/60" data-testid="oauth-501">
          Sign in with Apple and Google aren't available yet. Use your email and password, or an
          email sign-in link, for now.
        </p>
        <div className="mt-6">
          <MutedLink to="/login">Back to sign in</MutedLink>
        </div>
      </Card>
    </Screen>
  )
}
