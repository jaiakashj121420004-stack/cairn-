import { initCrypto } from '@cairn/shared-crypto'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { registerServiceWorker } from './lib/register-sw'
import { ensureCsrfToken } from './lib/session'
import './styles.css'

/**
 * Web client entry (CLAUDE.md §3.1c, §18.7). Mirrors the desktop's `main.tsx`: honours
 * reduced-motion, mounts under StrictMode. Additionally it (1) initialises libsodium so
 * the in-browser crypto is ready before any unlock, (2) seeds the CSRF double-submit
 * token, and (3) registers the read-only offline service worker.
 */

ensureCsrfToken()
void initCrypto()
registerServiceWorker()

// Test-only window hooks for the Playwright suite. Tree-shaken out of production builds
// (the dynamic import is guarded by the statically-false `import.meta.env.DEV`).
if (import.meta.env.DEV) {
  void import('./lib/test-hooks').then((m) => m.installTestHooks())
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
