/**
 * Wire (de)serialization for vault ops (docs/sync-protocol.md §2.1, §6.1).
 *
 * `payload_ciphertext` on the wire is base64 of `nonce(24) ‖ ciphertext‖tag`. The AEAD
 * algorithm is fixed (XChaCha20-Poly1305-IETF), so it is implicit and not transmitted.
 * The associated data binding a ciphertext to its row is `"<table>:<record_id>"`
 * (UTF-8) — identical at encrypt and decrypt, never stored in the blob.
 */
import { NONCE_BYTES, TAG_BYTES } from '../crypto'
import type { EncryptedRecord } from '@cairn/shared-types'

/** Build the AEAD associated data that binds a ciphertext to its row. */
export function adFor(tableName: string, recordId: string): Uint8Array {
  return new TextEncoder().encode(`${tableName}:${recordId}`)
}

/** Encode an {@link EncryptedRecord} to the wire form: base64(nonce ‖ ciphertext). */
export function encodeCiphertext(record: EncryptedRecord): string {
  const combined = new Uint8Array(record.nonce.length + record.ciphertext.length)
  combined.set(record.nonce, 0)
  combined.set(record.ciphertext, record.nonce.length)
  return Buffer.from(combined).toString('base64')
}

/**
 * Decode the wire form back to an {@link EncryptedRecord}. The reverse of
 * {@link encodeCiphertext}; used by the pull path (later stage).
 *
 * @throws RangeError if the blob is shorter than a nonce + the 16-byte tag — a
 *   truncated/corrupt payload, surfaced loudly rather than silently producing garbage
 *   (docs/sync-protocol.md §8).
 */
export function decodeCiphertext(base64: string): EncryptedRecord {
  const combined = new Uint8Array(Buffer.from(base64, 'base64'))
  if (combined.length < NONCE_BYTES + TAG_BYTES) {
    throw new RangeError(
      `vault ciphertext too short: ${combined.length} bytes (need ≥ ${NONCE_BYTES + TAG_BYTES})`,
    )
  }
  return {
    algorithm: 'xchacha20poly1305-ietf',
    nonce: combined.slice(0, NONCE_BYTES),
    ciphertext: combined.slice(NONCE_BYTES),
  }
}
