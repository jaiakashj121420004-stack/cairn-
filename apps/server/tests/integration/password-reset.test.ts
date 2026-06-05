import { randomBytes } from 'node:crypto'
import { forgotPasswordOutputSchema, resetPasswordOutputSchema } from '@cairn/shared-zod'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestContext,
  createVerifiedUser,
  postJson,
  refreshCookieFrom,
  refreshCookieHeader,
  resetState,
  teardown,
  tokenFromEmail,
} from './helpers'
import type { TestContext } from './helpers'

/**
 * Forgot-password / reset-password flow (CLAUDE.md §2.13, §18.5).
 *
 * Real Postgres, real email-token consumption, no mocks. Asserts the no-leak contract,
 * single-use tokens, that the new password works (and the old one stops), and that a
 * reset revokes existing sessions.
 */

const PASSWORD = 'correct horse battery staple'
const NEW_PASSWORD = 'a brand new much longer passphrase'

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

/** Run forgot-password for `email` and return the reset token captured from the inbox. */
async function requestReset(email: string): Promise<string> {
  const res = await postJson(ctx.app, '/auth/forgot-password', { email })
  expect(res.statusCode).toBe(200)
  expect(res.json().data).toEqual({ sent: true })
  return tokenFromEmail(ctx.email.lastTo(email)?.text ?? '')
}

describe('POST /auth/forgot-password', () => {
  it('emails a reset token for an existing account', async () => {
    const { email } = await createVerifiedUser(ctx, undefined, PASSWORD)
    const token = await requestReset(email)
    expect(token).toMatch(/^[a-f0-9]+$/)
  })

  it('returns { sent: true } and sends no email for an unknown account (no leak)', async () => {
    const unknown = `nobody-${randomBytes(6).toString('hex')}@example.com`
    const res = await postJson(ctx.app, '/auth/forgot-password', { email: unknown })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({ sent: true })
    expect(ctx.email.lastTo(unknown)).toBeUndefined()
  })

  it('conforms to the shared output schema', async () => {
    const { email } = await createVerifiedUser(ctx, undefined, PASSWORD)
    const res = await postJson(ctx.app, '/auth/forgot-password', { email })
    expect(() => forgotPasswordOutputSchema.parse(res.json().data)).not.toThrow()
  })
})

describe('POST /auth/reset-password', () => {
  it('sets a new password: the new one logs in, the old one no longer does', async () => {
    const { email } = await createVerifiedUser(ctx, undefined, PASSWORD)
    const token = await requestReset(email)

    const reset = await postJson(ctx.app, '/auth/reset-password', { token, password: NEW_PASSWORD })
    expect(reset.statusCode).toBe(200)
    expect(reset.json().data).toEqual({ reset: true })

    const newLogin = await postJson(ctx.app, '/auth/login', { email, password: NEW_PASSWORD })
    expect(newLogin.statusCode).toBe(200)

    const oldLogin = await postJson(ctx.app, '/auth/login', { email, password: PASSWORD })
    expect(oldLogin.statusCode).toBe(401)
    expect(oldLogin.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('rejects an invalid token with 400 INVALID_TOKEN', async () => {
    const res = await postJson(ctx.app, '/auth/reset-password', {
      token: 'deadbeefdeadbeefdeadbeef',
      password: NEW_PASSWORD,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_TOKEN')
  })

  it('reset tokens are single-use', async () => {
    const { email } = await createVerifiedUser(ctx, undefined, PASSWORD)
    const token = await requestReset(email)

    const first = await postJson(ctx.app, '/auth/reset-password', { token, password: NEW_PASSWORD })
    expect(first.statusCode).toBe(200)

    const second = await postJson(ctx.app, '/auth/reset-password', {
      token,
      password: 'yet another different passphrase',
    })
    expect(second.statusCode).toBe(400)
  })

  it('revokes existing sessions: a pre-reset refresh cookie no longer refreshes', async () => {
    const { email } = await createVerifiedUser(ctx, undefined, PASSWORD)

    // Establish a live session and capture its refresh cookie.
    const login = await postJson(ctx.app, '/auth/login', { email, password: PASSWORD })
    const cookie = refreshCookieFrom(login)
    expect(cookie).toBeDefined()

    const token = await requestReset(email)
    await postJson(ctx.app, '/auth/reset-password', { token, password: NEW_PASSWORD })

    const refresh = await postJson(ctx.app, '/auth/refresh', {}, refreshCookieHeader(cookie ?? ''))
    expect(refresh.statusCode).toBe(401)
  })

  it('conforms to the shared output schema', async () => {
    const { email } = await createVerifiedUser(ctx, undefined, PASSWORD)
    const token = await requestReset(email)
    const res = await postJson(ctx.app, '/auth/reset-password', { token, password: NEW_PASSWORD })
    expect(() => resetPasswordOutputSchema.parse(res.json().data)).not.toThrow()
  })
})
