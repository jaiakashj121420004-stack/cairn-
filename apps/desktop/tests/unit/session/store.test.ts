// @vitest-environment node
import { err, ok } from '@cairn/shared-types'
import { beforeEach, describe, expect, it } from 'vitest'

import { SessionStore, type AuthClient } from '../../../electron/services/session/store'
import type { AuthClientSession } from '../../../electron/services/session/auth-client'
import type { VaultEnrollment } from '../../../electron/services/session/enrollment'
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

/** A configurable VaultEnrollment fake that records `forget` calls. */
function makeEnroller(overrides: Partial<VaultEnrollment> = {}): VaultEnrollment & {
  forgotten: string[]
} {
  const forgotten: string[] = []
  return {
    forgotten,
    unlock: () =>
      Promise.resolve(
        ok({ deviceId: 'device-1', dataKey: new Uint8Array([9, 9, 9]), enrolled: false }),
      ),
    recover: () =>
      Promise.resolve(
        ok({ deviceId: 'device-1', dataKey: new Uint8Array([7, 7, 7]), enrolled: false }),
      ),
    resume: () => Promise.resolve({ status: 'needs-password' as const }),
    forget: (userId: string) => {
      forgotten.push(userId)
      return Promise.resolve()
    },
    ...overrides,
  }
}

let persistence: ReturnType<typeof makePersistence>
let enroller: ReturnType<typeof makeEnroller>

beforeEach(() => {
  persistence = makePersistence()
  enroller = makeEnroller()
})

describe('SessionStore.login', () => {
  it('starts a session and persists the refresh token + resume metadata', async () => {
    const store = new SessionStore({ client: makeClient(), persistence, enroller })
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
    const store = new SessionStore({ client, persistence, enroller })
    const res = await store.login({ email: 'a@b.com', password: 'password123' })
    expect(res.ok).toBe(false)
    expect(store.getSession()).toBeNull()
    expect(persistence.resume).toBeNull()
  })
})

describe('SessionStore.refresh', () => {
  it('rotates the access + refresh tokens and re-persists', async () => {
    const store = new SessionStore({ client: makeClient(), persistence, enroller })
    await store.login({ email: 'a@b.com', password: 'password123' })

    const newToken = await store.refresh()
    expect(newToken).toBe('access-2')
    expect(store.getAccessToken()).toBe('access-2')
    expect(persistence.tokens.get('u1')).toBe('refresh-2')
  })

  it('returns null and keeps the old session when not signed in', async () => {
    const store = new SessionStore({ client: makeClient(), persistence, enroller })
    expect(await store.refresh()).toBeNull()
  })
})

describe('SessionStore.logout', () => {
  it('clears memory and persisted credentials', async () => {
    const store = new SessionStore({ client: makeClient(), persistence, enroller })
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
    const store = new SessionStore({ client: makeClient(), persistence, enroller })

    const restored = await store.restore()
    expect(restored?.userId).toBe('u1')
    expect(store.getAccessToken()).toBe('access-2')
    expect(persistence.tokens.get('u1')).toBe('refresh-2')
  })

  it('returns null when there is nothing to resume', async () => {
    const store = new SessionStore({ client: makeClient(), persistence, enroller })
    expect(await store.restore()).toBeNull()
  })

  it('forgets a definitively-invalid token but keeps it on a transient error', async () => {
    persistence.saveResume({ userId: 'u1', email: 'a@b.com' })
    persistence.tokens.set('u1', 'refresh-old')

    const invalid = new SessionStore({
      client: makeClient({ refresh: () => Promise.resolve(err('INVALID_TOKEN', 'stale')) }),
      persistence,
      enroller,
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
      enroller,
    })
    expect(await offline.restore()).toBeNull()
    expect(persistence.tokens.get('u1')).toBe('refresh-old')
  })
})

