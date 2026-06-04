import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Small wrappers over Node crypto used across auth (CLAUDE.md §2.13).
 *
 * Opaque tokens (refresh, verify, magic) are CSPRNG bytes rendered as lowercase hex.
 * Only their SHA-256 is stored, so a database leak does not expose usable tokens.
 */

/** Generate `bytes` of CSPRNG randomness as a lowercase hex string (default 32 B → 64 chars). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}

/** SHA-256 of a token, lowercase hex. Used for storage and lookup. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * Constant-time comparison of two hex digests of equal length. Avoids leaking
 * match position via early-exit timing. Returns false on length mismatch.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
