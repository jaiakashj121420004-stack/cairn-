/**
 * Session module public surface + production wiring (CLAUDE.md §18.5, Stage 2).
 *
 * Exposes a lazily-constructed singleton {@link SessionStore} for the `auth:*` IPC
 * handlers and (from Stage 3) the main-process sync wiring. The store is the sync
 * engine's {@link SyncContext}, so there is one source of truth for the access token,
 * the enrolled device id, and the unwrapped data key.
 */
import log from 'electron-log'
import { AuthHttpClient, nodeAuthFetch } from './auth-client'
import { createElectronSessionPersistence } from './persistence'
import { SessionStore } from './store'

export { AuthHttpClient, nodeAuthFetch, parseRefreshCookie } from './auth-client'
export { createElectronSessionPersistence } from './persistence'
export { SessionStore } from './store'
export type { AuthClientSession, AuthFetchLike, AuthFetchResponse } from './auth-client'
export type { SessionPersistence, ResumeInfo } from './persistence'
export type { AuthClient, SessionLogger, SessionStoreDeps } from './store'
export type { PublicSession } from '@cairn/shared-types'

/**
 * Base URL of the Cairn API. Configurable via `CAIRN_API_URL` so dev, staging, and
 * prod builds point at different backends without a code change (CLAUDE.md §2.11).
 * Defaults to the local Fastify dev server (`apps/server` default PORT 3000).
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env['CAIRN_API_URL']
  return fromEnv && fromEnv.length > 0 ? fromEnv : 'http://localhost:3000'
}

let store: SessionStore | null = null

/** The process-wide {@link SessionStore}, constructed on first use. */
export function getSessionStore(): SessionStore {
  if (store === null) {
    store = new SessionStore({
      client: new AuthHttpClient({ baseUrl: getApiBaseUrl(), fetchImpl: nodeAuthFetch }),
      persistence: createElectronSessionPersistence(),
      log: { warn: (msg, meta) => log.warn(msg, meta) },
    })
  }
  return store
}

/** Test seam: replace the singleton (or reset with null). */
export function __setSessionStoreForTests(fake: SessionStore | null): void {
  store = fake
}