describe('SessionStore vault seam (Stage 3 forward)', () => {
  it('reflects an unlocked vault in the snapshot and SyncContext', async () => {
    const store = new SessionStore({ client: makeClient(), persistence, enroller })
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

describe('SessionStore.unlockVault', () => {
  it('requires a session', async () => {
    const store = new SessionStore({ client: makeClient(), persistence, enroller })
    const res = await store.unlockVault('password123')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('UNAUTHENTICATED')
  })

  it('populates the device id + data key and activates sync on success', async () => {
    const activated: string[] = []
    const enrol = makeEnroller({
      unlock: () =>
        Promise.resolve(
          ok({ deviceId: 'dev-x', dataKey: new Uint8Array([7, 7]), enrolled: false }),
        ),
    })
    const store = new SessionStore({
      client: makeClient(),
      persistence,
      enroller: enrol,
      onVaultActivate: (id) => activated.push(id),
    })
    await store.login({ email: 'a@b.com', password: 'password123' })

    const res = await store.unlockVault('password123')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.enrolled).toBe(false)
    expect(store.getDeviceId()).toBe('dev-x')
    expect(store.getDataKey()).toEqual(new Uint8Array([7, 7]))
    expect(activated).toEqual(['dev-x'])
  })

  it('returns the recovery phrase once on first enrollment', async () => {
    const enrol = makeEnroller({
      unlock: () =>
        Promise.resolve(
          ok({
            deviceId: 'dev-x',
            dataKey: new Uint8Array([1]),
            enrolled: true,
            recoveryPhrase: ['alpha', 'bravo'],
          }),
        ),
    })
    const store = new SessionStore({ client: makeClient(), persistence, enroller: enrol })
    await store.login({ email: 'a@b.com', password: 'password123' })

    const res = await store.unlockVault('password123')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.enrolled).toBe(true)
      expect(res.data.recoveryPhrase).toEqual(['alpha', 'bravo'])
    }
  })

  it('converts a thrown enroller error into an INTERNAL Result (boundary never rejects)', async () => {
    const activated: string[] = []
    const enrol = makeEnroller({
      unlock: () => Promise.reject(new Error('crypto blew up')),
    })
    const store = new SessionStore({
      client: makeClient(),
      persistence,
      enroller: enrol,
      onVaultActivate: (id) => activated.push(id),
    })
    await store.login({ email: 'a@b.com', password: 'password123' })

    const res = await store.unlockVault('password123')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('INTERNAL')
    expect(store.getDataKey()).toBeNull()
    expect(activated).toEqual([]) // sync not activated on failure
  })

  it('retries once with a refreshed token when the first call is unauthenticated', async () => {
    const tokens: string[] = []
    const enrol = makeEnroller({
      unlock: (p) => {
        tokens.push(p.accessToken)
        return tokens.length === 1
          ? Promise.resolve(err('UNAUTHENTICATED', 'expired'))
          : Promise.resolve(
              ok({ deviceId: 'dev-x', dataKey: new Uint8Array([2]), enrolled: false }),
            )
      },
    })
    const store = new SessionStore({ client: makeClient(), persistence, enroller: enrol })
    await store.login({ email: 'a@b.com', password: 'password123' })

    const res = await store.unlockVault('password123')
    expect(res.ok).toBe(true)
    // First with the login token, then with the refreshed one.
    expect(tokens).toEqual(['access-1', 'access-2'])
  })
})

describe('SessionStore.resumeVault', () => {
  it('reports no-session when signed out', async () => {
    const store = new SessionStore({ client: makeClient(), persistence, enroller })
    expect(await store.resumeVault()).toBe('no-session')
  })

  it('unlocks from a keychain hit without a password and activates sync', async () => {
    const activated: string[] = []
    const enrol = makeEnroller({
      resume: () =>
        Promise.resolve({
          status: 'unlocked' as const,
          deviceId: 'dev-k',
          dataKey: new Uint8Array([5]),
        }),
    })
    const store = new SessionStore({
      client: makeClient(),
      persistence,
      enroller: enrol,
      onVaultActivate: (id) => activated.push(id),
    })
    await store.login({ email: 'a@b.com', password: 'password123' })

    expect(await store.resumeVault()).toBe('unlocked')
    expect(store.getDeviceId()).toBe('dev-k')
    expect(activated).toEqual(['dev-k'])
  })

  it('reports needs-password on a keychain miss', async () => {
    const store = new SessionStore({ client: makeClient(), persistence, enroller })
    await store.login({ email: 'a@b.com', password: 'password123' })
    expect(await store.resumeVault()).toBe('needs-password')
  })
})

describe('SessionStore vault teardown', () => {
  it('clears the cached data key and deactivates sync on logout', async () => {
    const deactivated: number[] = []
    const store = new SessionStore({
      client: makeClient(),
      persistence,
      enroller,
      onVaultDeactivate: () => deactivated.push(1),
    })
    await store.login({ email: 'a@b.com', password: 'password123' })
    await store.logout()

    expect(enroller.forgotten).toEqual(['u1'])
    expect(deactivated).toEqual([1])
  })

  it('deactivates sync and forgets the key on lock', async () => {
    const deactivated: number[] = []
    const store = new SessionStore({
      client: makeClient(),
      persistence,
      enroller,
      onVaultDeactivate: () => deactivated.push(1),
    })
    await store.login({ email: 'a@b.com', password: 'password123' })
    store.setVaultUnlocked('dev-1', new Uint8Array([1]))

    store.lockVault()
    expect(store.getDataKey()).toBeNull()
    expect(deactivated).toEqual([1])
    expect(enroller.forgotten).toEqual(['u1'])
  })
})

describe('SessionStore.onSessionChange', () => {
  it('fires with the email on login and with null on logout', async () => {
    const changes: (string | null)[] = []
    const store = new SessionStore({
      client: makeClient(),
      persistence,
      enroller,
      onSessionChange: (email) => changes.push(email),
    })

    await store.login({ email: 'a@b.com', password: 'password123' })
    expect(changes).toEqual(['a@b.com'])

    await store.logout()
    expect(changes).toEqual(['a@b.com', null])
  })

  it('fires again on refresh (token rotation re-adopts the session)', async () => {
    const changes: (string | null)[] = []
    const store = new SessionStore({
      client: makeClient(),
      persistence,
      enroller,
      onSessionChange: (email) => changes.push(email),
    })

    await store.login({ email: 'a@b.com', password: 'password123' })
    await store.refresh()
    expect(changes).toEqual(['a@b.com', 'a@b.com'])
  })

  it('is a no-op by default', async () => {
    const store = new SessionStore({ client: makeClient(), persistence, enroller })
    await expect(
      store.login({ email: 'a@b.com', password: 'password123' }),
    ).resolves.toMatchObject({ ok: true })
    await expect(store.logout()).resolves.toMatchObject({ ok: true })
  })
})
