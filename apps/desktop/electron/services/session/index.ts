/**
 * Session module public surface + production wiring (CLAUDE.md §18.5, Stage 2).
 *
 * Exposes a lazily-constructed singleton {@link SessionStore} for the `auth:*` IPC
 * handlers and (from Stage 3) the main-process sync wiring. The store is the sync
 * engine's {@link SyncContext}, so there is one source of truth for the access token,
 * the enrolled device id, and the unwrapped data key.
 */
import { hostname } from 'os'
import log from 'electron-log'
import {
  clearDataKey as keychainClearDataKey,
  readDataKey as keychainReadDataKey,
  storeDataKey as keychainStoreDataKey,
} from '../keychain'
import { activateSync, deactivateSync } from '../sync/activate'
import { AuthHttpClient, nodeAuthFetch } from './auth-client'
import { VaultEnroller } from './enrollment'
import { createElectronDeviceIdStore, createElectronSessionPersistence } from './persistence'
import { SessionStore } from './store'
import { VaultHttpClient, nodeVaultFetch } from './vault-client'

export { AuthHttpClient, nodeAuthFetch, parseRefreshCookie } from './auth-client'
export { createElectronSessionPersistence } from './persistence'
export { SessionStore } from './store'
export { VaultEnroller } from './enrollment'
export { VaultHttpClient, nodeVaultFetch } from './vault-client'
export type { AuthClientSession, AuthFetchLike, AuthFetchResponse } from './auth-client'
export type { SessionPersistence, ResumeInfo } from './persistence'
export type { AuthClient, SessionLogger, SessionStoreDeps } from './store'
export type { VaultClient } from './vault-client'
export type { DeviceIdStore, VaultKeychain } from './enrollment'
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
    const baseUrl = getApiBaseUrl()
    const enroller = new VaultEnroller({
      client: new VaultHttpClient({ baseUrl, fetchImpl: nodeVaultFetch }),
      keychain: {
        storeDataKey: keychainStoreDataKey,
        readDataKey: keychainReadDataKey,
        clearDataKey: keychainClearDataKey,
      },
      devices: createElectronDeviceIdStore(),
      log: { warn: (msg, meta) => log.warn(msg, meta) },
    })
    store = new SessionStore({
      client: new AuthHttpClient({ baseUrl, fetchImpl: nodeAuthFetch }),
      persistence: createElectronSessionPersistence(),
      enroller,
      deviceName: safeHostname(),
      platform: process.platform,
      // Wire the sync runner to the unlocked vault. Deferred to call-time so the singleton
      // is fully constructed before `getSessionStore()` resolves inside the callback.
      onVaultActivate: (deviceId) => activateSync(getSessionStore(), deviceId, baseUrl),
      onVaultDeactivate: () => deactivateSync(),
      log: { warn: (msg, meta) => log.warn(msg, meta) },
    })
  }
  return store
}

/** The OS hostname for the device label, falling back if it is unavailable. */
function safeHostname(): string {
  try {
    const name = hostname()
    return name.length > 0 ? name : 'Cairn device'
  } catch {
    return 'Cairn device'
  }
}

/** Test seam: replace the singleton (or reset with null). */
export function __setSessionStoreForTests(fake: SessionStore | null): void {
  store = fake
}
