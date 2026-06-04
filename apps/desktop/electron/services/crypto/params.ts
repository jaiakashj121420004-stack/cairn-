import type { KDFParams } from '@cairn/shared-types'

/**
 * Crypto parameter constants. The numeric values here are the *actual* parameters
 * compiled into the app and documented (with rationale) in `docs/security.md` §2–§3.
 * The crypto tests assert these match libsodium's own constants at runtime, so a
 * future libsodium change that altered, say, `MEMLIMIT_INTERACTIVE` would fail CI
 * rather than silently weaken the KDF.
 */

/** Required Argon2id salt length, in bytes (`crypto_pwhash_SALTBYTES`). */
export const SALT_BYTES = 16

/** Data-key / KEK length, in bytes (`crypto_aead_xchacha20poly1305_ietf_KEYBYTES`). */
export const KEY_BYTES = 32

/** AEAD nonce length, in bytes (`crypto_aead_xchacha20poly1305_ietf_NPUBBYTES`). */
export const NONCE_BYTES = 24

/** AEAD authentication tag length, in bytes (`crypto_aead_xchacha20poly1305_ietf_ABYTES`). */
export const TAG_BYTES = 16

/** Argon2id memory cost matching libsodium `crypto_pwhash_MEMLIMIT_INTERACTIVE` (64 MiB). */
export const MEMLIMIT_INTERACTIVE_BYTES = 67_108_864

/** Entropy for a 24-word BIP-39 phrase: 256 bits. */
export const RECOVERY_ENTROPY_BYTES = 32

/** Exact word count of a Cairn recovery phrase. */
export const RECOVERY_PHRASE_WORD_COUNT = 24

/**
 * Default Argon2id parameters for the password → KEK path (interactive: 64 MiB, time
 * cost 3, 256-bit output). See `docs/security.md` §3.1.
 */
export const DEFAULT_KDF_PARAMS: KDFParams = {
  algorithm: 'argon2id',
  opsLimit: 3,
  memLimitBytes: MEMLIMIT_INTERACTIVE_BYTES,
  keyLengthBytes: KEY_BYTES,
}

/**
 * Argon2id parameters for the recovery-phrase → KEK path. Deliberately distinct from
 * {@link DEFAULT_KDF_PARAMS} (time cost 4) so the two derivation paths are
 * domain-separated. See `docs/security.md` §3.2.
 */
export const RECOVERY_KDF_PARAMS: KDFParams = {
  algorithm: 'argon2id',
  opsLimit: 4,
  memLimitBytes: MEMLIMIT_INTERACTIVE_BYTES,
  keyLengthBytes: KEY_BYTES,
}

/**
 * Fixed 16-byte domain-separation salt for the recovery-phrase KDF. Unlike the
 * per-vault password salt, this is a compile-time constant (not a secret): the phrase
 * itself carries 256 bits of entropy, so a per-vault salt would buy nothing and would
 * itself have to be recovered. Bytes are the UTF-8 of the 16-character string
 * `"cairn:recovery:1"`. See `docs/security.md` §3.2.
 */
export const RECOVERY_KDF_SALT: Uint8Array = new TextEncoder().encode('cairn:recovery:1')
