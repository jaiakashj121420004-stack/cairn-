/**
 * cTrader OAuth 2.0 authorization-code flow (Wave 4 — `docs/broker-integration.md`
 * §2.2 / §8).
 *
 * Pure transport helpers: build the consent URL, exchange the authorization code
 * for tokens, and refresh an expired access token. The HTTP client is injected
 * (`fetch`) so the network is fully mockable in tests — no live Spotware calls in
 * CI (CLAUDE.md §19.10).
 *
 * Read-only scope only (`accounts`). The `trading` scope, which would permit order
 * execution, is never requested — the safety boundary starts at the consent screen
 * (CLAUDE.md §14 #37).
 *
 * Secrets: the client secret is sent to Spotware's token endpoint over TLS only;
 * it is never logged and never persisted to disk (CLAUDE.md §2.13 / §19).
 */

import { err, ok } from '@cairn/shared-types'
import {
  CTRADER_AUTH_URL,
  CTRADER_READONLY_SCOPE,
  CTRADER_TOKEN_URL,
  getCtraderRedirectUri,
} from './config'
import type { Result } from '@cairn/shared-types'

/** Minimal `fetch` surface used here — keeps the dependency injectable for tests. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
}>

/** A decoded OAuth token pair plus the absolute expiry instant. */
export interface CtraderTokens {
  readonly accessToken: string
  readonly refreshToken: string
  /** Absolute UTC ms at which the access token expires. */
  readonly expiresAtMs: number
}

/**
 * Build the Spotware consent URL the user opens in their browser. `state` is an
 * opaque anti-CSRF nonce the caller generates and verifies on the redirect.
 */
export function buildAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCtraderRedirectUri(),
    scope: CTRADER_READONLY_SCOPE,
    response_type: 'code',
    state,
  })
  return `${CTRADER_AUTH_URL}?${params.toString()}`
}

/** Shape of a Spotware token response (snake_case, seconds-based expiry). */
interface RawTokenResponse {
  accessToken?: string
  access_token?: string
  refreshToken?: string
  refresh_token?: string
  expiresIn?: number
  expires_in?: number
  errorCode?: string
  error?: string
}

/**
 * Decode a token response. `fallbackRefreshToken` is used when the provider omits
 * a rotated refresh token (Spotware may keep the existing one on refresh); pass it
 * on refresh, omit it on the initial exchange (where a refresh token is required).
 */
function readTokens(
  raw: unknown,
  nowMs: number,
  fallbackRefreshToken?: string,
): Result<CtraderTokens> {
  const r = raw as RawTokenResponse | null
  const accessToken = r?.accessToken ?? r?.access_token
  const refreshToken = r?.refreshToken ?? r?.refresh_token ?? fallbackRefreshToken
  const expiresIn = r?.expiresIn ?? r?.expires_in
  if (r?.errorCode || r?.error) {
    return err('CTRADER_OAUTH_ERROR', String(r.errorCode ?? r.error))
  }
  if (!accessToken || !refreshToken || typeof expiresIn !== 'number') {
    return err('CTRADER_OAUTH_MALFORMED', 'token response missing access/refresh/expiry')
  }
  return ok({
    accessToken,
    refreshToken,
    // Renew a touch early so an in-flight request never races the expiry.
    expiresAtMs: nowMs + Math.max(0, expiresIn - 60) * 1000,
  })
}

/** Exchange an authorization code for an access/refresh token pair. */
export async function exchangeCode(
  fetchImpl: FetchLike,
  args: { clientId: string; clientSecret: string; code: string; nowMs: number },
): Promise<Result<CtraderTokens>> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: getCtraderRedirectUri(),
    client_id: args.clientId,
    client_secret: args.clientSecret,
  }).toString()

  let res
  try {
    res = await fetchImpl(CTRADER_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch (e) {
    return err('CTRADER_OAUTH_NETWORK', `token exchange failed: ${String(e)}`)
  }
  if (!res.ok) return err('CTRADER_OAUTH_HTTP', `token endpoint returned ${res.status}`)

  let json: unknown
  try {
    json = await res.json()
  } catch {
    return err('CTRADER_OAUTH_MALFORMED', 'token response was not JSON')
  }
  return readTokens(json, args.nowMs)
}

/** A trading account authorised by the access token. */
export interface CtraderTradingAccount {
  readonly ctidTraderAccountId: number
  readonly isLive: boolean
}

/** Spotware REST endpoint listing the accounts an access token can read. */
const CTRADER_ACCOUNTS_URL = 'https://api.spotware.com/connect/tradingaccounts'

/**
 * Read the trading accounts authorised by an access token (read-only). Used after
 * the OAuth exchange to learn the `ctidTraderAccountId` to authenticate against the
 * stream. Tolerant of the two field spellings Spotware has shipped.
 */
export async function fetchTradingAccounts(
  fetchImpl: FetchLike,
  accessToken: string,
): Promise<Result<CtraderTradingAccount[]>> {
  let res
  try {
    res = await fetchImpl(
      `${CTRADER_ACCOUNTS_URL}?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'GET',
      },
    )
  } catch (e) {
    return err('CTRADER_OAUTH_NETWORK', `account list failed: ${String(e)}`)
  }
  if (!res.ok) return err('CTRADER_OAUTH_HTTP', `accounts endpoint returned ${res.status}`)

  let json: unknown
  try {
    json = await res.json()
  } catch {
    return err('CTRADER_OAUTH_MALFORMED', 'accounts response was not JSON')
  }

  const data = (json as { data?: unknown })?.data
  if (!Array.isArray(data))
    return err('CTRADER_OAUTH_MALFORMED', 'accounts response missing data[]')

  const accounts: CtraderTradingAccount[] = []
  for (const entry of data) {
    const e = entry as Record<string, unknown>
    const id = e['ctidTraderAccountId'] ?? e['accountId']
    const idNum = typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : NaN
    if (Number.isInteger(idNum)) {
      accounts.push({
        ctidTraderAccountId: idNum,
        isLive: e['live'] === true || e['isLive'] === true,
      })
    }
  }
  return ok(accounts)
}

/** Refresh an access token using the rotating refresh token. */
export async function refreshTokens(
  fetchImpl: FetchLike,
  args: { clientId: string; clientSecret: string; refreshToken: string; nowMs: number },
): Promise<Result<CtraderTokens>> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: args.refreshToken,
    client_id: args.clientId,
    client_secret: args.clientSecret,
  }).toString()

  let res
  try {
    res = await fetchImpl(CTRADER_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch (e) {
    return err('CTRADER_OAUTH_NETWORK', `token refresh failed: ${String(e)}`)
  }
  if (!res.ok) return err('CTRADER_OAUTH_HTTP', `token endpoint returned ${res.status}`)

  let json: unknown
  try {
    json = await res.json()
  } catch {
    return err('CTRADER_OAUTH_MALFORMED', 'refresh response was not JSON')
  }
  // Spotware may rotate the refresh token, or keep it — carry the old one forward
  // when the response omits it so the next refresh still has a valid token.
  return readTokens(json, args.nowMs, args.refreshToken)
}
