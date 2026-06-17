/*
 * Cairn web service worker — READ-ONLY offline (CLAUDE.md §3.1c, §18.7, task §5).
 *
 * Purpose: let the SPA *boot* and *read* offline. The decrypted vault lives in
 * IndexedDB (Dexie), which the page reads directly without the network — so this worker
 * only has to keep the app shell available offline. It deliberately does NOT enable
 * offline writes: there is no background sync, no write queue, no mutation replay.
 * Allowing offline writes would create local state the E2E sync model can't reconcile.
 *
 * Policy:
 *  - Precache the static shell on install.
 *  - Same-origin GET static assets: cache-first (fast, offline-capable).
 *  - Navigations: network-first, falling back to the cached shell when offline.
 *  - Anything else — the API origin, every non-GET (POST/PUT/DELETE), auth — is passed
 *    straight to the network, never cached, never queued. Offline + a mutating request
 *    simply fails, by design.
 *
 * No plaintext or key material is ever cached here: the only thing this worker stores is
 * the static, public app shell. User data never transits the Cache API.
 */

const CACHE = 'cairn-shell-v1'
const SHELL = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never touch non-GET (mutations) or cross-origin (the API). Network-only, no queue.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Navigations: try the network, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    )
    return
  }

  // Static assets: cache-first, then populate the cache on a cache miss.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone()
          void caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return res
      })
    }),
  )
})
