import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Card, Heading, Screen } from '@web/components/ui'
import { useSession } from '@web/lib/session'

/**
 * Post-auth resolver. Decides, for a signed-in Pro user with a locked vault, whether to
 * enroll (no key on the server yet) or unlock (key exists). When already unlocked it
 * hands off to the synced home.
 */
export function Home(): JSX.Element {
  const { vaultUnlocked, checkVaultEnrollment } = useSession(
    useShallow((s) => ({
      vaultUnlocked: s.vaultUnlocked,
      checkVaultEnrollment: s.checkVaultEnrollment,
    })),
  )
  const [target, setTarget] = useState<'loading' | 'enroll' | 'unlock'>('loading')

  useEffect(() => {
    if (vaultUnlocked) return undefined
    let active = true
    void checkVaultEnrollment().then((res) => {
      if (!active) return
      setTarget(res.ok && res.data ? 'unlock' : 'enroll')
    })
    return () => {
      active = false
    }
  }, [vaultUnlocked, checkVaultEnrollment])

  if (vaultUnlocked) return <Navigate to="/app" replace />
  if (target === 'enroll') return <Navigate to="/enroll" replace />
  if (target === 'unlock') return <Navigate to="/unlock" replace />
  return (
    <Screen>
      <Card>
        <Heading>Loading your vault…</Heading>
      </Card>
    </Screen>
  )
}
