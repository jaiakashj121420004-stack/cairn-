import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, postJson, resetState, teardown } from './helpers'
import type { TestContext } from './helpers'

/**
 * Signup/reset breached-password screening wired end-to-end (ASVS 2.1.7 / O11). A fake
 * checker (no network) reports one specific password as breached so we can assert the
 * service rejects it with PASSWORD_BREACHED and still accepts a clean one.
 */

const BREACHED = 'this-password-was-in-a-breach'
let ctx: TestContext

beforeAll(async () => {
  ctx = await createTestContext({
    breachedPasswordCheck: { isBreached: (pw) => Promise.resolve(pw === BREACHED) },
  })
})
afterAll(async () => {
  await teardown(ctx)
})
beforeEach(async () => {
  await resetState(ctx)
})

function newEmail(): string {
  return `u-${randomBytes(5).toString('hex')}@example.com`
}

describe('POST /auth/signup — breached-password screening (O11)', () => {
  it('rejects a known-breached password with PASSWORD_BREACHED (400)', async () => {
    const res = await postJson(ctx.app, '/auth/signup', { email: newEmail(), password: BREACHED })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: { code: string } }).error.code).toBe('PASSWORD_BREACHED')
  })

  it('accepts a clean password', async () => {
    const res = await postJson(ctx.app, '/auth/signup', {
      email: newEmail(),
      password: 'a-clean-unique-passphrase-42',
    })
    expect(res.statusCode).toBe(200)
  })
})
