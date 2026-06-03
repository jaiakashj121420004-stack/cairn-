import { and, asc, eq, isNull } from 'drizzle-orm'
import { ipcMain } from 'electron'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type {
  IpcResponse,
  Playbook,
  CreatePlaybookInput,
  UpdatePlaybookInput,
} from '../../shared/types/index'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1).max(120),
  setupId: z.string().uuid(),
  pairId: z.string().uuid().nullable().optional(),
  killzoneId: z.string().uuid().nullable().optional(),
  requiredConfluenceMd: z.string().max(5000).nullable().optional(),
  defaultRiskPct: z.number().int().min(1).max(10000).nullable().optional(),
  defaultInvalidationChip: z.string().max(40).nullable().optional(),
})

const UpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  setupId: z.string().uuid().optional(),
  pairId: z.string().uuid().nullable().optional(),
  killzoneId: z.string().uuid().nullable().optional(),
  requiredConfluenceMd: z.string().max(5000).nullable().optional(),
  defaultRiskPct: z.number().int().min(1).max(10000).nullable().optional(),
  defaultInvalidationChip: z.string().max(40).nullable().optional(),
})

const IdSchema = z.object({ id: z.string().uuid() })
const AccountIdSchema = z.object({ accountId: z.string().uuid() })

// ─── Mapping ──────────────────────────────────────────────────────────────────

function mapRow(row: typeof schema.playbooks.$inferSelect): Playbook {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    pairId: row.pairId ?? null,
    setupId: row.setupId,
    killzoneId: row.killzoneId ?? null,
    requiredConfluenceMd: row.requiredConfluenceMd ?? null,
    defaultRiskPct: row.defaultRiskPct ?? null,
    defaultInvalidationChip: row.defaultInvalidationChip ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
    version: row.version,
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerPlaybookHandlers(): void {
  // ── playbooks:list ─────────────────────────────────────────────────────────
  ipcMain.handle('playbooks:list', (_e, raw: unknown): IpcResponse<Playbook[]> => {
    const parsed = AccountIdSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const rows = db
        .select()
        .from(schema.playbooks)
        .where(
          and(
            eq(schema.playbooks.accountId, parsed.data.accountId),
            isNull(schema.playbooks.deletedAt),
          ),
        )
        .orderBy(asc(schema.playbooks.name))
        .all()
      return { ok: true, data: rows.map(mapRow) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── playbooks:get ──────────────────────────────────────────────────────────
  ipcMain.handle('playbooks:get', (_e, raw: unknown): IpcResponse<Playbook> => {
    const parsed = IdSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const row = db
        .select()
        .from(schema.playbooks)
        .where(eq(schema.playbooks.id, parsed.data.id))
        .get()
      if (!row || row.deletedAt !== null) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Playbook not found' } }
      }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── playbooks:create ───────────────────────────────────────────────────────
  ipcMain.handle('playbooks:create', (_e, raw: CreatePlaybookInput): IpcResponse<Playbook> => {
    const parsed = CreateSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const now = Date.now()
      const id = uuidv7()
      const d = parsed.data
      db.insert(schema.playbooks)
        .values({
          id,
          accountId: d.accountId,
          name: d.name,
          setupId: d.setupId,
          pairId: d.pairId ?? null,
          killzoneId: d.killzoneId ?? null,
          requiredConfluenceMd: d.requiredConfluenceMd ?? null,
          defaultRiskPct: d.defaultRiskPct ?? null,
          defaultInvalidationChip: d.defaultInvalidationChip ?? null,
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      const row = db.select().from(schema.playbooks).where(eq(schema.playbooks.id, id)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Insert failed' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── playbooks:update ───────────────────────────────────────────────────────
  ipcMain.handle('playbooks:update', (_e, raw: UpdatePlaybookInput): IpcResponse<Playbook> => {
    const parsed = UpdateSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const { id, ...fields } = parsed.data
      const existing = db.select().from(schema.playbooks).where(eq(schema.playbooks.id, id)).get()
      if (!existing || existing.deletedAt !== null) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Playbook not found' } }
      }
      const u: Partial<typeof schema.playbooks.$inferInsert> = {
        updatedAt: Date.now(),
        version: existing.version + 1,
      }
      if (fields.name !== undefined) u.name = fields.name
      if (fields.setupId !== undefined) u.setupId = fields.setupId
      if ('pairId' in fields) u.pairId = fields.pairId ?? null
      if ('killzoneId' in fields) u.killzoneId = fields.killzoneId ?? null
      if ('requiredConfluenceMd' in fields)
        u.requiredConfluenceMd = fields.requiredConfluenceMd ?? null
      if ('defaultRiskPct' in fields) u.defaultRiskPct = fields.defaultRiskPct ?? null
      if ('defaultInvalidationChip' in fields)
        u.defaultInvalidationChip = fields.defaultInvalidationChip ?? null
      db.update(schema.playbooks).set(u).where(eq(schema.playbooks.id, id)).run()
      const row = db.select().from(schema.playbooks).where(eq(schema.playbooks.id, id)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Update failed' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── playbooks:delete ───────────────────────────────────────────────────────
  ipcMain.handle('playbooks:delete', (_e, raw: unknown): IpcResponse<{ ok: true }> => {
    const parsed = IdSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      db.update(schema.playbooks)
        .set({ deletedAt: Date.now(), updatedAt: Date.now() })
        .where(and(eq(schema.playbooks.id, parsed.data.id), isNull(schema.playbooks.deletedAt)))
        .run()
      return { ok: true, data: { ok: true } }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
