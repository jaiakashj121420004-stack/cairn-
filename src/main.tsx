import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionGlobalConfig } from 'framer-motion'
import App from './App'
import './styles/globals.css'

// Honour prefers-reduced-motion globally: when set, Framer Motion completes every
// animation instantly (no springs, no AnimatePresence enter/exit delay). This is the
// correct accessibility behaviour and also makes the app deterministic under E2E,
// where Playwright sets `prefers-reduced-motion: reduce`. Reactive so it applies even
// when the preference flips after load.
const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)')
MotionGlobalConfig.skipAnimations = reducedMotionMq.matches
reducedMotionMq.addEventListener('change', (e) => {
  MotionGlobalConfig.skipAnimations = e.matches
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
