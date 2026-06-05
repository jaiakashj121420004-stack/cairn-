// @vitest-environment node
import { err, ok } from '@cairn/shared-types'
import { beforeEach, describe, expect, it } from 'vitest'

import { SessionStore, type AuthClient } from '../../../electron/services/session/store'
import type { AuthClientSession } from '../../../electron/services/session/auth-client'
import type { ResumeInfo, SessionPersistence } from '../../../electron/services/session/persistence'

/** In-memory persistence double — no keychain, no SQLite. */
function makePersistence(): SessionPersistence & {
  resume: ResumeInfo | null
  tokens: Map<string, string>
} {
  const tokens = new Map<string, string>()
  const state: { resume: ResumeInfo | null } = { resume: null }
  return {
    get resume() {
      return state.resume
    },
    set resume(v) {
      state.resume = v
    },
    tokens,
    loadResume: () => state.resume,
    saveResume: (info) => {
      state.resume = info
    },
    clearResume: () => {
      state.resume = null
    },
    saveRefreshToken: (userId, token) => {
      tokens.set(userId, token)
      return Promise.resolve(ok(undefined))
    },
    readRefreshToken: (userId) => Promise.resolve(ok(tokens.get(userId) ?? null)),
    clearRefreshToken: (userId) => Promise.resolve(ok(tokens.delete(userId))),
  }
}

function sessionFor(token: string, refresh: string): AuthClientSession {
  return {
    session: {
      accessToken: token,
      expiresIn: 900,
      user: { userId: 'u1', emailVerified: true, entitlement: 'free' },
    },
    refreshToken: refresh,
  }
}

/** A configurable AuthClient stub. */
function makeClient(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    signup: () => Promise.resolve(ok({ userId: 'u1' })),
    login: () => Promise.resolve(ok(sessionFor('access-1', 'refresh-1'))),
    refresh: () => Promise.resolve(ok(sessionFor('access-2', 'refresh-2'))),
    logout: () => Promise.resolve(ok(undefined)),
    verifyEmail: () => Promise.resolve(ok({ verified: true })),
    forgotPassword: () => Promise.resolve(ok({ sent: true })),
    resetPassword: () => Promise.resolve(ok({ reset: true })),
    ...overrides,
  }
}

let persistence: ReturnType<typeof makePersistence>

beforeEach(() => {
  persistence = makePersistence()
})

describe('SessionStore.login', () => {
  it('starts a session and persists the refresh token + resume metadata', async () => {
    const store = new SessionStore({ client: makeClient(), persistence })
    const res = await store.login({ email: 'a@b.com', password: 'password123' })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data).toEqual({
        userId: 'u1',
        email: 'a@b.com',
        emailVerified: true,
        entitlement: 'free',
        vaultUnlocked: false,
      })
    }
    expect(persistence.tokens.get('u1')).toBe('refresh-1')
    expect(persistence.resume).toEqual({ userId: 'u1', email: 'a@b.com' })
    // SyncContext: token is live, but no device/key yet → sync stays not-ready.
    expect(store.getAccessToken()).toBe('access-1')
    expect(store.getDeviceId()).toBeNull()
    expect(store.getDataKey()).toBeNull()
  })

  it('surfaces a login failure and starts no session', async () => {
    const client = makeClient({
      login: () => Promise.resolve(err('INVALID_CREDENTIALS', 'nope')),
    })
    const store = new SessionStore({ client, persistence })
    const res = await store.login({ email: 'a@b.com', password: 'password123' })
    expect(res.ok).toBe(false)
    expect(store.getSession()).toBeNull()
    expect(persistence.resume).toBeNull()
  })
})

describe('SessionStore.refresh', () => {
  it('rotates the access + refresh tokens and re-persists', async () => {
    const store = new SessionStore({ client: makeClient(), persistence })
    await store.login({ email: 'a@b.com', password: 'password123' })

    const newToken = await store.refresh()
    expect(newToken).toBe('access-2')
    expect(store.getAccessToken()).toBe('access-2')
    expect(persistence.tokens.get('u1')).toBe('refresh-2')
  })

  it('returns null and keeps the old session when not signed in', async () => {
    const store = new SessionStore({ client: makeClient(), persistence })
    expect(await store.refresh()).toBeNull()
  })
})

describe('SessionStore.logout', () => {
  it('clears memory and persisted credentials', async () => {
    const store = new SessionStore({ client: makeClient(), persistence })
    await store.login({ email: 'a@b.com', password: 'password123' })

    await store.logout()
    expect(store.getSession()).toBeNull()
    expect(store.getAccessToken()).toBeNull()
    expect(persistence.tokens.has('u1')).toBe(false)
    expect(persistence.resume).toBeNull()
  })
})

describe('SessionStore.restore', () => {
  it('re-establishes a session from a persisted refresh token', async () => {
    persistence.saveResume({ userId: 'u1', email: 'a@b.com' })
    persistence.tokens.set('u1', 'refresh-old')
    const store = new SessionStore({ client: makeClient(), persistence })

    const restored = await store.restore()
    expect(restored?.userId).toBe('u1')
    expect(store.getAccessToken()).toBe('access-2')
    expect(persistence.tokens.get('u1')).toBe('refresh-2')
  })

  it('returns null when there is nothing to resume', async () => {
    const store = new SessionStore({ client: makeClient(), persistence })
    expect(await store.restore()).toBeNull()
  })

  it('forgets a definitively-invalid token but keeps it on a transient error', async () => {
    persistence.saveResume({ userId: 'u1', email: 'a@b.com' })
    persistence.tokens.set('u1', 'refresh-old')

    const invalid = new SessionStore({
      client: makeClient({ refresh: () => Promise.resolve(err('INVALID_TOKEN', 'stale')) }),
      persistence,
    })
    expect(await invalid.restore()).toBeNull()
    expect(persistence.tokens.has('u1')).toBe(false)
    expect(persistence.resume).toBeNull()

    // Reset, then a transient network error must NOT discard the token.
    persistence.saveResume({ userId: 'u1', email: 'a@b.com' })
    persistence.tokens.set('u1', 'refresh-old')
    const offline = new SessionStore({
      client: makeClient({ refresh: () => Promise.resolve(err('NETWORK_ERROR', 'offline')) }),
      persistence,
    })
    expect(await offline.restore()).toBeNull()
    expect(persistence.tokens.get('u1')).toBe('refresh-old')
  })
})

describe('SessionStore vault seam (Stage 3 forward)', () => {
  it('reflects an unlocked vault in the snapshot and SyncContext', async () => {
    const store = new SessionStore({ client: makeClient(), persistence })
    await store.login({ email: 'a@b.com', password: 'password123' })

    store.setVaultUnlocked('device-1', new Uint8Array([1, 2, 3]))
    expect(store.getDeviceId()).toBe('device-1')
    expect(store.getDataKey()).toEqual(new Uint8Array([1, 2, 3]))
    expect(store.getSession()?.vaultUnlocked).toBe(true)

    store.lockVault()
    expect(store.getDataKey()).toBeNull()
    expect(store.getSession()?.vaultUnlocked).toBe(false)
  })
})
