import { CryptoError } from './errors'
import { DEFAULT_KDF_PARAMS } from './params'
import { getSodium, initCrypto } from './sodium'
import { assertSaltLength } from './validate'
import type { KDFParams } from '@cairn/shared-types'

/** Smallest derived-key length libsodium's `crypto_pwhash` will accept, in bytes. */
const MIN_KEY_BYTES = 16

function assertKdfParams(params: KDFParams): void {
  if (params.algorithm !== 'argon2id') {
    throw new CryptoError('INVALID_KDF_PARAMS', `unsupported KDF algorithm: ${params.algorithm}`)
  }
  if (!Number.isInteger(params.opsLimit) || params.opsLimit < 1) {
    throw new CryptoError('INVALID_KDF_PARAMS', `opsLimit must be a positive integer`)
  }
  if (!Number.isInteger(params.memLimitBytes) || params.memLimitBytes < 8_192) {
    throw new CryptoError('INVALID_KDF_PARAMS', `memLimitBytes is below the safe minimum`)
  }
  if (!Number.isInteger(params.keyLengthBytes) || params.keyLengthBytes < MIN_KEY_BYTES) {
    throw new CryptoError('INVALID_KDF_PARAMS', `keyLengthBytes must be >= ${MIN_KEY_BYTES}`)
  }
}

/**
 * Derive a key-encryption key (KEK) from a password using Argon2id.
 *
 * The KEK never leaves the device; it is used only to wrap/unwrap the data key
 * (see {@link wrapDataKey}). The same password + salt + params always yields the same
 * KEK, which is how a returning user unlocks their vault. See `docs/security.md` §3.1.
 *
 * @param password The user's password. UTF-8 encoded internally by libsodium.
 * @param salt A 16-byte per-vault salt (from `vault_meta`). Not secret.
 * @param params Argon2id parameters. Defaults to {@link DEFAULT_KDF_PARAMS}
 *   (64 MiB, time cost 3, 32-byte output).
 * @returns The derived KEK (`params.keyLengthBytes` bytes, default 32).
 * @throws CryptoError `INVALID_SALT_LENGTH` if the salt is not 16 bytes;
 *   `INVALID_KDF_PARAMS` if the parameters are malformed.
 */
export async function deriveKEK(
  password: string,
  salt: Uint8Array,
  params: KDFParams = DEFAULT_KDF_PARAMS,
): Promise<Uint8Array> {
  await initCrypto()
  assertSaltLength(salt)
  assertKdfParams(params)
  const s = getSodium()
  return s.crypto_pwhash(
    params.keyLengthBytes,
    password,
    salt,
    params.opsLimit,
    params.memLimitBytes,
    s.crypto_pwhash_ALG_ARGON2ID13,
  )
}
