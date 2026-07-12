import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, emailTokens } from '../../src/db/schema'
import { sha256Hex } from '../../src/lib/crypto-random'
import {
  createTestContext,
  createVerifiedUser,
  getWithAuth,
  postJson,
  refreshCookieFrom,
  refreshCookieHeader,
  resetState,
  teardown,
  tokenFromEmail,
} from './helpers'
import type { TestContext } from './helpers'

/**
 * Auth integration tests (CLAUDE.md §18.5, §19.10). Real Postgres, real Argon2id,
 * real JWTs — only email is captured in-memory so we can read the tokens.
 */

let ctx: TestContext

beforeAll(async () => {
  ctx = await createTestContext()
})
afterAll(async () => {
  await teardown(ctx)
})
beforeEach(async () => {
  await resetState(ctx)
})

/** A distinct email per call so per-identifier rate limits never bleed across tests. */
function uniqueEmail(): string {
  return `user-${randomBytes(6).toString('hex')}@example.com`
}
const PASSWORD = 'correct horse battery staple'

async function signup(email: string, password = PASSWORD): Promise<void> {
  const res = await postJson(ctx.app, '/auth/signup', { email, password })
  expect(res.statusCode).toBe(200)
}

describe('signup', () => {
  it('creates an account and sends a verification email (happy path)', async () => {
    const email = uniqueEmail()
    const res = await postJson(ctx.app, '/auth/signup', { email, password: PASSWORD })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.data.userId).toBe('string')

    const mail = ctx.email.lastTo(email)
    expect(mail?.subject).toMatch(/verify/i)
    expect(mail?.text).toMatch(/token=[a-f0-9]+/)
  })

  it('returns an identical shape for an already-registered email (no enumeration leak)', async () => {
    const email = uniqueEmail()
    const first = await postJson(ctx.app, '/auth/signup', { email, password: PASSWORD })
    const second = await postJson(ctx.app, '/auth/signup', { email, password: PASSWORD })

    expect(second.statusCode).toBe(first.statusCode)
    const firstBody = first.json()
    const secondBody = second.json()
    expect(secondBody.ok).toBe(firstBody.ok)
    expect(Object.keys(secondBody.data)).toEqual(Object.keys(firstBody.data))
    expect(typeof secondBody.data.userId).toBe('string')
  })

  it('rejects malformed input with a validation error', async () => {
    const res = await postJson(ctx.app, '/auth/signup', { email: 'not-an-email', password: 'x' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_FAILED')
  })
})

describe('email verification', () => {
  it('verifies with a valid token (happy path)', async () => {
    const email = uniqueEmail()
    await signup(email)
    const token = tokenFromEmail(ctx.email.lastTo(email)?.text ?? '')

    const res = await postJson(ctx.app, '/auth/verify', { token })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    // After verification, a login carries emailVerified = true in the access token.
    const login = await postJson(ctx.app, '/auth/login', { email, password: PASSWORD })
    expect(login.json().data.user.emailVerified).toBe(true)
  })

  it('rejects an expired token with 400', async () => {
    const email = uniqueEmail()
    const res = await postJson(ctx.app, '/auth/signup', { email, password: PASSWORD })
    const userId: string = res.json().data.userId

    // Plant an already-expired verify token directly.
    const raw = randomBytes(32).toString('hex')
    await ctx.handle.db.insert(emailTokens).values({
      userId,
      type: 'verify',
      tokenHash: sha256Hex(raw),
      expiresAt: new Date(Date.now() - 60_000),
    })

    const verify = await postJson(ctx.app, '/auth/verify', { token: raw })
    expect(verify.statusCode).toBe(400)
    expect(verify.json().error.code).toBe('INVALID_TOKEN')
  })

  it('rejects reusing a consumed token (single-use)', async () => {
    const email = uniqueEmail()
    await signup(email)
    const token = tokenFromEmail(ctx.email.lastTo(email)?.text ?? '')

    expect((await postJson(ctx.app, '/auth/verify', { token })).statusCode).toBe(200)
    const second = await postJson(ctx.app, '/auth/verify', { token })
    expect(second.statusCode).toBe(400)
  })
})

describe('login', () => {
  it('rejects a bad password with 401, then rate-limits after 5 attempts (429)', async () => {
    const email = uniqueEmail()
    await signup(email)

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await postJson(ctx.app, '/auth/login', { email, password: 'wrong-password' })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
    }
    const blocked = await postJson(ctx.app, '/auth/login', { email, password: 'wrong-password' })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().error.code).toBe('RATE_LIMITED')
  })

  it('logs in with the correct password and sets a refresh cookie', async () => {
    const email = uniqueEmail()
    await signup(email)

    const res = await postJson(ctx.app, '/auth/login', { email, password: PASSWORD })
    expect(res.statusCode).toBe(200)
    expect(typeof res.json().data.accessToken).toBe('string')
    expect(refreshCookieFrom(res)).toBeTruthy()
  })
})

describe('refresh rotation', () => {
  it('rotates the refresh token: the old one stops working, the new one works', async () => {
    const email = uniqueEmail()
    await signup(email)
    const login = await postJson(ctx.app, '/auth/login', { email, password: PASSWORD })
    const r0 = refreshCookieFrom(login)
    expect(r0).toBeTruthy()

    // First refresh with R0 → succeeds, issues R1 (the new token works).
    const first = await postJson(ctx.app, '/auth/refresh', {}, refreshCookieHeader(r0 ?? ''))
    expect(first.statusCode).toBe(200)
    const r1 = refreshCookieFrom(first)
    expect(r1).toBeTruthy()
    expect(r1).not.toBe(r0)

    // R1 works too.
    const second = await postJson(ctx.app, '/auth/refresh', {}, refreshCookieHeader(r1 ?? ''))
    expect(second.statusCode).toBe(200)

    // The original R0 no longer works.
    const reused = await postJson(ctx.app, '/auth/refresh', {}, refreshCookieHeader(r0 ?? ''))
    expect(reused.statusCode).toBe(401)
  })
})

