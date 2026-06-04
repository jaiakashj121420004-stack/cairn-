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
