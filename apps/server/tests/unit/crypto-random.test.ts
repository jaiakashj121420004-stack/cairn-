import { describe, expect, it } from 'vitest'
import {
  generateOpaqueToken,
  sha256Hex,
  timingSafeEqualHex,
  timingSafeEqualUtf8,
} from '../../src/lib/crypto-random'

/**
 * Unit tests for the auth crypto helpers (no DB). `timingSafeEqualUtf8` guards the admin
 * bearer-token compare (threat-model §6 M20) — it must match on equal content and reject
 * on any difference, including length, without throwing.
 */

describe('generateOpaqueToken', () => {
  it('returns hex of the requested byte length and is unique per call', () => {
    expect(generateOpaqueToken(32)).toMatch(/^[0-9a-f]{64}$/)
    expect(generateOpaqueToken(16)).toMatch(/^[0-9a-f]{32}$/)
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken())
  })
})

describe('sha256Hex', () => {
  it('is a stable 64-char hex digest', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('timingSafeEqualUtf8', () => {
  it('returns true for identical strings', () => {
    const secret = 'a'.repeat(40)
    expect(timingSafeEqualUtf8(secret, secret)).toBe(true)
    expect(timingSafeEqualUtf8('hunter2-with-unicode-ünïçødé', 'hunter2-with-unicode-ünïçødé')).toBe(
      true,
    )
  })

  it('returns false for different same-length strings', () => {
    expect(timingSafeEqualUtf8('a'.repeat(40), `${'a'.repeat(39)}b`)).toBe(false)
  })

  it('returns false (never throws) on length mismatch', () => {
    expect(timingSafeEqualUtf8('short', 'a-much-longer-token-value')).toBe(false)
    expect(timingSafeEqualUtf8('', 'x')).toBe(false)
  })
})

describe('timingSafeEqualHex', () => {
  it('matches equal hex and rejects unequal / mismatched-length', () => {
    expect(timingSafeEqualHex('deadbeef', 'deadbeef')).toBe(true)
    expect(timingSafeEqualHex('deadbeef', 'deadbeff')).toBe(false)
    expect(timingSafeEqualHex('dead', 'deadbeef')).toBe(false)
  })
})