describe('refresh-reuse detection (the most important auth test)', () => {
  it('revokes the entire family when an old refresh token is replayed', async () => {
    const email = uniqueEmail()
    await signup(email)
    const login = await postJson(ctx.app, '/auth/login', { email, password: PASSWORD })
    const userId: string = login.json().data.user.userId
    const r0 = refreshCookieFrom(login) ?? ''

    // (b) Refresh once: R0 → R1.
    const rotated = await postJson(ctx.app, '/auth/refresh', {}, refreshCookieHeader(r0))
    expect(rotated.statusCode).toBe(200)
    const r1 = refreshCookieFrom(rotated) ?? ''
    expect(r1).toBeTruthy()

    // (c) Replay the OLD token R0 → reuse detected, family revoked, 401.
    const replay = await postJson(ctx.app, '/auth/refresh', {}, refreshCookieHeader(r0))
    expect(replay.statusCode).toBe(401)
    expect(replay.json().error.code).toBe('INVALID_TOKEN')

    // The previously-valid R1 is now also rejected — the whole family is dead.
    const r1AfterRevoke = await postJson(ctx.app, '/auth/refresh', {}, refreshCookieHeader(r1))
    expect(r1AfterRevoke.statusCode).toBe(401)

    // A critical audit row was written for the reuse event.
    const rows = await ctx.handle.db.select().from(auditLog).where(eq(auditLog.userId, userId))
    const critical = rows.find((r) => r.event === 'refresh_token_reuse')
    expect(critical).toBeDefined()
    expect(critical?.severity).toBe('critical')
  })
})

describe('magic link', () => {
  it('round-trips: request → consume → authenticated session', async () => {
    const email = uniqueEmail()
    await signup(email)

    const request = await postJson(ctx.app, '/auth/magic-request', { email })
    expect(request.statusCode).toBe(200)
    expect(request.json().data.sent).toBe(true)

    const token = tokenFromEmail(ctx.email.lastTo(email)?.text ?? '')
    const consume = await postJson(ctx.app, '/auth/magic-consume', { token })
    expect(consume.statusCode).toBe(200)
    expect(typeof consume.json().data.accessToken).toBe('string')
    // Magic link proves ownership → email is now verified.
    expect(consume.json().data.user.emailVerified).toBe(true)
    expect(refreshCookieFrom(consume)).toBeTruthy()
  })

  it('returns the same response for an unknown email (no leak)', async () => {
    const res = await postJson(ctx.app, '/auth/magic-request', { email: uniqueEmail() })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.sent).toBe(true)
  })
})

describe('GET /auth/me', () => {
  it('returns the current identity + entitlement for a valid token', async () => {
    const { accessToken, userId, email } = await createVerifiedUser(ctx)
    const res = await getWithAuth(ctx.app, '/auth/me', accessToken)
    expect(res.statusCode).toBe(200)
    const data = res.json().data as {
      userId: string
      email: string | null
      emailVerified: boolean
      entitlement: string
    }
    expect(data.userId).toBe(userId)
    expect(data.email).toBe(email)
    expect(data.emailVerified).toBe(true)
    expect(data.entitlement).toBe('free')
  })

  it('401s without a token', async () => {
    const res = await getWithAuth(ctx.app, '/auth/me')
    expect(res.statusCode).toBe(401)
  })
})

describe('verified email required for sync endpoints', () => {
  it('blocks /vault/manifest until the email is verified', async () => {
    const email = uniqueEmail()
    await signup(email)

    // Unauthenticated → 401.
    const noAuth = await getWithAuth(ctx.app, '/vault/manifest')
    expect(noAuth.statusCode).toBe(401)

    // Authenticated but UNVERIFIED → 403.
    const login = await postJson(ctx.app, '/auth/login', { email, password: PASSWORD })
    const unverifiedToken: string = login.json().data.accessToken
    expect(login.json().data.user.emailVerified).toBe(false)
    const forbidden = await getWithAuth(ctx.app, '/vault/manifest', unverifiedToken)
    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.json().error.code).toBe('EMAIL_NOT_VERIFIED')

    // Verify, re-login, then access → 200.
    const token = tokenFromEmail(ctx.email.lastTo(email)?.text ?? '')
    await postJson(ctx.app, '/auth/verify', { token })
    const reLogin = await postJson(ctx.app, '/auth/login', { email, password: PASSWORD })
    const verifiedToken: string = reLogin.json().data.accessToken
    const ok = await getWithAuth(ctx.app, '/vault/manifest', verifiedToken)
    expect(ok.statusCode).toBe(200)
    expect(ok.json().ok).toBe(true)
  })

  it('OAuth stubs return 501 NOT_IMPLEMENTED', async () => {
    for (const provider of ['apple', 'google']) {
      const res = await ctx.app.inject({ method: 'GET', url: `/auth/oauth/${provider}` })
      expect(res.statusCode).toBe(501)
      expect(res.json().error.code).toBe('NOT_IMPLEMENTED')
    }
  })
})
