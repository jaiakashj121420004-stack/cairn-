import { CryptoError } from './errors'
import { getSodium } from './sodium'
import { assertKeyLength, assertNonceLength } from './validate'
import type { EncryptedRecord, WrappedKey } from '@cairn/shared-types'

const ALGORITHM = 'xchacha20poly1305-ietf' as const

/**
 * Wrap (encrypt) a data key under a KEK using XChaCha20-Poly1305 with a fresh random
 * 24-byte nonce. The result is safe to store on the server — it reveals nothing
 * without the KEK. See `docs/security.md` §4.2.
 *
 * @param dataKey The 32-byte data key to protect.
 * @param kek The 32-byte key-encryption key (from {@link deriveKEK}).
 * @throws CryptoError `INVALID_KEY_LENGTH` if either key is not 32 bytes;
 *   `SODIUM_NOT_READY` if {@link initCrypto} has not completed.
 */
export function wrapDataKey(dataKey: Uint8Array, kek: Uint8Array): WrappedKey {
  const s = getSodium()
  assertKeyLength(dataKey)
  assertKeyLength(kek)
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(dataKey, null, null, nonce, kek)
  return { algorithm: ALGORITHM, nonce, ciphertext }
}

/**
 * Unwrap (decrypt) a data key with a KEK. A Poly1305 tag mismatch — the case when the
 * password (and therefore the KEK) is wrong — throws `WRONG_KEY`. There is no
 * "maybe": either the tag verifies and the exact data key is returned, or it refuses.
 * See `docs/security.md` §4.3.
 *
 * @throws CryptoError `WRONG_KEY` on tag mismatch (wrong KEK or corrupted wrapped key);
 *   `INVALID_KEY_LENGTH` / `INVALID_NONCE_LENGTH` on malformed inputs.
 */
export function unwrapDataKey(wrapped: WrappedKey, kek: Uint8Array): Uint8Array {
  const s = getSodium()
  assertKeyLength(kek)
  assertNonceLength(wrapped.nonce)
  try {
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      wrapped.ciphertext,
      null,
      wrapped.nonce,
      kek,
    )
  } catch {
    throw new CryptoError(
      'WRONG_KEY',
      'failed to unwrap data key: wrong key or corrupted wrapped key',
    )
  }
}

/**
 * Encrypt a record under the data key using XChaCha20-Poly1305 with a fresh random
 * 24-byte nonce.
 *
 * Pass `ad` (associated data) — e.g. the UTF-8 bytes of `"trade:<id>"` — to bind the
 * ciphertext to its row: a ciphertext decrypted against a different row's `ad` fails
 * the tag check (see {@link decryptRecord}). `ad` is authenticated but not encrypted,
 * is not stored in the result, and must be supplied identically at decrypt time.
 * See `docs/security.md` §4.4.
 *
 * @throws CryptoError `INVALID_KEY_LENGTH` if `dataKey` is not 32 bytes;
 *   `SODIUM_NOT_READY` if {@link initCrypto} has not completed.
 */
export function encryptRecord(
  plaintext: Uint8Array,
  dataKey: Uint8Array,
  ad?: Uint8Array,
): EncryptedRecord {
  const s = getSodium()
  assertKeyLength(dataKey)
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    ad ?? null,
    null,
    nonce,
    dataKey,
  )
  return { algorithm: ALGORITHM, nonce, ciphertext }
}

/**
 * Decrypt a record with the data key. Fails closed: a wrong key, wrong/missing
 * associated data, or any tampering of the ciphertext or nonce produces a tag
 * mismatch and throws `DECRYPT_FAILED` — it never returns partial or garbage
 * plaintext. See `docs/security.md` §4.4.
 *
 * @param ad The exact associated data used at encrypt time, or omit if none was used.
 * @throws CryptoError `DECRYPT_FAILED` on any verification failure;
 *   `INVALID_KEY_LENGTH` / `INVALID_NONCE_LENGTH` on malformed inputs.
 */
export function decryptRecord(
  record: EncryptedRecord,
  dataKey: Uint8Array,
  ad?: Uint8Array,
): Uint8Array {
  const s = getSodium()
  assertKeyLength(dataKey)
  assertNonceLength(record.nonce)
  try {
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      record.ciphertext,
      ad ?? null,
      record.nonce,
      dataKey,
    )
  } catch {
    throw new CryptoError(
      'DECRYPT_FAILED',
      'failed to decrypt record: wrong key, wrong associated data, or tampered ciphertext',
    )
  }
}
