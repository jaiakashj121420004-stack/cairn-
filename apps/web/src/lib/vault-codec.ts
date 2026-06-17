import { NONCE_BYTES, TAG_BYTES } from '@cairn/shared-crypto'
import type { EncryptedRecord } from '@cairn/shared-types'

/**
 * Browser-safe wire (de)serialization for vault ops — the byte-for-byte mirror of the
 * desktop's `electron/services/sync/serialize.ts`, which uses Node `Buffer` and so
 * cannot run in the browser (docs/sync-protocol.md §2.1, §6.1).
 *
 * `payload_ciphertext` on the wire is base64 of `nonce(24) ‖ ciphertext‖tag`. The AEAD
 * algorithm is fixed (XChaCha20-Poly1305-IETF) and implicit. The associated data
 * binding a ciphertext to its row is `"<table>:<record_id>"` (UTF-8), identical at
 * encrypt and decrypt and never stored in the blob — so a ciphertext moved to a
 * different row fails its tag check.
 */

/** Build the AEAD associated data that binds a ciphertext to its row. */
export function adFor(tableName: string, recordId: string): Uint8Array {
  return new TextEncoder().encode(`${tableName}:${recordId}`)
}

/** Standard base64 of arbitrary bytes (browser `btoa` is latin1-only, so chunk it). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Decode standard base64 to bytes. Throws on malformed input (via `atob`). */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

/** Encode an {@link EncryptedRecord} to the wire form: base64(nonce ‖ ciphertext). */
export function encodeCiphertext(record: EncryptedRecord): string {
  const combined = new Uint8Array(record.nonce.length + record.ciphertext.length)
  combined.set(record.nonce, 0)
  combined.set(record.ciphertext, record.nonce.length)
  return bytesToBase64(combined)
}

/**
 * Decode the wire form back to an {@link EncryptedRecord}.
 *
 * @throws RangeError if the blob is shorter than a nonce + the 16-byte tag — a
 *   truncated/corrupt payload, surfaced loudly rather than silently producing garbage.
 */
export function decodeCiphertext(base64: string): EncryptedRecord {
  const combined = base64ToBytes(base64)
  if (combined.length < NONCE_BYTES + TAG_BYTES) {
    throw new RangeError(
      `vault ciphertext too short: ${combined.length} bytes (need >= ${NONCE_BYTES + TAG_BYTES})`,
    )
  }
  return {
    algorithm: 'xchacha20poly1305-ietf',
    nonce: combined.slice(0, NONCE_BYTES),
    ciphertext: combined.slice(NONCE_BYTES),
  }
}
