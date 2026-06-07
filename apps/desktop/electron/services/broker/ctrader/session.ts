/**
 * cTrader token session (Wave 4 — `docs/broker-integration.md` §2.2 / §8).
 *
 * Bridges the keychain-backed {@link readCtraderTokens} store and the OAuth
 * {@link refreshTokens} helper into a single `getAccessToken()` the adapter calls
 * before each (re)authentication. Tokens that are within the skew window are
 * refreshed transparently and the rotated pair is written back to the keychain.
 *
 * Secrets never leave this process boundary: the access token is handed to the
 * adapter to authenticate the stream; neither token is ever logged (CLAUDE.md
 * §2.13 / §19).
 */

import { err, ok } from '@cairn/shared-types'
import { refreshTokens } from './oauth'
import { readCtraderTokens, storeCtraderTokens } from './tokens'
import type { FetchLike } from './oauth'
import type { Result } from '@cairn/shared-types'

export interface CtraderTokenProviderDeps {
  clientId: string
  clientSecret: string
  fetchImpl: FetchLike
  now: () => number
}

export interface CtraderTokenProvider {
  /** A valid access token, refreshing + persisting if the cached one has expired. */
  getAccessToken: () => Promise<Result<string>>
}

export function createCtraderTokenProvider(deps: CtraderTokenProviderDeps): CtraderTokenProvider {
  async function getAccessToken(): Promise<Result<string>> {
    const stored = await readCtraderTokens()
    if (!stored.ok) return err(stored.error.code, stored.error.message)
    if (!stored.data)
      return err('CTRADER_NOT_LINKED', 'no cTrader tokens — connect the account first')

    const nowMs = deps.now()
    if (stored.data.expiresAtMs > nowMs) return ok(stored.data.accessToken)

    // Expired (or within the skew window baked into expiresAtMs) — refresh.
    const refreshed = await refreshTokens(deps.fetchImpl, {
      clientId: deps.clientId,
      clientSecret: deps.clientSecret,
      refreshToken: stored.data.refreshToken,
      nowMs,
    })
    if (!refreshed.ok) return err(refreshed.error.code, refreshed.error.message)

    const persisted = await storeCtraderTokens(refreshed.data)
    if (!persisted.ok) return err(persisted.error.code, persisted.error.message)
    return ok(refreshed.data.accessToken)
  }

  return { getAccessToken }
}
