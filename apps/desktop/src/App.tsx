import { MotionConfig } from 'framer-motion'
import { useState, useEffect } from 'react'
import { ToastProvider } from './components/ui/toast'
import { OnboardingFlow } from './features/onboarding/OnboardingFlow'
import { ipc } from './lib/ipc'
import { Router } from './router'

type AppState = 'loading' | 'onboarding' | 'app'

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading')

  useEffect(() => {
    void ipc.settings.get<boolean>('onboarding_completed').then((res) => {
      if (res.ok && res.data === true) {
        setAppState('app')
      } else {
        setAppState('onboarding')
      }
    })
  }, [])

  if (appState === 'loading') {
    return <div className="h-screen bg-background" />
  }

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        {appState === 'onboarding' ? (
          <OnboardingFlow onComplete={() => setAppState('app')} />
        ) : (
          <Router />
        )}
      </ToastProvider>
    </MotionConfig>
  )
}
