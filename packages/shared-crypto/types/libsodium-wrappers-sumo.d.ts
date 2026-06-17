// Type-only shim for libsodium-wrappers-sumo.
//
// The package ships a ~120 KB generated declaration whose default export enumerates
// ~1000 symbols as a single object-type literal. Materialising that type exhausts the
// TypeScript checker's zone allocator during type-aware ESLint (it OOMs). This file is
// pointed at by a `paths` entry in tsconfig.json so the checker uses this narrow
// surface instead. It does NOT affect runtime/bundler resolution (Vite and vitest load
// the real package from node_modules).
//
// Keep this in sync with `SodiumApi` in src/sodium.ts — both describe the exact slice
// of libsodium the app uses. Mirrors apps/desktop/types/libsodium-wrappers-sumo.d.ts.

declare const sodium: {
  ready: Promise<void>
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
  memzero(bytes: Uint8Array): void
}

export default sodium
