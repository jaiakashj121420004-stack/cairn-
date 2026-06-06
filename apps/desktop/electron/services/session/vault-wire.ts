/**
 * Wire-format converters for vault key material (CLAUDE.md §18.4/§18.5; docs/security.md).
 *
 * The crypto layer (`@cairn/shared-types`) speaks binary: {@link WrappedKey} carries raw
 * `Uint8Array` fields and {@link KDFParams} is camelCase. The transport layer
 * (`@cairn/shared-zod`) speaks JSON: `WrappedKeyWire`/`KdfParamsWire` are base64 +
 * snake_case. These pure converters bridge the two at the enrollment/unlock boundary, so
 * the HTTP client and the crypto code each stay in their own vocabulary.
 *
 * The base64 idiom matches `../sync/serialize.ts` (Node `Buffer`), the only base64 codec
 * used in the main process. Converters assume their input has already been Zod-validated
 * (the vault client validates every descriptor on read-back, §19.2) — they do not
 * re-validate shape.
 */
import type { KDFParams, WrappedKey } from '@cairn/shared-types'
import type { KdfParamsWire, WrappedKeyWire } from '@cairn/shared-zod'

/** Encode raw bytes to standard (padded) base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/** Decode standard base64 back to raw bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

/** Binary {@link WrappedKey} → base64 wire form. */
export function wrappedKeyToWire(key: WrappedKey): WrappedKeyWire {
  return {
    algorithm: key.algorithm,
    nonce: bytesToBase64(key.nonce),
    ciphertext: bytesToBase64(key.ciphertext),
  }
}

/** Base64 wire form → binary {@link WrappedKey}. */
export function wireToWrappedKey(wire: WrappedKeyWire): WrappedKey {
  return {
    algorithm: wire.algorithm,
    nonce: base64ToBytes(wire.nonce),
    ciphertext: base64ToBytes(wire.ciphertext),
  }
}

/** camelCase {@link KDFParams} → snake_case wire form. */
export function kdfParamsToWire(params: KDFParams): KdfParamsWire {
  return {
    algorithm: params.algorithm,
    ops_limit: params.opsLimit,
    mem_limit_bytes: params.memLimitBytes,
    key_length_bytes: params.keyLengthBytes,
  }
}

/** snake_case wire form → camelCase {@link KDFParams}. */
export function wireToKdfParams(wire: KdfParamsWire): KDFParams {
  return {
    algorithm: wire.algorithm,
    opsLimit: wire.ops_limit,
    memLimitBytes: wire.mem_limit_bytes,
    keyLengthBytes: wire.key_length_bytes,
  }
}
