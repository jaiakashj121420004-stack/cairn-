import { CryptoError } from './errors'
import { KEY_BYTES, NONCE_BYTES, SALT_BYTES } from './params'

/** Throw `INVALID_KEY_LENGTH` unless `key` is exactly {@link KEY_BYTES} bytes. */
export function assertKeyLength(key: Uint8Array): void {
  if (key.length !== KEY_BYTES) {
    throw new CryptoError('INVALID_KEY_LENGTH', `key must be ${KEY_BYTES} bytes, got ${key.length}`)
  }
}

/** Throw `INVALID_NONCE_LENGTH` unless `nonce` is exactly {@link NONCE_BYTES} bytes. */
export function assertNonceLength(nonce: Uint8Array): void {
  if (nonce.length !== NONCE_BYTES) {
    throw new CryptoError(
      'INVALID_NONCE_LENGTH',
      `nonce must be ${NONCE_BYTES} bytes, got ${nonce.length}`,
    )
  }
}

/** Throw `INVALID_SALT_LENGTH` unless `salt` is exactly {@link SALT_BYTES} bytes. */
export function assertSaltLength(salt: Uint8Array): void {
  if (salt.length !== SALT_BYTES) {
    throw new CryptoError(
      'INVALID_SALT_LENGTH',
      `salt must be ${SALT_BYTES} bytes, got ${salt.length}`,
    )
  }
}
