// @vitest-environment node
//
// Unit test: cTrader OAuth *application* credential store (Wave 4 — cTrader P0).
//
// Covers keychain store/read/clear (validation, missing, wrong-shape), the
// keychain-first → env-fallback resolution precedence that lets a stock install
// connect without env vars, graceful degradation when the keychain is unavailable,
// and that isCtraderAppConfiguredAsync tracks resolution. A fake in-memory keytar is
// injected via the module's test seam, so no real keychain is touched.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setCtraderAppKeytarForTests,
  clearStoredCtraderAppCredentials,
  isCtraderAppConfiguredAsync,
  readStoredCtraderAppCredentials,
  resolveCtraderAppCredentials,
  storeCtraderAppCredentials,
  type KeytarLike,
} from '../../../electron/services/broker/ctrader/app-credentials'

function makeFakeKeytar(): KeytarLike & { store: Map<string, string> } {
  const store = new Map<string, string>()
  const key = (s: string, a: string): string => `${s}:${a}`
  return {
    store,
    getPassword: (s, a) => Promise.resolve(store.get(key(s, a)) ?? null),
    setPassword: (s, a, p) => {
      store.set(key(s, a), p)
      return Promise.resolve()
    },
    deletePassword: (s, a) => Promise.resolve(store.delete(key(s, a))),
  }
}

const ENV_ID = 'CTRADER_CLIENT_ID'
const ENV_SECRET = 'CTRADER_CLIENT_SECRET'
let savedEnv: { id: string | undefined; secret: string | undefined }

beforeEach(() => {
  savedEnv = { id: process.env[ENV_ID], secret: process.env[ENV_SECRET] }
  // Reflect.deleteProperty (not the `delete` operator) so no-dynamic-delete is happy
  // with the const keys; it truly removes the var (unlike `= undefined`, which stores
  // the string "undefined" and would look "set" to getEnvCtraderAppCredentials).
  Reflect.deleteProperty(process.env, ENV_ID)
  Reflect.deleteProperty(process.env, ENV_SECRET)
  __setCtraderAppKeytarForTests(makeFakeKeytar())
})

afterEach(() => {
  if (savedEnv.id === undefined) Reflect.deleteProperty(process.env, ENV_ID)
  else process.env[ENV_ID] = savedEnv.id
  if (savedEnv.secret === undefined) Reflect.deleteProperty(process.env, ENV_SECRET)
  else process.env[ENV_SECRET] = savedEnv.secret
  __setCtraderAppKeytarForTests(undefined)
})

describe('storeCtraderAppCredentials / read / clear', () => {
  it('stores and reads back a credential pair', async () => {
    const stored = await storeCtraderAppCredentials('client-1', 'secret-1')
    expect(stored.ok).toBe(true)

    const read = await readStoredCtraderAppCredentials()
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.data).toEqual({ clientId: 'client-1', clientSecret: 'secret-1' })
  })

  it('trims and rejects an empty client id or secret', async () => {
    const res = await storeCtraderAppCredentials('   ', 'secret')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('CTRADER_CREDS_INVALID')
  })

  it('returns ok(null) when nothing is stored', async () => {
    const read = await readStoredCtraderAppCredentials()
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.data).toBeNull()
  })

  it('returns ok(null) for a stored value of the wrong shape', async () => {
    const fake = makeFakeKeytar()
    fake.store.set('cairn:ctrader:app', JSON.stringify({ nope: true }))
    __setCtraderAppKeytarForTests(fake)

    const read = await readStoredCtraderAppCredentials()
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.data).toBeNull()
  })

  it('clears stored credentials', async () => {
    await storeCtraderAppCredentials('client-1', 'secret-1')
    const cleared = await clearStoredCtraderAppCredentials()
    expect(cleared.ok).toBe(true)

    const read = await readStoredCtraderAppCredentials()
    expect(read.ok && read.data).toBeNull()
  })

  it('reports KEYCHAIN_UNAVAILABLE when the keychain backend is absent', async () => {
    __setCtraderAppKeytarForTests(null)
    const res = await storeCtraderAppCredentials('a', 'b')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('KEYCHAIN_UNAVAILABLE')
  })
})

describe('resolveCtraderAppCredentials precedence', () => {
  it('prefers keychain credentials over environment variables', async () => {
    process.env[ENV_ID] = 'env-id'
    process.env[ENV_SECRET] = 'env-secret'
    await storeCtraderAppCredentials('keychain-id', 'keychain-secret')

    const creds = await resolveCtraderAppCredentials()
    expect(creds).toEqual({ clientId: 'keychain-id', clientSecret: 'keychain-secret' })
  })

  it('falls back to environment variables when the keychain is empty', async () => {
    process.env[ENV_ID] = 'env-id'
    process.env[ENV_SECRET] = 'env-secret'

    const creds = await resolveCtraderAppCredentials()
    expect(creds).toEqual({ clientId: 'env-id', clientSecret: 'env-secret' })
  })

  it('falls back to environment variables when the keychain is unavailable', async () => {
    __setCtraderAppKeytarForTests(null)
    process.env[ENV_ID] = 'env-id'
    process.env[ENV_SECRET] = 'env-secret'

    const creds = await resolveCtraderAppCredentials()
    expect(creds).toEqual({ clientId: 'env-id', clientSecret: 'env-secret' })
  })

  it('returns null when neither source has credentials', async () => {
    expect(await resolveCtraderAppCredentials()).toBeNull()
    expect(await isCtraderAppConfiguredAsync()).toBe(false)
  })

  it('isCtraderAppConfiguredAsync is true once credentials are stored', async () => {
    await storeCtraderAppCredentials('client-1', 'secret-1')
    expect(await isCtraderAppConfiguredAsync()).toBe(true)
  })
})
