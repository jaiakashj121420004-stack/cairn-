import { MotionConfig } from 'framer-motion'
import { useState, useEffect } from 'react'
import { ToastProvider } from './components/ui/toast'
import { SyncToasts } from './features/auth/SyncToasts'
import { SyncUpgradePrompt } from './features/auth/SyncUpgradePrompt'
import { BrokerWarningToasts } from './features/broker/BrokerWarningToasts'
import { DemoBanner } from './features/demo/DemoBanner'
import { OnboardingFlow } from './features/onboarding/OnboardingFlow'
import { ConflictResolver } from './features/sync/ConflictResolver'
import { GuardrailBanner } from './features/system/GuardrailBanner'
import { ipc } from './lib/ipc'
import { Router } from './router'

type AppState = 'loading' | 'onboarding' | 'app'

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [demoActive, setDemoActive] = useState(false)

  useEffect(() => {
    void (async () => {
      const [ob, demo] = await Promise.all([
        ipc.settings.get<boolean>('onboarding_completed'),
        ipc.demo.status(),
      ])
      const demoOn = demo.ok ? demo.data.active : false
      setDemoActive(demoOn)
      if ((ob.ok && ob.data === true) || demoOn) {
        setAppState('app')
      } else {
        setAppState('onboarding')
      }
    })()
  }, [])

  if (appState === 'loading') {
    return <div className="h-screen bg-background" />
  }

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <SyncToasts />
        <BrokerWarningToasts />
        <SyncUpgradePrompt />
        {appState === 'onboarding' ? (
          <OnboardingFlow
            onComplete={() => setAppState('app')}
            onEnterDemo={() => {
              setDemoActive(true)
              setAppState('app')
            }}
          />
        ) : (
          <>
            <Router />
            <ConflictResolver />
            <GuardrailBanner />
            {demoActive && <DemoBanner />}
          </>
        )}
      </ToastProvider>
    </MotionConfig>
  )
}
