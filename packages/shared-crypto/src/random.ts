import { KEY_BYTES, SALT_BYTES } from './params'
import { getSodium } from './sodium'

/**
 * Generate a fresh 16-byte Argon2id salt from libsodium's CSPRNG. Stored per vault in
 * `vault_meta`. Requires {@link initCrypto} to have completed.
 */
export function generateSalt(): Uint8Array {
  return getSodium().randombytes_buf(SALT_BYTES)
}

/**
 * Generate a fresh 32-byte data key from libsodium's CSPRNG. This is the key the vault
 * is encrypted under; it is then wrapped by the KEK and never stored unwrapped except
 * transiently in the OS keychain. Requires {@link initCrypto} to have completed.
 */
export function generateDataKey(): Uint8Array {
  return getSodium().randombytes_buf(KEY_BYTES)
}
