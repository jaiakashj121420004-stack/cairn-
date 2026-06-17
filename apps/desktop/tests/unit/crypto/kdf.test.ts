// @vitest-environment node
import fc from 'fast-check'
import { beforeAll, describe, expect, it } from 'vitest'

import type { KDFParams } from '@cairn/shared-types'
import {
  CryptoError,
  deriveKEK,
  DEFAULT_KDF_PARAMS,
  generateSalt,
  getSodium,
  initCrypto,
  MEMLIMIT_INTERACTIVE_BYTES,
  SALT_BYTES,
} from '../../../electron/services/crypto'

beforeAll(async () => {
  await initCrypto()
})

// A deliberately cheap params set so the property tests don't spend 64 MiB × N runs.
// Argon2id correctness (matching the reference impl) is libsodium's responsibility; we
// test our *wrapper's* behaviour — determinism, sensitivity, validation — which is
// param-independent. See docs/security.md §3.1 for why no RFC 9106 KAT is pinned here.
const FAST: KDFParams = {
  algorithm: 'argon2id',
  opsLimit: 1,
  memLimitBytes: 8_192,
  keyLengthBytes: 32,
}
const hex = (b: Uint8Array): string => getSodium().to_hex(b)

describe('default KDF params match the documented (and libsodium) constants', () => {
  it('memLimitBytes equals libsodium crypto_pwhash_MEMLIMIT_INTERACTIVE (64 MiB)', () => {
    const s = getSodium()
    expect(DEFAULT_KDF_PARAMS.memLimitBytes).toBe(MEMLIMIT_INTERACTIVE_BYTES)
    expect(MEMLIMIT_INTERACTIVE_BYTES).toBe(s.crypto_pwhash_MEMLIMIT_INTERACTIVE)
  })

  it('salt length equals libsodium crypto_pwhash_SALTBYTES (16)', () => {
    expect(SALT_BYTES).toBe(getSodium().crypto_pwhash_SALTBYTES)
  })

  it('defaults are Argon2id, ops 3, 32-byte output', () => {
    expect(DEFAULT_KDF_PARAMS).toMatchObject({
      algorithm: 'argon2id',
      opsLimit: 3,
      keyLengthBytes: 32,
    })
  })
})

describe('deriveKEK', () => {
  it('is deterministic: same password + salt + params → identical KEK', async () => {
    const salt = generateSalt()
    const a = await deriveKEK('correct horse battery staple', salt, FAST)
    const b = await deriveKEK('correct horse battery staple', salt, FAST)
    expect(hex(a)).toBe(hex(b))
    expect(a).toHaveLength(32)
  })

  it('different password → different KEK (same salt)', async () => {
    const salt = generateSalt()
    const a = await deriveKEK('password-one', salt, FAST)
    const b = await deriveKEK('password-two', salt, FAST)
    expect(hex(a)).not.toBe(hex(b))
  })

  it('different salt → different KEK (same password)', async () => {
    const a = await deriveKEK('same-password', generateSalt(), FAST)
    const b = await deriveKEK('same-password', generateSalt(), FAST)
    expect(hex(a)).not.toBe(hex(b))
  })

  it('honours the requested output length', async () => {
    const salt = generateSalt()
    const k = await deriveKEK('pw', salt, { ...FAST, keyLengthBytes: 64 })
    expect(k).toHaveLength(64)
  })

  it('property: KEK is sensitive to any password byte change', async () => {
    const salt = generateSalt()
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 32 }),
        fc.string({ minLength: 1, maxLength: 32 }),
        async (p1, p2) => {
          fc.pre(p1 !== p2)
          const a = await deriveKEK(p1, salt, FAST)
          const b = await deriveKEK(p2, salt, FAST)
          expect(hex(a)).not.toBe(hex(b))
        },
      ),
      { numRuns: 25 },
    )
  })
})

describe('deriveKEK input validation (must REFUSE)', () => {
  it('rejects a salt that is not 16 bytes (INVALID_SALT_LENGTH)', async () => {
    await expect(deriveKEK('pw', new Uint8Array(15), FAST)).rejects.toMatchObject({
      code: 'INVALID_SALT_LENGTH',
    })
  })

  it('rejects a non-argon2id algorithm (INVALID_KDF_PARAMS)', async () => {
    const bad = { ...FAST, algorithm: 'scrypt' } as unknown as KDFParams
    await expect(deriveKEK('pw', generateSalt(), bad)).rejects.toBeInstanceOf(CryptoError)
  })

  it('rejects an opsLimit below 1 (INVALID_KDF_PARAMS)', async () => {
    await expect(deriveKEK('pw', generateSalt(), { ...FAST, opsLimit: 0 })).rejects.toMatchObject({
      code: 'INVALID_KDF_PARAMS',
    })
  })

  it('rejects a key length below the safe minimum (INVALID_KDF_PARAMS)', async () => {
    await expect(
      deriveKEK('pw', generateSalt(), { ...FAST, keyLengthBytes: 8 }),
    ).rejects.toMatchObject({ code: 'INVALID_KDF_PARAMS' })
  })
})
