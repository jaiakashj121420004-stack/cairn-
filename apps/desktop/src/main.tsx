import { MotionGlobalConfig } from 'framer-motion'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { GateOverlay } from './features/pre-trade-gate/GateOverlay'
import { initRendererTelemetry } from './lib/telemetry'
import './styles/globals.css'

// The pre-trade gate opens a second, frameless BrowserWindow loaded at
// `#gate-overlay` (see electron/services/pre-trade-gate/gate-controller.ts). That
// window renders only the overlay — never the full app chrome — so we branch here
// at the mount root rather than inside <App/> (keeps App's hooks unconditional).
const isGateOverlay = window.location.hash.startsWith('#gate-overlay')

// Opt-in crash telemetry. No-op unless the user enabled it in Settings (§2.4).
void initRendererTelemetry()

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
  <React.StrictMode>{isGateOverlay ? <GateOverlay /> : <App />}</React.StrictMode>,
)
