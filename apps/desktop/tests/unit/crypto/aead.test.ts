// @vitest-environment node
import fc from 'fast-check'
import { beforeAll, describe, expect, it } from 'vitest'

import type { EncryptedRecord } from '@cairn/shared-types'
import {
  CryptoError,
  decryptRecord,
  encryptRecord,
  generateDataKey,
  initCrypto,
  unwrapDataKey,
  wrapDataKey,
} from '../../../electron/services/crypto'
import { getSodium } from '../../../electron/services/crypto/sodium'

beforeAll(async () => {
  await initCrypto()
})

/**
 * Known-answer test (KAT) for XChaCha20-Poly1305-IETF from
 * draft-irtf-cfrg-xchacha §A.3.1 — the RFC-track reference vector. This pins our
 * decrypt wrapper (and libsodium underneath it) to the published standard, not just to
 * its own encrypt. The combined output is `ciphertext ‖ 16-byte tag`.
 */
const KAT = {
  keyHex: '808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f',
  nonceHex: '404142434445464748494a4b4c4d4e4f5051525354555657',
  aadHex: '50515253c0c1c2c3c4c5c6c7',
  plaintext:
    "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
  // ciphertext (114 bytes) followed by tag (16 bytes)
  expectedCombinedHex:
    'bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb' +
    '731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b452' +
    '2f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9' +
    '21f9664c97637da9768812f615c68b13b52e' +
    'c0875924c1c7987947deafd8780acf49',
}

describe('XChaCha20-Poly1305 RFC known-answer vector (draft-irtf-cfrg-xchacha A.3.1)', () => {
  it('our encrypt path reproduces the published ciphertext+tag exactly', () => {
    const s = getSodium()
    const combined = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
      s.from_string(KAT.plaintext),
      s.from_hex(KAT.aadHex),
      null,
      s.from_hex(KAT.nonceHex),
      s.from_hex(KAT.keyHex),
    )
    expect(s.to_hex(combined)).toBe(KAT.expectedCombinedHex)
  })

  it('decryptRecord recovers the plaintext from the published vector', () => {
    const s = getSodium()
    const record: EncryptedRecord = {
      algorithm: 'xchacha20poly1305-ietf',
      nonce: s.from_hex(KAT.nonceHex),
      ciphertext: s.from_hex(KAT.expectedCombinedHex),
    }
    const out = decryptRecord(record, s.from_hex(KAT.keyHex), s.from_hex(KAT.aadHex))
    expect(s.to_string(out)).toBe(KAT.plaintext)
  })
})

describe('wrapDataKey / unwrapDataKey', () => {
  it('round-trips a data key under a KEK', () => {
    const dataKey = generateDataKey()
    const kek = generateDataKey()
    const wrapped = wrapDataKey(dataKey, kek)
    expect(wrapped.nonce).toHaveLength(24)
    // Wrapped output is 32-byte key + 16-byte tag.
    expect(wrapped.ciphertext).toHaveLength(48)
    const unwrapped = unwrapDataKey(wrapped, kek)
    expect([...unwrapped]).toEqual([...dataKey])
  })

  it('produces a different nonce (and therefore ciphertext) every call', () => {
    const dataKey = generateDataKey()
    const kek = generateDataKey()
    const a = wrapDataKey(dataKey, kek)
    const b = wrapDataKey(dataKey, kek)
    const s = getSodium()
    expect(s.to_hex(a.nonce)).not.toBe(s.to_hex(b.nonce))
    expect(s.to_hex(a.ciphertext)).not.toBe(s.to_hex(b.ciphertext))
  })

  it('REFUSES to unwrap with the wrong KEK (WRONG_KEY)', () => {
    const dataKey = generateDataKey()
    const wrapped = wrapDataKey(dataKey, generateDataKey())
    try {
      unwrapDataKey(wrapped, generateDataKey())
      expect.unreachable('unwrap should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CryptoError)
      expect((e as CryptoError).code).toBe('WRONG_KEY')
    }
  })

  it('REFUSES a tampered wrapped key (WRONG_KEY)', () => {
    const dataKey = generateDataKey()
    const kek = generateDataKey()
    const wrapped = wrapDataKey(dataKey, kek)
    const tampered = { ...wrapped, ciphertext: Uint8Array.from(wrapped.ciphertext) }
    tampered.ciphertext[0] ^= 0xff
    expect(() => unwrapDataKey(tampered, kek)).toThrowError(CryptoError)
  })

  it('REFUSES a non-32-byte KEK (INVALID_KEY_LENGTH)', () => {
    const dataKey = generateDataKey()
    expect(() => wrapDataKey(dataKey, new Uint8Array(31))).toThrowError(/INVALID_KEY_LENGTH|31/)
  })
})

describe('encryptRecord / decryptRecord round-trip', () => {
  it('decrypt(encrypt(x)) === x for arbitrary plaintext and key (no AD)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 2048 }), (plaintext) => {
        const key = generateDataKey()
        const out = decryptRecord(encryptRecord(plaintext, key), key)
        expect([...out]).toEqual([...plaintext])
      }),
    )
  })

  it('decrypt(encrypt(x, ad), ad) === x for arbitrary plaintext and AD', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 1024 }),
        fc.uint8Array({ minLength: 1, maxLength: 64 }),
        (plaintext, ad) => {
          const key = generateDataKey()
          const out = decryptRecord(encryptRecord(plaintext, key, ad), key, ad)
          expect([...out]).toEqual([...plaintext])
        },
      ),
    )
  })
})

