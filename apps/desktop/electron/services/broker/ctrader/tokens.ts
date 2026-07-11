/**
 * cTrader OAuth token store (Wave 4 — `docs/broker-integration.md` §2.2 / §8).
 *
 * The access + refresh token pair lives in the OS keychain via `keytar` — the same
 * mechanism Stage 18.4 uses for the vault data key — NEVER in plaintext on disk
 * and NEVER in logs (CLAUDE.md §2.13 / §19). Stored as one JSON blob under service
 * `cairn`, account `ctrader:tokens`.
 *
 * keytar is loaded lazily and degrades gracefully (the native module can be absent
 * or ABI-mismatched under the test runner), mirroring `services/keychain.ts`. A
 * test seam injects a fake store so the unit tests never touch the real keychain.
 */

import { err, ok } from '@cairn/shared-types'
import { getSecureStore } from '../../secure-store'
import type { CtraderTokens } from './oauth'
import type { Result } from '@cairn/shared-types'

const SERVICE = 'cairn'
const ACCOUNT = 'ctrader:tokens'

/** The subset of the secret store used here. Injectable for tests. */
export interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

let testOverride: KeytarLike | null | undefined

/** Test seam: inject a fake secret store (or `null` to simulate unavailability). */
export function __setCtraderKeytarForTests(fake: KeytarLike | null | undefined): void {
  testOverride = fake
}

async function loadKeytar(): Promise<KeytarLike | null> {
  if (testOverride !== undefined) return testOverride
  return getSecureStore()
}

function isTokens(value: unknown): value is CtraderTokens {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  return (
    typeof t['accessToken'] === 'string' &&
    typeof t['refreshToken'] === 'string' &&
    typeof t['expiresAtMs'] === 'number'
  )
}

/** Persist the token pair to the OS keychain. */
export async function storeCtraderTokens(tokens: CtraderTokens): Promise<Result<void>> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    await keytar.setPassword(SERVICE, ACCOUNT, JSON.stringify(tokens))
    return ok(undefined)
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to store cTrader tokens in OS keychain')
  }
}

/** Read the token pair, or `ok(null)` if none is stored. */
export async function readCtraderTokens(): Promise<Result<CtraderTokens | null>> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    const value = await keytar.getPassword(SERVICE, ACCOUNT)
    if (value === null) return ok(null)
    const parsed: unknown = JSON.parse(value)
    return isTokens(parsed) ? ok(parsed) : ok(null)
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to read cTrader tokens from OS keychain')
  }
}

/** Remove the stored token pair (disconnect / unlink). */
export async function clearCtraderTokens(): Promise<Result<boolean>> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    return ok(await keytar.deletePassword(SERVICE, ACCOUNT))
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to clear cTrader tokens from OS keychain')
  }
}
