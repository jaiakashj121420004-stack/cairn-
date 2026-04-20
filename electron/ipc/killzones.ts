import { ipcMain } from 'electron'
import { eq, asc } from 'drizzle-orm'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type { IpcResponse, Killzone, CreateKillzoneInput, UpdateKillzoneInput } from '../../shared/types/index'

const HhMm = z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format')

const CreateKillzoneSchema = z.object({
  name: z.string().min(1).max(60),
  startTimeUtc: HhMm,
  endTimeUtc: HhMm,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  notes: z.string().max(500).optional(),
})

const UpdateKillzoneSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60).optional(),
  startTimeUtc: HhMm.optional(),
  endTimeUtc: HhMm.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  notes: z.string().max(500).nullable().optional(),
})

function mapRow(row: typeof schema.killzones.$inferSelect): Killzone {
  return {
    id: row.id,
    name: row.name,
    startTimeUtc: row.startTimeUtc,
    endTimeUtc: row.endTimeUtc,
    color: row.color,
    active: row.active,
    displayOrder: row.displayOrder,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function registerKillzoneHandlers(): void {
  ipcMain.handle('killzones:list', (): IpcResponse<Killzone[]> => {
    try {
      const db = getDb()
      const rows = db.select().from(schema.killzones).orderBy(asc(schema.killzones.displayOrder)).all()
      return { ok: true, data: rows.map(mapRow) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('killzones:create', (_e, raw: CreateKillzoneInput): IpcResponse<Killzone> => {
    const parsed = CreateKillzoneSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const now = Date.now()
      const id = uuidv7()
      const all = db.select().from(schema.killzones).orderBy(asc(schema.killzones.displayOrder)).all()
      const displayOrder = all.length > 0 ? (all[all.length - 1]?.displayOrder ?? 0) + 1 : 1
      db.insert(schema.killzones)
        .values({
          id,
          name: parsed.data.name,
          startTimeUtc: parsed.data.startTimeUtc,
          endTimeUtc: parsed.data.endTimeUtc,
          color: parsed.data.color,
          active: 1,
          displayOrder,
          notes: parsed.data.notes ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      const row = db.select().from(schema.killzones).where(eq(schema.killzones.id, id)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Insert failed' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('killzones:update', (_e, raw: UpdateKillzoneInput): IpcResponse<Killzone> => {
    const parsed = UpdateKillzoneSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const { id, ...fields } = parsed.data
      const u: Partial<typeof schema.killzones.$inferInsert> = { updatedAt: Date.now() }
      if (fields.name !== undefined) u.name = fields.name
      if (fields.startTimeUtc !== undefined) u.startTimeUtc = fields.startTimeUtc
      if (fields.endTimeUtc !== undefined) u.endTimeUtc = fields.endTimeUtc
      if (fields.color !== undefined) u.color = fields.color
      if (fields.active !== undefined) u.active = fields.active ? 1 : 0
      if (fields.displayOrder !== undefined) u.displayOrder = fields.displayOrder
      if ('notes' in fields) u.notes = fields.notes ?? null
      db.update(schema.killzones).set(u).where(eq(schema.killzones.id, id)).run()
      const row = db.select().from(schema.killzones).where(eq(schema.killzones.id, id)).get()
      if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Killzone not found' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
