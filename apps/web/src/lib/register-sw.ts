/**
 * Register the read-only offline service worker (task §5). No-op in dev (the SW would
 * fight Vite's HMR) and where service workers aren't supported. Failures are swallowed —
 * the worker is a progressive enhancement; the app is fully functional without it.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Progressive enhancement only — ignore registration failures.
    })
  })
}
