import { MotionConfig } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Card, Heading, Screen } from '@web/components/ui'
import { UpgradeModal } from '@web/components/UpgradeModal'
import { useSession } from '@web/lib/session'
import { Billing } from '@web/screens/Billing'
import { BillingReturn } from '@web/screens/BillingReturn'
import { ForgotPassword } from '@web/screens/ForgotPassword'
import { Home } from '@web/screens/Home'
import { Login } from '@web/screens/Login'
import { MagicConsume } from '@web/screens/MagicConsume'
import { OAuthCallback } from '@web/screens/OAuthCallback'
import { Pricing } from '@web/screens/Pricing'
import { ProGate } from '@web/screens/ProGate'
import { RecoveryPhrasePrompt } from '@web/screens/RecoveryPhrasePrompt'
import { ResetPassword } from '@web/screens/ResetPassword'
import { Signup } from '@web/screens/Signup'
import { SyncHome } from '@web/screens/SyncHome'
import { VaultUnlock } from '@web/screens/VaultUnlock'
import { VerifyEmail } from '@web/screens/VerifyEmail'

function Loading(): JSX.Element {
  return (
    <Screen>
      <Card>
        <Heading>Loading…</Heading>
      </Card>
    </Screen>
  )
}

/** Gate: must be signed in. Free/trial users hit the Pro gate; only Pro proceeds. */
function RequirePro({ children }: { children: ReactNode }): JSX.Element {
  const { status, entitlement } = useSession(
    useShallow((s) => ({ status: s.status, entitlement: s.user?.entitlement ?? 'free' })),
  )
  if (status === 'unknown') return <Loading />
  if (status === 'signedOut') return <Navigate to="/login" replace />
  if (entitlement !== 'pro' && entitlement !== 'trial') return <ProGate />
  return <>{children}</>
}

/** Gate: must be signed in, but any plan may view (pricing / billing settings). */
function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const status = useSession((s) => s.status)
  if (status === 'unknown') return <Loading />
  if (status === 'signedOut') return <Navigate to="/login" replace />
  return <>{children}</>
}

function Logout(): JSX.Element {
  const logout = useSession((s) => s.logout)
  const navigate = useNavigate()
  useEffect(() => {
    void logout().then(() => navigate('/login', { replace: true }))
  }, [logout, navigate])
  return <Loading />
}

export default function App(): JSX.Element {
  const { status, restore } = useSession(
    useShallow((s) => ({ status: s.status, restore: s.restore })),
  )

  useEffect(() => {
    if (status === 'unknown') void restore()
  }, [status, restore])

  return (
    <MotionConfig reducedMotion="user">
      <UpgradeModal />
      <Routes>
        {/* Public auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/magic" element={<MagicConsume />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/logout" element={<Logout />} />

        {/* Billing — signed in, any plan (the upgrade path itself can't require Pro) */}
        <Route
          path="/pricing"
          element={
            <RequireAuth>
              <Pricing />
            </RequireAuth>
          }
        />
        <Route
          path="/billing"
          element={
            <RequireAuth>
              <Billing />
            </RequireAuth>
          }
        />
        <Route
          path="/billing/success"
          element={
            <RequireAuth>
              <BillingReturn outcome="success" />
            </RequireAuth>
          }
        />
        <Route
          path="/billing/cancel"
          element={
            <RequireAuth>
              <BillingReturn outcome="cancel" />
            </RequireAuth>
          }
        />

        {/* Pro-gated, vault-aware routes */}
        <Route
          path="/enroll"
          element={
            <RequirePro>
              <RecoveryPhrasePrompt />
            </RequirePro>
          }
        />
        <Route
          path="/unlock"
          element={
            <RequirePro>
              <VaultUnlock />
            </RequirePro>
          }
        />
        <Route
          path="/app"
          element={
            <RequirePro>
              <SyncHome />
            </RequirePro>
          }
        />
        <Route
          path="/"
          element={
            <RequirePro>
              <Home />
            </RequirePro>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MotionConfig>
  )
}