describe('encryptRecord / decryptRecord negative cases (must REFUSE, not return garbage)', () => {
  const sampleAd = new TextEncoder().encode('trade:0192f000')

  it('wrong key fails to decrypt (DECRYPT_FAILED)', () => {
    const rec = encryptRecord(new TextEncoder().encode('secret'), generateDataKey())
    try {
      decryptRecord(rec, generateDataKey())
      expect.unreachable('decrypt should have thrown')
    } catch (e) {
      expect((e as CryptoError).code).toBe('DECRYPT_FAILED')
    }
  })

  it('tampered ciphertext fails to decrypt', () => {
    const key = generateDataKey()
    const rec = encryptRecord(new TextEncoder().encode('secret'), key)
    const tampered: EncryptedRecord = { ...rec, ciphertext: Uint8Array.from(rec.ciphertext) }
    tampered.ciphertext[0] ^= 0x01
    expect(() => decryptRecord(tampered, key)).toThrowError(CryptoError)
  })

  it('tampered nonce fails to decrypt', () => {
    const key = generateDataKey()
    const rec = encryptRecord(new TextEncoder().encode('secret'), key)
    const tampered: EncryptedRecord = { ...rec, nonce: Uint8Array.from(rec.nonce) }
    tampered.nonce[0] ^= 0x01
    expect(() => decryptRecord(tampered, key)).toThrowError(CryptoError)
  })

  it('wrong associated data fails to decrypt (AD binds ciphertext to its row)', () => {
    const key = generateDataKey()
    const rec = encryptRecord(new TextEncoder().encode('secret'), key, sampleAd)
    const otherAd = new TextEncoder().encode('trade:0192f999')
    expect(() => decryptRecord(rec, key, otherAd)).toThrowError(CryptoError)
  })

  it('missing associated data fails to decrypt when AD was used at encrypt time', () => {
    const key = generateDataKey()
    const rec = encryptRecord(new TextEncoder().encode('secret'), key, sampleAd)
    expect(() => decryptRecord(rec, key)).toThrowError(CryptoError)
  })

  it('property: any single-byte ciphertext flip is always rejected', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 256 }),
        fc.nat(),
        (plaintext, idxSeed) => {
          const key = generateDataKey()
          const rec = encryptRecord(plaintext, key)
          const idx = idxSeed % rec.ciphertext.length
          const tampered: EncryptedRecord = { ...rec, ciphertext: Uint8Array.from(rec.ciphertext) }
          tampered.ciphertext[idx] ^= 0xff
          expect(() => decryptRecord(tampered, key)).toThrow()
        },
      ),
    )
  })
})
