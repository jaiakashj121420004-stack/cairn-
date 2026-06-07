// @vitest-environment node
//
// Unit test: cTrader OAuth helpers (Wave 4 — docs/broker-integration.md §2.2 / §8).
// The network is fully mocked — no live Spotware calls in CI (CLAUDE.md §19.10).
// Covers: the read-only consent URL, the authorization-code exchange, and refresh
// (including refresh-token carry-forward when the provider omits a new one).

import { describe, it, expect } from 'vitest'
import {
  buildAuthUrl,
  exchangeCode,
  fetchTradingAccounts,
  refreshTokens,
} from '../../../electron/services/broker/ctrader/oauth'
import type { FetchLike } from '../../../electron/services/broker/ctrader/oauth'

const CLIENT_ID = 'test-client-id'
const CLIENT_SECRET = 'test-client-secret'
const NOW = Date.UTC(2024, 0, 1, 12, 0)

/** A fetch stub that returns a fixed JSON body and records the request it saw. */
function jsonFetch(
  body: unknown,
  opts: { ok?: boolean; status?: number } = {},
): {
  fetch: FetchLike
  calls: Array<{ url: string; body?: string }>
} {
  const calls: Array<{ url: string; body?: string }> = []
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, body: init?.body })
    return Promise.resolve({
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  }
  return { fetch, calls }
}

describe('cTrader OAuth — consent URL', () => {
  it('requests only the read-only `accounts` scope and the auth code flow', () => {
    const url = new URL(buildAuthUrl(CLIENT_ID, 'state-nonce'))
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('scope')).toBe('accounts')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('state-nonce')
    // Never requests the order-execution `trading` scope.
    expect(url.searchParams.get('scope')).not.toContain('trading')
  })
})

describe('cTrader OAuth — code exchange', () => {
  it('exchanges a code for tokens with an absolute expiry (minus skew)', async () => {
    const { fetch, calls } = jsonFetch({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_in: 3600,
    })
    const res = await exchangeCode(fetch, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      code: 'auth-code',
      nowMs: NOW,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.accessToken).toBe('access-1')
    expect(res.data.refreshToken).toBe('refresh-1')
    // 3600s - 60s skew → 3540s.
    expect(res.data.expiresAtMs).toBe(NOW + 3540 * 1000)
    expect(calls[0]?.body).toContain('grant_type=authorization_code')
  })

  it('returns a typed error on a non-2xx response', async () => {
    const { fetch } = jsonFetch({}, { ok: false, status: 400 })
    const res = await exchangeCode(fetch, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      code: 'bad',
      nowMs: NOW,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('CTRADER_OAUTH_HTTP')
  })
})

describe('cTrader OAuth — refresh', () => {
  it('refreshes and rotates the token pair', async () => {
    const { fetch, calls } = jsonFetch({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresIn: 1800,
    })
    const res = await refreshTokens(fetch, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: 'refresh-1',
      nowMs: NOW,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.accessToken).toBe('access-2')
    expect(res.data.refreshToken).toBe('refresh-2')
    expect(res.data.expiresAtMs).toBe(NOW + (1800 - 60) * 1000)
    expect(calls[0]?.body).toContain('grant_type=refresh_token')
  })

  it('carries the old refresh token forward when the response omits a new one', async () => {
    const { fetch } = jsonFetch({ access_token: 'access-3', expires_in: 1800 })
    const res = await refreshTokens(fetch, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: 'refresh-keep',
      nowMs: NOW,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.accessToken).toBe('access-3')
    expect(res.data.refreshToken).toBe('refresh-keep')
  })

  it('surfaces a provider error body as a typed error', async () => {
    const { fetch } = jsonFetch({ errorCode: 'INVALID_REQUEST' })
    const res = await refreshTokens(fetch, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: 'x',
      nowMs: NOW,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('CTRADER_OAUTH_ERROR')
  })
})

describe('cTrader OAuth — account discovery', () => {
  it('reads ctidTraderAccountIds across both field spellings', async () => {
    const { fetch } = jsonFetch({
      data: [
        { ctidTraderAccountId: 111, live: false },
        { accountId: '222', live: true },
      ],
    })
    const res = await fetchTradingAccounts(fetch, 'access-1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toEqual([
      { ctidTraderAccountId: 111, isLive: false },
      { ctidTraderAccountId: 222, isLive: true },
    ])
  })
})
