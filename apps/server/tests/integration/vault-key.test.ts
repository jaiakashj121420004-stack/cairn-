import { randomBytes } from 'node:crypto'
import { vaultKeyOutputSchema, vaultKeyPutOutputSchema } from '@cairn/shared-zod'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestContext,
  createVerifiedUser,
  getWithAuth,
  postJson,
  putJson,
  resetState,
  teardown,
} from './helpers'
import type { TestContext } from './helpers'

/**
 * Vault key-material endpoints (CLAUDE.md §18.4; docs/security.md §3–§5).
 *
 * The server stores the wrapped data key + KDF salt + params verbatim and hands them
 * back; it never decrypts them. These tests use *fabricated* base64 blobs — the server
 * treats them as opaque, so no real libsodium crypto is needed here. Real Postgres,
 * real transactions, no mocks.
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

// ── Helpers ───────────────────────────────────────────────────────────────────────────

function b64(n: number): string {
  return Buffer.from(randomBytes(n)).toString('base64')
}

/** A valid wire `WrappedKey` (opaque to the server). */
function makeWrappedKey(): Record<string, unknown> {
  return { algorithm: 'xchacha20poly1305-ietf', nonce: b64(24), ciphertext: b64(48) }
}

/** A valid wire KDF params descriptor (matches the desktop DEFAULT_KDF_PARAMS shape). */
function makeKdf(): Record<string, unknown> {
  return { algorithm: 'argon2id', ops_limit: 3, mem_limit_bytes: 67_108_864, key_length_bytes: 32 }
}

/** A valid PUT /vault/key body. Override any field to craft malformed inputs. */
function makeKeyPut(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    wrapped_data_key: makeWrappedKey(),
    recovery_wrapped_data_key: makeWrappedKey(),
    kdf_salt: b64(16),
    kdf: makeKdf(),
    ...over,
  }
}

// ── GET /vault/key before enrollment ──────────────────────────────────────────────────

describe('GET /vault/key', () => {
  it('returns 404 NOT_FOUND before the vault is enrolled', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await getWithAuth(ctx.app, '/vault/key', accessToken)
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')
  })

  it('requires auth — 401 without token', async () => {
    const res = await getWithAuth(ctx.app, '/vault/key')
    expect(res.statusCode).toBe(401)
  })

  it('requires verified email — 403 for unverified user', async () => {
    const email = `u-${randomBytes(6).toString('hex')}@example.com`
    await postJson(ctx.app, '/auth/signup', { email, password: 'correct horse battery staple' })
    const loginRes = await postJson(ctx.app, '/auth/login', {
      email,
      password: 'correct horse battery staple',
    })
    const token: string = loginRes.json().data.accessToken
    const res = await getWithAuth(ctx.app, '/vault/key', token)
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('EMAIL_NOT_VERIFIED')
  })
})

// ── PUT /vault/key — enrollment + round-trip ──────────────────────────────────────────

describe('PUT /vault/key', () => {
  it('enrolls the vault and round-trips the descriptor through GET', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const body = makeKeyPut()

    const put = await putJson(ctx.app, '/vault/key', body, accessToken)
    expect(put.statusCode).toBe(200)
    expect(put.json().data.key_version).toBe(1)

    const get = await getWithAuth(ctx.app, '/vault/key', accessToken)
    expect(get.statusCode).toBe(200)
    const data = get.json().data as Record<string, unknown>
    expect(data.wrapped_data_key).toEqual(body.wrapped_data_key)
    expect(data.recovery_wrapped_data_key).toEqual(body.recovery_wrapped_data_key)
    expect(data.kdf_salt).toBe(body.kdf_salt)
    expect(data.kdf).toEqual(body.kdf)
    expect(data.key_version).toBe(1)
  })

  it('is an idempotent upsert: a re-wrap overwrites the blobs, key_version unchanged', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    await putJson(ctx.app, '/vault/key', makeKeyPut(), accessToken)

    // Simulate a password change / recovery re-wrap: a brand-new wrapped key + salt.
    const rewrap = makeKeyPut()
    const put2 = await putJson(ctx.app, '/vault/key', rewrap, accessToken)
    expect(put2.statusCode).toBe(200)
    expect(put2.json().data.key_version).toBe(1) // data key unchanged ⇒ same version

    const get = await getWithAuth(ctx.app, '/vault/key', accessToken)
    expect((get.json().data as { kdf_salt: string }).kdf_salt).toBe(rewrap.kdf_salt)
    expect((get.json().data as { wrapped_data_key: unknown }).wrapped_data_key).toEqual(
      rewrap.wrapped_data_key,
    )
  })

  it('requires auth — 401 without token', async () => {
    const res = await putJson(ctx.app, '/vault/key', makeKeyPut())
    expect(res.statusCode).toBe(401)
  })

  it('rejects a malformed body (bad base64 salt) with 400', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await putJson(
      ctx.app,
      '/vault/key',
      makeKeyPut({ kdf_salt: 'not base64!!' }),
      accessToken,
    )
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects a body missing the recovery wrapped key with 400', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const body = makeKeyPut()
    delete (body as Record<string, unknown>).recovery_wrapped_data_key
    const res = await putJson(ctx.app, '/vault/key', body, accessToken)
    expect(res.statusCode).toBe(400)
  })

  it('rejects an out-of-range KDF param (ops_limit) with 400', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await putJson(
      ctx.app,
      '/vault/key',
      makeKeyPut({ kdf: { ...makeKdf(), ops_limit: 0 } }),
      accessToken,
    )
    expect(res.statusCode).toBe(400)
  })
})

// ── User isolation ────────────────────────────────────────────────────────────────────

describe('vault key isolation', () => {
  it("one user's enrollment is invisible to another user", async () => {
    const { accessToken: tokenA } = await createVerifiedUser(ctx)
    const { accessToken: tokenB } = await createVerifiedUser(ctx)

    await putJson(ctx.app, '/vault/key', makeKeyPut(), tokenA)

    // B has not enrolled → still 404, and never sees A's blobs.
    const getB = await getWithAuth(ctx.app, '/vault/key', tokenB)
    expect(getB.statusCode).toBe(404)
  })
})

// ── Output-schema contract ────────────────────────────────────────────────────────────

describe('vault key output-schema contract', () => {
  it('GET and PUT responses conform to their shared output schemas', async () => {
    const { accessToken } = await createVerifiedUser(ctx)

    const put = await putJson(ctx.app, '/vault/key', makeKeyPut(), accessToken)
    expect(() => vaultKeyPutOutputSchema.parse(put.json().data)).not.toThrow()

    const get = await getWithAuth(ctx.app, '/vault/key', accessToken)
    expect(() => vaultKeyOutputSchema.parse(get.json().data)).not.toThrow()
  })
})
