/**
 * @cairn/shared-crypto — Cairn client-side cryptography (CLAUDE.md §2.4, §2.13, §18.4).
 *
 * Extracted from `apps/desktop/electron/services/crypto/` so the *same* implementation
 * runs in the Electron main process (desktop) and in-browser (web). Envelope
 * encryption with libsodium: a random 32-byte data key encrypts vault records
 * (XChaCha20-Poly1305); the data key is wrapped by a KEK derived from the user's
 * password or recovery phrase (Argon2id). The server never sees the KEK, the data key,
 * or plaintext. Full design and rationale: `docs/security.md`.
 *
 * Pure and platform-agnostic: the only runtime dependencies are
 * `libsodium-wrappers-sumo` (WASM, browser + node) and `@scure/bip39`. No Electron, no
 * Node built-ins, no DOM — so the web bundle imports it unchanged.
 */
export { CryptoError } from './errors'
export { initCrypto, isCryptoReady, getSodium } from './sodium'
export type { SodiumApi } from './sodium'
export {
  DEFAULT_KDF_PARAMS,
  RECOVERY_KDF_PARAMS,
  RECOVERY_KDF_SALT,
  RECOVERY_PHRASE_WORD_COUNT,
  RECOVERY_ENTROPY_BYTES,
  SALT_BYTES,
  KEY_BYTES,
  NONCE_BYTES,
  TAG_BYTES,
  MEMLIMIT_INTERACTIVE_BYTES,
} from './params'
export { generateSalt, generateDataKey } from './random'
export { deriveKEK } from './kdf'
export { wrapDataKey, unwrapDataKey, encryptRecord, decryptRecord } from './aead'
export { generateRecoveryPhrase, keyFromRecoveryPhrase } from './recovery'
export { memzero } from './wipe'
