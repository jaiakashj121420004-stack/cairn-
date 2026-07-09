import { describe, expect, it, vi } from 'vitest'
import { HttpCore, type FetchImpl } from './http-core'

/**
 * Tests for the auth core's two hardest-to-get-right behaviours (CLAUDE.md §19.10):
 * single-flight refresh coalescing and server→Result mapping. Both run without a network
 * via an injected fetch.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const BASE = 'https://api.test'

describe('HttpCore.refresh coalescing', () => {
  it('fires exactly one /auth/refresh for a burst of concurrent 401s', async () => {
    let refreshCount = 0
    // Each protected call 401s once, then succeeds after refresh.
    const seen = new Map<string, number>()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        refreshCount += 1
        // Simulate latency so all three protected calls overlap on the refresh.
        await new Promise((r) => setTimeout(r, 10))
        return jsonResponse(200, { ok: true, data: { accessToken: 'fresh' } })
      }
      const n = (seen.get(url) ?? 0) + 1
      seen.set(url, n)
      return n === 1
        ? jsonResponse(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'expired' } })
        : jsonResponse(200, { ok: true, data: { url } })
    }) as unknown as FetchImpl

    const core = new HttpCore({ baseUrl: BASE, fetchImpl, readCsrfToken: () => 'csrf-token' })
    core.setAccessToken('stale')

    const results = await Promise.all([
      core.call('GET', '/vault/manifest'),
      core.call('GET', '/vault/pull'),
      core.call('GET', '/vault/key'),
    ])

    expect(refreshCount).toBe(1)
    expect(results.every((r) => r.ok)).toBe(true)
  })

  it('sends the CSRF token on refresh and the new bearer on retry', async () => {
    const authHeaders: (string | null)[] = []
    let csrfOnRefresh: string | null = null
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const headers = new Headers(init?.headers)
        if (url.endsWith('/auth/refresh')) {
          csrfOnRefresh = headers.get('x-csrf-token')
          return jsonResponse(200, { ok: true, data: { accessToken: 'newtoken' } })
        }
        authHeaders.push(headers.get('authorization'))
        return authHeaders.length === 1
          ? jsonResponse(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'x' } })
          : jsonResponse(200, { ok: true, data: { done: true } })
      },
    ) as unknown as FetchImpl

    const core = new HttpCore({ baseUrl: BASE, fetchImpl, readCsrfToken: () => 'the-csrf' })
    core.setAccessToken('old')
    const r = await core.call('POST', '/vault/push', { ops: [] })

    expect(r.ok).toBe(true)
    expect(csrfOnRefresh).toBe('the-csrf')
    expect(authHeaders[0]).toBe('Bearer old')
    expect(authHeaders[1]).toBe('Bearer newtoken')
  })

  it('returns UNAUTHENTICATED and calls onAuthLost when refresh fails', async () => {
    const onAuthLost = vi.fn()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      if (url.endsWith('/auth/refresh'))
        return jsonResponse(401, { ok: false, error: { code: 'INVALID_TOKEN', message: 'reuse' } })
      return jsonResponse(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'x' } })
    }) as unknown as FetchImpl

    const core = new HttpCore({ baseUrl: BASE, fetchImpl, readCsrfToken: () => null, onAuthLost })
    core.setAccessToken('old')
    const r = await core.call('GET', '/vault/manifest')

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('UNAUTHENTICATED')
    expect(onAuthLost).toHaveBeenCalledOnce()
  })

  it('does not loop: a 401 right after refresh is returned, not re-refreshed', async () => {
    let refreshCount = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        refreshCount += 1
        return jsonResponse(200, { ok: true, data: { accessToken: 'fresh' } })
      }
      return jsonResponse(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'still' } })
    }) as unknown as FetchImpl

    const core = new HttpCore({ baseUrl: BASE, fetchImpl })
    core.setAccessToken('old')
    const r = await core.call('GET', '/vault/manifest')

    expect(refreshCount).toBe(1)
    expect(r.ok).toBe(false)
  })
})

describe('HttpCore.mapResponse', () => {
  it('maps a success envelope to ok(data)', async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, { ok: true, data: { x: 1 } })) as unknown as FetchImpl
    const core = new HttpCore({ baseUrl: BASE, fetchImpl })
    const r = await core.call<{ x: number }>('GET', '/health')
    expect(r).toEqual({ ok: true, data: { x: 1 } })
  })

  it('maps an error envelope preserving the code', async () => {
    const fetchImpl = (async () =>
      jsonResponse(400, {
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: 'bad' },
      })) as unknown as FetchImpl
    const core = new HttpCore({ baseUrl: BASE, fetchImpl })
    const r = await core.call('POST', '/vault/push', {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('VALIDATION_FAILED')
  })

  it('derives a code from the HTTP status when the body is not an envelope', async () => {
    const fetchImpl = (async () =>
      new Response('<html>502</html>', { status: 502 })) as unknown as FetchImpl
    const core = new HttpCore({ baseUrl: BASE, fetchImpl })
    const r = await core.call('GET', '/vault/manifest', undefined, { retryOnUnauthorized: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('INTERNAL')
  })
})
