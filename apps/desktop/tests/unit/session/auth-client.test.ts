// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  AuthHttpClient,
  parseRefreshCookie,
  type AuthFetchLike,
  type AuthFetchResponse,
} from '../../../electron/services/session/auth-client'

/** Build a fake fetch that records the last call and returns a scripted response. */
function fakeFetch(response: Partial<AuthFetchResponse> & { status: number; body?: unknown }): {
  fetchImpl: AuthFetchLike
  calls: Array<{ url: string; init: Parameters<AuthFetchLike>[1] }>
} {
  const calls: Array<{ url: string; init: Parameters<AuthFetchLike>[1] }> = []
  const fetchImpl: AuthFetchLike = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve({
      status: response.status,
      getSetCookie: response.getSetCookie ?? (() => []),
      text: () =>
        Promise.resolve(response.body === undefined ? '' : JSON.stringify(response.body)),
    })
  }
  return { fetchImpl, calls }
}

const SESSION = {
  accessToken: 'access.jwt.token',
  expiresIn: 900,
  user: { userId: 'u1', emailVerified: false, entitlement: 'free' as const },
}

describe('parseRefreshCookie', () => {
  it('extracts the __Host-refresh value, stopping at the first attribute', () => {
    const cookies = ['__Host-refresh=abc123; Path=/; HttpOnly; Secure; SameSite=Strict']
    expect(parseRefreshCookie(cookies)).toBe('abc123')
  })

  it('returns null when the cookie is absent', () => {
    expect(parseRefreshCookie(['other=1; Path=/'])).toBeNull()
  })

  it('treats an empty value (a clear) as no token', () => {
    expect(parseRefreshCookie(['__Host-refresh=; Path=/; Max-Age=0'])).toBeNull()
  })
})

describe('AuthHttpClient.login', () => {
  it('returns the session paired with the refresh token from the cookie', async () => {
    const { fetchImpl, calls } = fakeFetch({
      status: 200,
      body: { ok: true, data: SESSION },
      getSetCookie: () => ['__Host-refresh=r3fr3sh; Path=/; HttpOnly'],
    })
    const client = new AuthHttpClient({ baseUrl: 'https://api.test/', fetchImpl })
    const res = await client.login({ email: 'a@b.com', password: 'password123' })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.session.accessToken).toBe('access.jwt.token')
      expect(res.data.refreshToken).toBe('r3fr3sh')
    }
    // Base URL trailing slash is trimmed.
    expect(calls[0]?.url).toBe('https://api.test/auth/login')
  })

  it('passes through a server error body verbatim', async () => {
    const { fetchImpl } = fakeFetch({
      status: 401,
      body: { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'nope' } },
    })
    const client = new AuthHttpClient({ baseUrl: 'https://api.test', fetchImpl })
    const res = await client.login({ email: 'a@b.com', password: 'password123' })
    expect(res).toEqual({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'nope' } })
  })

  it('errors when login succeeds but no refresh cookie is set', async () => {
    const { fetchImpl } = fakeFetch({ status: 200, body: { ok: true, data: SESSION } })
    const client = new AuthHttpClient({ baseUrl: 'https://api.test', fetchImpl })
    const res = await client.login({ email: 'a@b.com', password: 'password123' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('INTERNAL')
  })

  it('validates input before hitting the network', async () => {
    const fetchImpl = vi.fn()
    const client = new AuthHttpClient({
      baseUrl: 'https://api.test',
      fetchImpl: fetchImpl as unknown as AuthFetchLike,
    })
    const res = await client.login({ email: 'not-an-email', password: 'short' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_FAILED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('AuthHttpClient.refresh', () => {
  it('sends the refresh token as a cookie header and returns the rotated token', async () => {
    const { fetchImpl, calls } = fakeFetch({
      status: 200,
      body: { ok: true, data: SESSION },
      getSetCookie: () => ['__Host-refresh=rotated; Path=/'],
    })
    const client = new AuthHttpClient({ baseUrl: 'https://api.test', fetchImpl })
    const res = await client.refresh('old-token')

    expect(calls[0]?.init.headers['cookie']).toBe('__Host-refresh=old-token')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.refreshToken).toBe('rotated')
  })
})

describe('AuthHttpClient network failure', () => {
  it('maps a thrown fetch to a NETWORK_ERROR result', async () => {
    const fetchImpl: AuthFetchLike = () => Promise.reject(new Error('offline'))
    const client = new AuthHttpClient({ baseUrl: 'https://api.test', fetchImpl })
    const res = await client.signup({ email: 'a@b.com', password: 'password123' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NETWORK_ERROR')
  })
})

describe('AuthHttpClient.logout', () => {
  it('always resolves ok, even on a server error', async () => {
    const { fetchImpl } = fakeFetch({ status: 500, body: null })
    const client = new AuthHttpClient({ baseUrl: 'https://api.test', fetchImpl })
    expect(await client.logout('tok')).toEqual({ ok: true, data: undefined })
  })
})
