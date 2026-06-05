import { z } from 'zod'

/**
 * Vault sync schemas (CLAUDE.md §18.5, §18.6). The server never inspects
 * `payload_ciphertext` — it stores and forwards opaque AEAD blobs.
 * Zod validates the envelope shape only; the contents stay encrypted.
 */

/** One encrypted vault operation: an upsert or delete for a single record. */
export const encryptedOpSchema = z.object({
  /** Logical table name the op targets (e.g. "trade", "account"). */
  table_name: z.string().trim().min(1).max(64),
  /** Stable record identifier (UUIDv7 recommended). */
  record_id: z.string().trim().min(1).max(128),
  op_type: z.enum(['upsert', 'delete']),
  /**
   * Base64-encoded AEAD ciphertext (XChaCha20-Poly1305, nonce prepended).
   * The server stores this verbatim. Empty only when op_type === 'delete'.
   */
  payload_ciphertext: z.string(),
})
export type EncryptedOp = z.infer<typeof encryptedOpSchema>

/** POST /vault/push request body. */
export const vaultPushSchema = z.object({
  /** The device submitting these ops (must belong to the authenticated user). */
  device_id: z.string().uuid(),
  ops: z.array(encryptedOpSchema).min(1).max(500),
})
export type VaultPushInput = z.infer<typeof vaultPushSchema>

export const vaultPushOutputSchema = z.object({
  /** Server-assigned op ids (same order as the input ops array). */
  op_ids: z.array(z.number().int().positive()),
})
export type VaultPushOutput = z.infer<typeof vaultPushOutputSchema>

/**
 * POST /vault/pull request body.
 *
 * `since_op_id_per_table`: initial sync cursor — a map of table_name → last seen
 * op_id for that table. Omit entries for tables not yet synced.
 *
 * `since_id`: global sequential cursor for page 2+ (use the `next_cursor` from the
 * previous pull response). When present, `since_op_id_per_table` is ignored.
 */
export const vaultPullSchema = z.object({
  since_op_id_per_table: z.record(z.string(), z.number().int().nonnegative()).optional(),
  since_id: z.number().int().nonnegative().optional(),
})
export type VaultPullInput = z.infer<typeof vaultPullSchema>

/** A single op as returned by the pull endpoint. */
export const pulledOpSchema = encryptedOpSchema.extend({
  /** Server-assigned sequential id — use as the cursor for subsequent pulls. */
  id: z.number().int().positive(),
  device_id: z.string().uuid(),
  created_at: z.string().datetime(),
})
export type PulledOp = z.infer<typeof pulledOpSchema>

export const vaultPullOutputSchema = z.object({
  ops: z.array(pulledOpSchema),
  /** Cursor for the next page. `null` when this is the last page. */
  next_cursor: z.number().int().positive().nullable(),
})
export type VaultPullOutput = z.infer<typeof vaultPullOutputSchema>

/** GET /vault/manifest response body. */
export const vaultManifestOutputSchema = z.object({
  /** Incremented when the vault's data-key is rotated. */
  key_version: z.number().int().nonnegative(),
  /** Current server schema version. */
  schema_version: z.number().int().positive(),
  /** Per-table high-water marks: table_name → max op_id stored on the server. */
  latest_op_id_per_table: z.record(z.string(), z.number().int().positive()),
})
export type VaultManifestOutput = z.infer<typeof vaultManifestOutputSchema>

// ── Vault key material (CLAUDE.md §2.4, §18.4; docs/security.md §3–§5) ──────────
//
// The server stores the *wrapped* data key, the per-vault KDF salt, and the Argon2id
// params, and hands them back verbatim so a new device (or a recovering user) can
// re-derive the KEK and unwrap the data key entirely client-side. The server never
// sees the password, the KEK, the unwrapped data key, or plaintext — these blobs are
// opaque to it. All unlock inputs travel together from one endpoint (GET /vault/key)
// so the KDF has a single source of truth (no params/salt split across endpoints).

/** Standard base64 (with optional `=` padding). Bounded to defeat oversized inputs. */
const base64Schema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64')

/**
 * A data key encrypted under a KEK, in wire form. Mirrors the desktop `WrappedKey`
 * (`@cairn/shared-types`) with the binary fields base64-encoded. The server stores
 * this verbatim as opaque JSON; only the client can unwrap it.
 */
export const wrappedKeyWireSchema = z.object({
  algorithm: z.literal('xchacha20poly1305-ietf'),
  /** base64 of the 24-byte XChaCha20 nonce. */
  nonce: base64Schema,
  /** base64 of the wrapped data-key bytes ‖ 16-byte Poly1305 tag. */
  ciphertext: base64Schema,
})
export type WrappedKeyWire = z.infer<typeof wrappedKeyWireSchema>

/**
 * Argon2id parameters in wire form (snake_case). The desktop `KDFParams`
 * (`@cairn/shared-types`) serialized for transport. `mem_limit_bytes` is bounded below
 * at libsodium's safe interactive floor (8 KiB) and above to a sane ceiling so a
 * tampered descriptor cannot force a pathological allocation on the client.
 */
export const kdfParamsWireSchema = z.object({
  algorithm: z.literal('argon2id'),
  ops_limit: z.number().int().min(1).max(64),
  mem_limit_bytes: z
    .number()
    .int()
    .min(8_192)
    .max(2 * 1024 * 1024 * 1024),
  key_length_bytes: z.number().int().min(16).max(64),
})
export type KdfParamsWire = z.infer<typeof kdfParamsWireSchema>

/**
 * PUT /vault/key request body — enrollment and re-wrap (password change / recovery).
 * Carries the data key wrapped under both the password KEK and the recovery-phrase KEK,
 * plus the password-path KDF salt and params. The data key itself is unchanged across a
 * re-wrap, so `key_version` is server-owned and not part of this body.
 */
export const vaultKeyPutSchema = z.object({
  wrapped_data_key: wrappedKeyWireSchema,
  recovery_wrapped_data_key: wrappedKeyWireSchema,
  /** base64 of the 16-byte per-vault Argon2id salt for the password path. */
  kdf_salt: base64Schema,
  kdf: kdfParamsWireSchema,
})
export type VaultKeyPutInput = z.infer<typeof vaultKeyPutSchema>

/** GET /vault/key response — the full client-side unlock descriptor. */
export const vaultKeyOutputSchema = z.object({
  wrapped_data_key: wrappedKeyWireSchema,
  recovery_wrapped_data_key: wrappedKeyWireSchema,
  kdf_salt: base64Schema,
  kdf: kdfParamsWireSchema,
  /** Bumped only on a true data-key rotation; lets the client detect a stale key. */
  key_version: z.number().int().positive(),
})
export type VaultKeyOutput = z.infer<typeof vaultKeyOutputSchema>

/** PUT /vault/key response — enrollment/re-wrap acknowledgement. */
export const vaultKeyPutOutputSchema = z.object({
  key_version: z.number().int().positive(),
})
export type VaultKeyPutOutput = z.infer<typeof vaultKeyPutOutputSchema>
