// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  VaultHttpClient,
  type VaultFetchLike,
} from '../../../electron/services/session/vault-client'

/** Build a fake fetch that records calls and returns a scripted status + JSON body. */
function fakeFetch(scripted: { status: number; body?: unknown; throws?: boolean }): {
  fetchImpl: VaultFetchLike
  calls: Array<{ url: string; init: Parameters<VaultFetchLike>[1] }>
} {
  const calls: Array<{ url: string; init: Parameters<VaultFetchLike>[1] }> = []
  const fetchImpl: VaultFetchLike = (url, init) => {
    calls.push({ url, init })
    if (scripted.throws) return Promise.reject(new Error('offline'))
    return Promise.resolve({
      status: scripted.status,
      text: () => Promise.resolve(scripted.body === undefined ? '' : JSON.stringify(scripted.body)),
    })
  }
  return { fetchImpl, calls }
}

const b64 = (n: number, fill: number): string => Buffer.alloc(n, fill).toString('base64')

const DESCRIPTOR = {
  wrapped_data_key: {
    algorithm: 'xchacha20poly1305-ietf',
    nonce: b64(24, 1),
    ciphertext: b64(48, 2),
  },
  recovery_wrapped_data_key: {
    algorithm: 'xchacha20poly1305-ietf',
    nonce: b64(24, 3),
    ciphertext: b64(48, 4),
  },
  kdf_salt: b64(16, 5),
  kdf: { algorithm: 'argon2id', ops_limit: 3, mem_limit_bytes: 67_108_864, key_length_bytes: 32 },
  key_version: 1,
}

describe('VaultHttpClient.getVaultKey', () => {
  it('returns ok(null) on a 404 (vault not enrolled)', async () => {
    const { fetchImpl } = fakeFetch({
      status: 404,
      body: { ok: false, error: { code: 'NOT_FOUND', message: 'x' } },
    })
    const client = new VaultHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.getVaultKey('tok')
    expect(res).toEqual({ ok: true, data: null })
  })

  it('returns the validated descriptor on 200 and sends a bearer token', async () => {
    const { fetchImpl, calls } = fakeFetch({ status: 200, body: { ok: true, data: DESCRIPTOR } })
    const client = new VaultHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.getVaultKey('tok-abc')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data?.key_version).toBe(1)
    expect(calls[0]?.init.headers['authorization']).toBe('Bearer tok-abc')
    expect(calls[0]?.url).toBe('http://api/vault/key')
  })

  it('returns INTERNAL when the descriptor is malformed', async () => {
    const { fetchImpl } = fakeFetch({ status: 200, body: { ok: true, data: { kdf_salt: 'x' } } })
    const client = new VaultHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.getVaultKey('tok')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('INTERNAL')
  })

  it('passes through an auth error body', async () => {
    const { fetchImpl } = fakeFetch({
      status: 401,
      body: { ok: false, error: { code: 'UNAUTHENTICATED', message: 'no' } },
    })
    const client = new VaultHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.getVaultKey('tok')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('UNAUTHENTICATED')
  })

  it('returns NETWORK_ERROR when the fetch throws', async () => {
    const { fetchImpl } = fakeFetch({ status: 0, throws: true })
    const client = new VaultHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.getVaultKey('tok')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NETWORK_ERROR')
  })
})

describe('VaultHttpClient.putVaultKey', () => {
  it('returns the key_version ack on success', async () => {
    const { fetchImpl, calls } = fakeFetch({
      status: 200,
      body: { ok: true, data: { key_version: 1 } },
    })
    const client = new VaultHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.putVaultKey(
      {
        wrapped_data_key: DESCRIPTOR.wrapped_data_key,
        recovery_wrapped_data_key: DESCRIPTOR.recovery_wrapped_data_key,
        kdf_salt: DESCRIPTOR.kdf_salt,
        kdf: DESCRIPTOR.kdf,
      },
      'tok',
    )
    expect(res.ok).toBe(true)
    expect(calls[0]?.init.method).toBe('PUT')
  })

  it('rejects an invalid payload before any request', async () => {
    const { fetchImpl, calls } = fakeFetch({
      status: 200,
      body: { ok: true, data: { key_version: 1 } },
    })
    const client = new VaultHttpClient({ baseUrl: 'http://api', fetchImpl })
    // @ts-expect-error — deliberately malformed payload
    const res = await client.putVaultKey({ kdf_salt: 'x' }, 'tok')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_FAILED')
    expect(calls).toHaveLength(0)
  })
})

describe('VaultHttpClient.registerDevice', () => {
  it('returns the validated device record on success', async () => {
    const device = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'My Mac',
      platform: 'darwin',
      registered_at: '2026-06-05T00:00:00.000Z',
      last_seen_at: null,
      revoked_at: null,
    }
    const { fetchImpl, calls } = fakeFetch({ status: 200, body: { ok: true, data: { device } } })
    const client = new VaultHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.registerDevice({ name: 'My Mac', platform: 'darwin' }, 'tok')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.device.id).toBe(device.id)
    expect(calls[0]?.url).toBe('http://api/devices')
  })
})
