/**
 * cTrader OAuth *application* credentials (Wave 4 — `docs/broker-integration.md` §2.2).
 *
 * The client id + secret identify Cairn's registered Spotware application (distinct
 * from the per-user OAuth *tokens* in `tokens.ts`). They are resolved with this
 * precedence:
 *   1. the OS keychain — set by the user in Settings → Integrations → cTrader, then
 *   2. the `CTRADER_CLIENT_ID` / `CTRADER_CLIENT_SECRET` environment variables.
 *
 * Keychain-first lets a normal desktop install connect cTrader with no env vars at
 * all (the review's P0 blocker); env vars still work for dev/CI. The secret lives
 * ONLY in the OS keychain (via keytar) or the environment — never in the SQLite
 * `settings` table, never in source, never in logs (CLAUDE.md §2.13 / §19). keytar is
 * loaded lazily and degrades gracefully; a test seam injects a fake store so unit
 * tests never touch the real keychain.
 *
 * Read-only forever: these credentials only ever request the read-only `accounts`
 * OAuth scope (`config.ts`); they cannot express an order write (CLAUDE.md §14 #37).
 */

import { err, ok } from '@cairn/shared-types'
import { getSecureStore } from '../../secure-store'
import type { Result } from '@cairn/shared-types'

const SERVICE = 'cairn'
const ACCOUNT = 'ctrader:app'

/** The OAuth application credentials for Cairn's registered Spotware app. */
export interface CtraderAppCredentials {
  readonly clientId: string
  readonly clientSecret: string
}

/** The subset of the secret store used here. Injectable for tests (mirrors `tokens.ts`). */
export interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

let testOverride: KeytarLike | null | undefined

/** Test seam: inject a fake secret store (or `null` to simulate unavailability). */
export function __setCtraderAppKeytarForTests(fake: KeytarLike | null | undefined): void {
  testOverride = fake
}

async function loadKeytar(): Promise<KeytarLike | null> {
  if (testOverride !== undefined) return testOverride
  return getSecureStore()
}

function isCreds(value: unknown): value is CtraderAppCredentials {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return (
    typeof c['clientId'] === 'string' &&
    c['clientId'].length > 0 &&
    typeof c['clientSecret'] === 'string' &&
    c['clientSecret'].length > 0
  )
}

/**
 * Persist user-supplied app credentials to the OS keychain. Both fields are required
 * and trimmed; an empty pair is rejected rather than stored.
 */
export async function storeCtraderAppCredentials(
  clientId: string,
  clientSecret: string,
): Promise<Result<void>> {
  const id = clientId.trim()
  const secret = clientSecret.trim()
  if (!id || !secret) {
    return err('CTRADER_CREDS_INVALID', 'client id and secret are both required')
  }
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    await keytar.setPassword(
      SERVICE,
      ACCOUNT,
      JSON.stringify({ clientId: id, clientSecret: secret }),
    )
    return ok(undefined)
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to store cTrader credentials in OS keychain')
  }
}

/** Read stored app credentials from the keychain, or `ok(null)` if none/corrupt. */
export async function readStoredCtraderAppCredentials(): Promise<
  Result<CtraderAppCredentials | null>
> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    const value = await keytar.getPassword(SERVICE, ACCOUNT)
    if (value === null) return ok(null)
    const parsed: unknown = JSON.parse(value)
    return isCreds(parsed) ? ok(parsed) : ok(null)
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to read cTrader credentials from OS keychain')
  }
}

/** Remove stored app credentials (user chose "Clear" in Settings). */
export async function clearStoredCtraderAppCredentials(): Promise<Result<boolean>> {
  const keytar = await loadKeytar()
  if (!keytar) return err('KEYCHAIN_UNAVAILABLE', 'OS keychain backend is not available')
  try {
    return ok(await keytar.deletePassword(SERVICE, ACCOUNT))
  } catch {
    return err('KEYCHAIN_ERROR', 'failed to clear cTrader credentials from OS keychain')
  }
}

/** The env-sourced credentials, or null when either var is absent. */
function getEnvCtraderAppCredentials(): CtraderAppCredentials | null {
  const clientId = process.env['CTRADER_CLIENT_ID']
  const clientSecret = process.env['CTRADER_CLIENT_SECRET']
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/**
 * Resolve the effective credentials: keychain first, then environment. Returns null
 * when neither is present (Settings then shows the paste form). A keychain that is
 * unavailable/errors falls through to the environment rather than failing hard.
 */
export async function resolveCtraderAppCredentials(): Promise<CtraderAppCredentials | null> {
  const stored = await readStoredCtraderAppCredentials()
  if (stored.ok && stored.data) return stored.data
  return getEnvCtraderAppCredentials()
}

/** True when credentials are available from either source. */
export async function isCtraderAppConfiguredAsync(): Promise<boolean> {
  return (await resolveCtraderAppCredentials()) !== null
}
