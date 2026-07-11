import { err, ok, type Result } from '@cairn/shared-types'
import { getSecureStore } from './secure-store'

/**
 * OS-backed secret wrapper (CLAUDE.md §3.4, §18.4). Caches the *unwrapped* data key at
 * rest, encrypted with Electron `safeStorage` (P1.E — see `secure-store.ts`), so the
 * user does not re-enter their password for every operation within an unlocked session.
 * A legacy keytar entry is migrated transparently on first read.
 *
 * Storage shape: service `cairn`, account `dataKey:<userId>`, value = base64 of the 32
 * raw data-key bytes. (The spec shorthand `cairn:dataKey:<userId>` maps to this
 * service/account pair.) Read on app start to resume a session; cleared on lock/logout.
 * See `docs/security.md` §6.
 */

const SERVICE = 'cairn'

function accountFor(userId: string): string {
  return `dataKey:${userId}`
}

function refreshAccountFor(userId: string): string {
  return `refresh:${userId}`
}

/** The subset of `keytar` this module uses. Keeps the dependency injectable for tests. */
export interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

// The store is the shared safeStorage-backed {@link getSecureStore}; `null` means OS
// encryption is unavailable (callers then return KEYCHAIN_UNAVAILABLE). A test seam
// (`__setKeytarForTests`) lets unit tests inject a fake without touching safeStorage.
let testOverride: KeytarLike | null | undefined

/** Test seam: inject a fake secret store (or `null` to simulate unavailability). */
export function __setKeytarForTests(fake: KeytarLike | null | undefined): void {
  testOverride = fake
}

async function loadKeytar(): Promise<KeytarLike | null> {
  if (testOverride !== undefined) return testOverride
  return getSecureStore()
}

/**
 * Cache the unwrapped data key for `userId` in the OS keychain.
 * @returns `ok(void)` on success; `KEYCHAIN_UNAVAILABLE` if keytar can't load;
 *   `KEYCHAIN_ERROR` if the store rejected the write.
 */
export async function storeDataKey(userId: string, dataKey: Uint8Array): Promise<Result<void>> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    await keytar.setPassword(SERVICE, accountFor(userId), Buffer.from(dataKey).toString('base64'))
    return ok(undefined)
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to store data key in OS keychain')
  }
}

/**
 * Read the cached data key for `userId` from the OS keychain. Call on app start to
 * resume an unlocked session.
 * @returns `ok(Uint8Array)` if present, `ok(null)` if no entry exists;
 *   `KEYCHAIN_UNAVAILABLE` / `KEYCHAIN_ERROR` on failure.
 */
export async function readDataKey(userId: string): Promise<Result<Uint8Array | null>> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    const value = await keytar.getPassword(SERVICE, accountFor(userId))
    if (value === null) return ok(null)
    return ok(new Uint8Array(Buffer.from(value, 'base64')))
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to read data key from OS keychain')
  }
}

/**
 * Remove the cached data key for `userId`. Call on lock and on logout.
 * @returns `ok(true)` if an entry was deleted, `ok(false)` if none existed;
 *   `KEYCHAIN_UNAVAILABLE` / `KEYCHAIN_ERROR` on failure.
 */
export async function clearDataKey(userId: string): Promise<Result<boolean>> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    const deleted = await keytar.deletePassword(SERVICE, accountFor(userId))
    return ok(deleted)
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to clear data key from OS keychain')
  }
}

// ── Refresh token ─────────────────────────────────────────────────────────────
// The opaque rotating refresh token is the desktop's only persisted auth secret
// (CLAUDE.md §2.13, §18.5). It is stored under account `refresh:<userId>` so an app
// restart can re-establish a session without re-prompting for the password. The vault
// data key (above) remains separate — auth and vault-unlock are independent concerns.

/** Persist the (rotated) refresh token for `userId`. */
export async function storeRefreshToken(userId: string, token: string): Promise<Result<void>> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    await keytar.setPassword(SERVICE, refreshAccountFor(userId), token)
    return ok(undefined)
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to store refresh token in OS keychain')
  }
}

/** Read the persisted refresh token for `userId`, or `ok(null)` if none exists. */
export async function readRefreshToken(userId: string): Promise<Result<string | null>> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    return ok(await keytar.getPassword(SERVICE, refreshAccountFor(userId)))
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to read refresh token from OS keychain')
  }
}

/** Remove the persisted refresh token for `userId`. Call on logout. */
export async function clearRefreshToken(userId: string): Promise<Result<boolean>> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    return ok(await keytar.deletePassword(SERVICE, refreshAccountFor(userId)))
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to clear refresh token from OS keychain')
  }
}
