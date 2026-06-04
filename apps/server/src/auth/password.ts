import { createHmac } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import type { Algorithm } from '@node-rs/argon2'

/**
 * Password hashing (CLAUDE.md §2.13, locked decision #25).
 *
 * Argon2id ONLY — bcrypt and SHA variants are banned. Before hashing, the password
 * is HMAC-SHA256-ed with a server-side pepper held in env: a stolen database is
 * useless without the pepper. We use HMAC-then-Argon2id (rather than Argon2's keyed
 * `secret`) per the stage spec, and because it caps Argon2's input to 64 hex chars
 * regardless of password length.
 *
 * Parameters (locked): memory 64 MiB, time cost 3, parallelism 1, output 32 bytes.
 */
/**
 * Argon2id, identified by its stable encoding `2`. `@node-rs/argon2` ships
 * `Algorithm`/`Version` as ambient const enums, which cannot be referenced as values
 * under `isolatedModules`; we use the numeric encoding with a typed cast instead, and
 * leave `version` at the library default (0x13, the modern Argon2 version).
 */
const ALGORITHM_ARGON2ID = 2 as Algorithm

const ARGON2_OPTIONS = {
  algorithm: ALGORITHM_ARGON2ID,
  /** argon2 memoryCost is in KiB. 64 MiB = 65536 KiB. */
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const

/** HMAC-SHA256 the password with the pepper, returning lowercase hex. */
function pepper(password: string, serverPepper: string): string {
  return createHmac('sha256', serverPepper).update(password, 'utf8').digest('hex')
}

/** Hash a password for storage. Returns the full Argon2id PHC string. */
export function hashPassword(password: string, serverPepper: string): Promise<string> {
  return hash(pepper(password, serverPepper), ARGON2_OPTIONS)
}

/**
 * Verify a password against a stored Argon2id PHC hash. The comparison is
 * constant-time inside the Argon2 verifier. Any malformed-hash error is treated as
 * a non-match (returns false) rather than throwing across the boundary.
 */
export async function verifyPassword(
  storedHash: string,
  password: string,
  serverPepper: string,
): Promise<boolean> {
  try {
    // No options: Argon2 parameters are encoded in the stored PHC hash string.
    return await verify(storedHash, pepper(password, serverPepper))
  } catch {
    return false
  }
}

/**
 * A precomputed hash of a random secret, used to equalize timing on the
 * unknown-account login path so an attacker cannot distinguish "no such user" from
 * "wrong password" by response time. Computed once, lazily.
 */
let dummyHashPromise: Promise<string> | null = null
function getDummyHash(serverPepper: string): Promise<string> {
  dummyHashPromise ??= hash(
    pepper('cairn-timing-equalizer-not-a-real-password', serverPepper),
    ARGON2_OPTIONS,
  )
  return dummyHashPromise
}

/**
 * Perform a throwaway verification to spend the same time as a real one when the
 * account does not exist. Always returns false. Call this instead of skipping the
 * Argon2id work entirely.
 */
export async function dummyVerify(password: string, serverPepper: string): Promise<false> {
  const dummy = await getDummyHash(serverPepper)
  await verifyPassword(dummy, password, serverPepper)
  return false
}
