/**
 * Cryptographic types shared across desktop, web, and server (CLAUDE.md §2.4, §2.13,
 * §18.4). These are *types only* — the implementation lives in
 * `apps/desktop/electron/services/crypto/` and is documented in `docs/security.md`.
 *
 * The privacy contract: user content is encrypted on the client under a random data
 * key (DK); the DK is wrapped by a key-encryption key (KEK) derived from the user's
 * password (or recovery phrase) via Argon2id. The server only ever sees the wrapped
 * key and ciphertext blobs — never the KEK, the DK, or plaintext.
 */

/** The only key-derivation function Cairn uses. */
export type KdfAlgorithm = 'argon2id'

/** The only AEAD construction Cairn uses (24-byte nonce, 16-byte Poly1305 tag). */
export type AeadAlgorithm = 'xchacha20poly1305-ietf'

/**
 * Argon2id parameters for deriving a KEK from a password or recovery phrase.
 *
 * Stored per vault in `vault_meta` (alongside the 16-byte salt, which is kept
 * separately because a salt is not secret but is per-vault). See `docs/security.md` §3
 * for the rationale behind the default values.
 */
export interface KDFParams {
  readonly algorithm: KdfAlgorithm
  /** Argon2id time cost (libsodium `opslimit`). Default 3 for the password path. */
  readonly opsLimit: number
  /** Argon2id memory cost in bytes (libsodium `memlimit`). Default 67_108_864 (64 MiB). */
  readonly memLimitBytes: number
  /** Derived key length in bytes. Default 32 (a 256-bit KEK). */
  readonly keyLengthBytes: number
}

/**
 * A data key encrypted under a KEK. `ciphertext` is XChaCha20-Poly1305 combined-mode
 * output (wrapped-key bytes followed by the 16-byte tag). Safe to store on the server.
 */
export interface WrappedKey {
  readonly algorithm: AeadAlgorithm
  /** Fresh 24-byte nonce used for this wrap. Not secret. */
  readonly nonce: Uint8Array
  /** Wrapped data-key bytes ‖ 16-byte authentication tag. */
  readonly ciphertext: Uint8Array
}

/**
 * A single encrypted record. `ciphertext` is XChaCha20-Poly1305 combined-mode output.
 * The associated data (e.g. `table:id`) used at encrypt time is authenticated but not
 * stored here — it must be supplied identically at decrypt time.
 */
export interface EncryptedRecord {
  readonly algorithm: AeadAlgorithm
  /** Fresh 24-byte nonce used for this record. Not secret. */
  readonly nonce: Uint8Array
  /** Plaintext ciphertext ‖ 16-byte authentication tag. */
  readonly ciphertext: Uint8Array
}

/**
 * A BIP-39 recovery phrase and the entropy it encodes.
 *
 * `phrase` always has exactly 24 words (256 bits of entropy + 8-bit checksum). The
 * length invariant is enforced at runtime by the generator and validated on input.
 */
export interface RecoveryPhrase {
  /** Exactly 24 BIP-39 English words. */
  readonly phrase: readonly string[]
  /** The 32 bytes of CSPRNG entropy the phrase encodes. */
  readonly entropy: Uint8Array
}

/** Typed error codes raised by the crypto and keychain layers. */
export type CryptoErrorCode =
  /** A synchronous crypto call ran before `initCrypto()` resolved libsodium. */
  | 'SODIUM_NOT_READY'
  /** Salt was not the required 16 bytes. */
  | 'INVALID_SALT_LENGTH'
  /** Key was not the required 32 bytes. */
  | 'INVALID_KEY_LENGTH'
  /** Nonce was not the required 24 bytes. */
  | 'INVALID_NONCE_LENGTH'
  /** KDF parameters were missing, malformed, or below the safe minimum. */
  | 'INVALID_KDF_PARAMS'
  /** Unwrapping the data key failed its tag check — wrong password/KEK. */
  | 'WRONG_KEY'
  /** Decrypting a record failed — wrong key, wrong associated data, or tampering. */
  | 'DECRYPT_FAILED'
  /** Recovery phrase was the wrong length or failed its BIP-39 checksum. */
  | 'INVALID_RECOVERY_PHRASE'
  /** The OS keychain backend (keytar) could not be loaded on this platform. */
  | 'KEYCHAIN_UNAVAILABLE'
  /** The OS keychain backend was reachable but the operation failed. */
  | 'KEYCHAIN_ERROR'
