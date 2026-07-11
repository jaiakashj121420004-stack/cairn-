// @vitest-environment node
//
// P1 security — the safeStorage secret envelope used to encrypt at-rest secrets
// (MT5 pairing token now; keytar migration later). safeStorage is faked so the
// seal/open roundtrip and the plaintext fallback are exercised deterministically.

import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ available: true }))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: (): boolean => h.available,
    encryptString: (s: string): Buffer => Buffer.from(`ENC:${s}`, 'utf8'),
    decryptString: (b: Buffer): string => {
      const s = b.toString('utf8')
      if (!s.startsWith('ENC:')) throw new Error('bad ciphertext')
      return s.slice(4)
    },
  },
}))

import { isSecretEnvelope, openSecret, sealSecret } from '../../../electron/services/secret-box'

describe('secret-box (safeStorage envelope)', () => {
  afterEach(() => {
    h.available = true
  })

  it('seals then opens a secret when encryption is available', () => {
    const env = sealSecret('tok123')
    expect(env.enc).toBeDefined()
    expect(env.plain).toBeUndefined()
    expect(openSecret(env)).toBe('tok123')
  })

  it('falls back to plaintext when encryption is unavailable', () => {
    h.available = false
    const env = sealSecret('tok123')
    expect(env.plain).toBe('tok123')
    expect(env.enc).toBeUndefined()
    expect(openSecret(env)).toBe('tok123')
  })

  it('returns null when an encrypted envelope cannot be decrypted', () => {
    const bad = Buffer.from('garbage', 'utf8').toString('base64')
    expect(openSecret({ v: 1, enc: bad })).toBeNull()
  })

  it('distinguishes a versioned envelope from a legacy raw value', () => {
    expect(isSecretEnvelope({ v: 1, enc: 'x' })).toBe(true)
    expect(isSecretEnvelope('legacy-plaintext-token')).toBe(false)
    expect(isSecretEnvelope(null)).toBe(false)
    expect(isSecretEnvelope({ v: 2 })).toBe(false)
  })
})
