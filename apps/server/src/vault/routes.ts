import { ERROR_CODES } from '@cairn/shared-types'
import {
  vaultKeyOutputSchema,
  vaultKeyPutOutputSchema,
  vaultKeyPutSchema,
  vaultManifestOutputSchema,
  vaultPullOutputSchema,
  vaultPullSchema,
  vaultPushOutputSchema,
  vaultPushSchema,
} from '@cairn/shared-zod'
import { and, asc, eq, gt, isNull, notInArray, or, sql } from 'drizzle-orm'
import { authedUser, makeRequireAuth, requireVerifiedEmail } from '../auth/middleware'
import { devices, vaultMeta, vaultOps } from '../db/schema'
import { AppError } from '../lib/errors'
import { parseBody, sendError, sendValidated, toAppError } from '../lib/http'
import type { Db } from '../db/client'
import type { Env } from '../env'
import type { KdfParamsWire, WrappedKeyWire } from '@cairn/shared-zod'
import type { SQL } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

/**
 * Vault sync endpoints (CLAUDE.md §18.5, §18.6).
 *
 * The server never decrypts or inspects vault payloads — it treats every
 * `payload_ciphertext` as an opaque byte string. Shape validation (Zod) checks only
 * the envelope fields (table_name, record_id, op_type). The crypto integrity is
 * maintained end-to-end by the client's AEAD layer.
 *
 * Endpoints:
 *   GET  /vault/manifest   — per-table high-water marks + key/schema versions
 *   POST /vault/push       — append encrypted ops; 5 MB body limit; single transaction
 *   POST /vault/pull       — paginated op fetch (500 per page) with cursor support
 *   GET  /vault/key        — client-side unlock descriptor (wrapped keys + KDF); 404 until enrolled
 *   PUT  /vault/key        — enrollment / re-wrap of the wrapped key material (upsert)
 */

const VAULT_PUSH_BODY_LIMIT = 5 * 1024 * 1024 // 5 MB
const PULL_PAGE_SIZE = 500

export interface VaultRouteDeps {
  readonly db: Db
  readonly env: Env
}

