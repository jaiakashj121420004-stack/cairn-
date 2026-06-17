// libsodium-wrappers-sumo attaches its real API to the DEFAULT export, which is only
// populated after `ready` resolves. The named/namespace exports are eval-time stubs
// and must NOT be used (their functions are undefined). We need the *sumo* build
// because the standard build omits `crypto_pwhash` (Argon2id).
import sodium from 'libsodium-wrappers-sumo'

import { CryptoError } from './errors'

/**
 * The exact slice of the libsodium surface this app uses. We deliberately wrap the
 * library in a narrow interface (CLAUDE.md §19.1) rather than exposing its full
 * generated type: the sumo type declaration enumerates ~1000 symbols, and propagating
 * that giant type to every call site exhausts the TypeScript type-checker's allocator.
 * Narrowing it here keeps both `tsc` and type-aware ESLint fast and bounded.
 */
export interface SodiumApi {
  readonly crypto_pwhash_ALG_ARGON2ID13: number
  readonly crypto_pwhash_MEMLIMIT_INTERACTIVE: number
  readonly crypto_pwhash_SALTBYTES: number
  readonly crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number
  randombytes_buf(length: number): Uint8Array
  crypto_pwhash(
    keyLength: number,
    password: Uint8Array | string,
    salt: Uint8Array,
    opsLimit: number,
    memLimit: number,
    algorithm: number,
  ): Uint8Array
  crypto_aead_xchacha20poly1305_ietf_encrypt(
    message: Uint8Array | string,
    additionalData: Uint8Array | string | null,
    secretNonce: Uint8Array | string | null,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array
  crypto_aead_xchacha20poly1305_ietf_decrypt(
    secretNonce: Uint8Array | string | null,
    ciphertext: Uint8Array,
    additionalData: Uint8Array | string | null,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array
  from_hex(input: string): Uint8Array
  to_hex(input: Uint8Array | string): string
  from_string(input: string): Uint8Array
  to_string(input: Uint8Array): string
  /** Overwrite `bytes` with zeros in place (constant-time wipe of key material). */
  memzero(bytes: Uint8Array): void
}

/**
 * libsodium initialises its WASM module asynchronously. Until `sodium.ready`
 * resolves, the function bindings are not callable. We gate every synchronous crypto
 * call behind this flag so a premature call fails loudly with a typed
 * `SODIUM_NOT_READY` error instead of a raw `TypeError`.
 */
let initialized = false

/**
 * Initialise libsodium. Idempotent and safe to await concurrently. The Electron main
 * process must call this once at startup before any synchronous crypto function
 * (`wrapDataKey`, `encryptRecord`, …) is used. The async functions (`deriveKEK`,
 * `keyFromRecoveryPhrase`) await it internally.
 */
export async function initCrypto(): Promise<void> {
  if (initialized) return
  await (sodium as { ready: Promise<void> }).ready
  initialized = true
}

/** Whether {@link initCrypto} has completed. */
export function isCryptoReady(): boolean {
  return initialized
}

/**
 * Return the ready libsodium API (narrowed to {@link SodiumApi}), or throw
 * `SODIUM_NOT_READY` if {@link initCrypto} has not completed. Internal use only.
 */
export function getSodium(): SodiumApi {
  if (!initialized) {
    throw new CryptoError(
      'SODIUM_NOT_READY',
      'crypto used before initCrypto() resolved; call initCrypto() at startup',
    )
  }
  return sodium as unknown as SodiumApi
}
