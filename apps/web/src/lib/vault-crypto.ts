import {
  decryptRecord,
  deriveKEK,
  keyFromRecoveryPhrase,
  memzero,
  unwrapDataKey,
} from '@cairn/shared-crypto'
import {
  type KdfParamsWire,
  type VaultKeyOutput,
  type WrappedKeyWire,
} from '@cairn/shared-zod'
import { adFor, base64ToBytes, decodeCiphertext } from './vault-codec'
import type { KDFParams, WrappedKey } from '@cairn/shared-types'

/**
 * Client-side key derivation and record decryption (CLAUDE.md §2.4, §18.4; task §4).
 *
 * Everything here runs in-browser. The server hands over only the *wrapped* data key,
 * the KDF salt, and Argon2id params (`GET /vault/key`); this module derives the KEK
 * from the user's password (or recovery phrase), unwraps the data key, and decrypts the
 * pulled ciphertext. The KEK is zeroed immediately after use; the data key is held by
 * `WebVault` for the unlocked session and zeroed on lock/logout.
 */

function toWrappedKey(w: WrappedKeyWire): WrappedKey {
  return {
    algorithm: w.algorithm,
    nonce: base64ToBytes(w.nonce),
    ciphertext: base64ToBytes(w.ciphertext),
  }
}

function toKdfParams(k: KdfParamsWire): KDFParams {
  return {
    algorithm: k.algorithm,
    opsLimit: k.ops_limit,
    memLimitBytes: k.mem_limit_bytes,
    keyLengthBytes: k.key_length_bytes,
  }
}

/**
 * Derive the KEK from `password` + the vault's KDF descriptor and unwrap the data key.
 * Throws `CryptoError('WRONG_KEY')` if the password is wrong (the Poly1305 tag fails).
 * The KEK is wiped before returning regardless of outcome.
 */
export async function unlockWithPassword(
  password: string,
  key: VaultKeyOutput,
): Promise<Uint8Array> {
  const kek = await deriveKEK(password, base64ToBytes(key.kdf_salt), toKdfParams(key.kdf))
  try {
    return unwrapDataKey(toWrappedKey(key.wrapped_data_key), kek)
  } finally {
    memzero(kek)
  }
}

/**
 * Re-derive the recovery KEK from a 24-word phrase and unwrap the data key from the
 * recovery-wrapped copy. Used on a new device or after a password reset (the password
 * KEK is gone, but the phrase-derived KEK still unwraps the same data key).
 */
export async function unlockWithRecoveryPhrase(
  phrase: readonly string[],
  key: VaultKeyOutput,
): Promise<Uint8Array> {
  const kek = await keyFromRecoveryPhrase(phrase)
  try {
    return unwrapDataKey(toWrappedKey(key.recovery_wrapped_data_key), kek)
  } finally {
    memzero(kek)
  }
}

/**
 * Decrypt one pulled op's payload into a plain record object. The associated data binds
 * the ciphertext to its `table:record_id`, so a relocated or substituted blob fails the
 * tag check and throws `CryptoError('DECRYPT_FAILED')` rather than returning garbage.
 */
export function decryptOpPayload(
  op: { table_name: string; record_id: string; payload_ciphertext: string },
  dataKey: Uint8Array,
): Record<string, unknown> {
  const record = decodeCiphertext(op.payload_ciphertext)
  const plaintext = decryptRecord(record, dataKey, adFor(op.table_name, op.record_id))
  const json = new TextDecoder().decode(plaintext)
  return JSON.parse(json) as Record<string, unknown>
}