export function registerVaultRoutes(app: FastifyInstance, deps: VaultRouteDeps): void {
  const { db, env } = deps
  const requireAuth = makeRequireAuth(env)

  // GET /vault/manifest — per-table high-water marks and key/schema versions.
  app.get(
    '/vault/manifest',
    { preHandler: [requireAuth, requireVerifiedEmail] },
    async (req, reply) => {
      try {
        const userId = authedUser(req).userId

        const [meta, hwmRows] = await Promise.all([
          db.select().from(vaultMeta).where(eq(vaultMeta.userId, userId)).limit(1),
          db
            .select({
              tableName: vaultOps.tableName,
              maxId: sql<number>`MAX(${vaultOps.id})`,
            })
            .from(vaultOps)
            .where(eq(vaultOps.userId, userId))
            .groupBy(vaultOps.tableName),
        ])

        const latest_op_id_per_table: Record<string, number> = {}
        for (const row of hwmRows) {
          latest_op_id_per_table[row.tableName] = row.maxId
        }

        sendValidated(reply, vaultManifestOutputSchema, {
          key_version: meta[0]?.keyVersion ?? 0,
          schema_version: meta[0]?.schemaVersion ?? 1,
          latest_op_id_per_table,
        })
      } catch (err) {
        sendError(reply, toAppError(err))
      }
    },
  )

  // POST /vault/push — append encrypted ops for the user's vault.
  app.post(
    '/vault/push',
    { bodyLimit: VAULT_PUSH_BODY_LIMIT, preHandler: [requireAuth, requireVerifiedEmail] },
    async (req, reply) => {
      try {
        const input = parseBody(vaultPushSchema, req.body)
        const userId = authedUser(req).userId

        // Verify the device belongs to the calling user and is not revoked.
        const deviceRows = await db
          .select({ id: devices.id })
          .from(devices)
          .where(
            and(
              eq(devices.id, input.device_id),
              eq(devices.userId, userId),
              isNull(devices.revokedAt),
            ),
          )
          .limit(1)

        if (deviceRows.length === 0) {
          throw new AppError(ERROR_CODES.FORBIDDEN, 'device not found or revoked')
        }

        // Append all ops atomically; bump device last_seen_at in the same transaction.
        const op_ids = await db.transaction(async (tx) => {
          // Touch the device.
          await tx
            .update(devices)
            .set({ lastSeenAt: new Date() })
            .where(eq(devices.id, input.device_id))

          // Insert each op and collect the assigned ids.
          const ids: number[] = []
          for (const op of input.ops) {
            const inserted = await tx
              .insert(vaultOps)
              .values({
                userId,
                deviceId: input.device_id,
                tableName: op.table_name,
                recordId: op.record_id,
                opType: op.op_type,
                payloadCiphertext: op.payload_ciphertext,
              })
              .returning({ id: vaultOps.id })
            const row = inserted[0]
            if (!row) throw new AppError(ERROR_CODES.INTERNAL, 'failed to insert vault op')
            ids.push(row.id)
          }
          return ids
        })

        sendValidated(reply, vaultPushOutputSchema, { op_ids })
      } catch (err) {
        sendError(reply, toAppError(err))
      }
    },
  )

  // POST /vault/pull — fetch ops newer than the provided cursors.
  app.post(
    '/vault/pull',
    { preHandler: [requireAuth, requireVerifiedEmail] },
    async (req, reply) => {
      try {
        const input = parseBody(vaultPullSchema, req.body)
        const userId = authedUser(req).userId

        const where = buildPullWhere(
          userId,
          input.since_op_id_per_table ?? {},
          input.since_id ?? null,
        )

        // Fetch one extra to detect whether a next page exists.
        const rows = await db
          .select({
            id: vaultOps.id,
            deviceId: vaultOps.deviceId,
            tableName: vaultOps.tableName,
            recordId: vaultOps.recordId,
            opType: vaultOps.opType,
            payloadCiphertext: vaultOps.payloadCiphertext,
            createdAt: vaultOps.createdAt,
          })
          .from(vaultOps)
          .where(where)
          .orderBy(asc(vaultOps.id))
          .limit(PULL_PAGE_SIZE + 1)

        const hasMore = rows.length > PULL_PAGE_SIZE
        const page = hasMore ? rows.slice(0, PULL_PAGE_SIZE) : rows
        const last = page[page.length - 1]
        const next_cursor = hasMore && last ? last.id : null

        const ops = page.map((r) => ({
          id: r.id,
          device_id: r.deviceId,
          table_name: r.tableName,
          record_id: r.recordId,
          op_type: r.opType,
          payload_ciphertext: r.payloadCiphertext,
          created_at: r.createdAt.toISOString(),
        }))

        sendValidated(reply, vaultPullOutputSchema, { ops, next_cursor })
      } catch (err) {
        sendError(reply, toAppError(err))
      }
    },
  )

  // GET /vault/key — the full client-side unlock descriptor (wrapped keys + KDF).
  //
  // All unlock inputs are returned together so the KDF has a single source of truth:
  // the per-vault salt and the Argon2id params travel with the wrapped key, never split
  // across endpoints (the manifest stays the sync-cursor surface). The server hands
  // these blobs back verbatim and cannot read them. 404 until the vault is enrolled.
  app.get('/vault/key', { preHandler: [requireAuth, requireVerifiedEmail] }, async (req, reply) => {
    try {
      const userId = authedUser(req).userId
      const rows = await db
        .select({
          keyVersion: vaultMeta.keyVersion,
          wrappedDataKey: vaultMeta.wrappedDataKey,
          recoveryWrappedDataKey: vaultMeta.recoveryWrappedDataKey,
          kdfSalt: vaultMeta.kdfSalt,
          kdf: vaultMeta.kdf,
        })
        .from(vaultMeta)
        .where(eq(vaultMeta.userId, userId))
        .limit(1)

      // PUT writes all four key columns as a unit (and only ever together), so in
      // practice they are all-null (a row created by some other path, or never enrolled)
      // or all-present (enrolled). The all-four check therefore means "not enrolled";
      // a partially-populated row would also read as not-enrolled, which is the safe
      // default — the client re-enrolls rather than receiving a half descriptor.
      const row = rows[0]
      if (
        !row ||
        row.wrappedDataKey === null ||
        row.recoveryWrappedDataKey === null ||
        row.kdfSalt === null ||
        row.kdf === null
      ) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'vault not enrolled')
      }

      // The blobs were validated by PUT before storage; `sendValidated` re-checks the
      // full shape on the way out, so any corruption surfaces as a 500, never a
      // malformed descriptor shipped to a client (no-slop footer: validate read-back).
      sendValidated(reply, vaultKeyOutputSchema, {
        wrapped_data_key: row.wrappedDataKey as WrappedKeyWire,
        recovery_wrapped_data_key: row.recoveryWrappedDataKey as WrappedKeyWire,
        kdf_salt: row.kdfSalt,
        kdf: row.kdf as KdfParamsWire,
        key_version: row.keyVersion,
      })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // PUT /vault/key — enrollment and re-wrap (password change / recovery).
  //
  // Idempotent upsert: first write enrolls the vault; a later write (after a password
  // change or a recovery-phrase restore) overwrites the wrapped key + salt + params.
  // The data key itself never changes here, so `key_version` is server-owned and left
  // intact (it tracks true data-key rotation, not re-wrapping).
  app.put('/vault/key', { preHandler: [requireAuth, requireVerifiedEmail] }, async (req, reply) => {
    try {
      const input = parseBody(vaultKeyPutSchema, req.body)
      const userId = authedUser(req).userId

      const rows = await db
        .insert(vaultMeta)
        .values({
          userId,
          wrappedDataKey: input.wrapped_data_key,
          recoveryWrappedDataKey: input.recovery_wrapped_data_key,
          kdfSalt: input.kdf_salt,
          kdf: input.kdf,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: vaultMeta.userId,
          set: {
            wrappedDataKey: input.wrapped_data_key,
            recoveryWrappedDataKey: input.recovery_wrapped_data_key,
            kdfSalt: input.kdf_salt,
            kdf: input.kdf,
            updatedAt: new Date(),
          },
        })
        .returning({ keyVersion: vaultMeta.keyVersion })

      const row = rows[0]
      if (!row) throw new AppError(ERROR_CODES.INTERNAL, 'failed to store vault key')

      sendValidated(reply, vaultKeyPutOutputSchema, { key_version: row.keyVersion })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })
}

/**
 * Build the WHERE clause for a vault pull query.
 *
 * When `sinceId` is provided (pagination continuation) it takes precedence over
 * per-table cursors — all ops with `id > sinceId` are returned regardless of table.
 *
 * When only `sincePerTable` is provided, ops are fetched per-table from their
 * individual cursors, plus all ops for tables not mentioned (from id 0 onward).
 */
function buildPullWhere(
  userId: string,
  sincePerTable: Record<string, number>,
  sinceId: number | null,
): SQL {
  const userCond = eq(vaultOps.userId, userId)

  if (sinceId !== null) {
    return and(userCond, gt(vaultOps.id, sinceId)) as SQL
  }

  const entries = Object.entries(sincePerTable)
  if (entries.length === 0) {
    return userCond
  }

  // Per-table cursor: each named table is fetched from its own high-water mark…
  const tableConds = entries.map(
    ([table, since]) => and(eq(vaultOps.tableName, table), gt(vaultOps.id, since)) as SQL,
  )
  // …and any table the client has never synced is returned in full (id 0 onward).
  const catchAll = notInArray(
    vaultOps.tableName,
    entries.map(([table]) => table),
  )

  return and(userCond, or(...tableConds, catchAll)) as SQL
}
