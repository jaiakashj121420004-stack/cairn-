import { ipcMain } from 'electron'
import { eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type { IpcResponse, PropFirm, CreatePropFirmInput, UpdatePropFirmInput } from '../../shared/types/index'

const CreatePropFirmSchema = z.object({
  name: z.string().min(1).max(100),
  defaultStepCount: z.number().int().min(1).max(5),
  notes: z.string().max(500).optional(),
})

const UpdatePropFirmSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  defaultStepCount: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(500).nullable().optional(),
  deletedAt: z.number().int().nullable().optional(),
})

export function registerPropFirmHandlers(): void {
  ipcMain.handle('propFirms:list', (): IpcResponse<PropFirm[]> => {
    try {
      const db = getDb()
      const rows = db
        .select()
        .from(schema.propFirms)
        .where(isNull(schema.propFirms.deletedAt))
        .all()
      return { ok: true, data: rows as PropFirm[] }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('propFirms:create', (_e, raw: CreatePropFirmInput): IpcResponse<PropFirm> => {
    const parsed = CreatePropFirmSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const now = Date.now()
      const id = uuidv7()
      db.insert(schema.propFirms)
        .values({
          id,
          name: parsed.data.name,
          defaultStepCount: parsed.data.defaultStepCount,
          notes: parsed.data.notes ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      const row = db
        .select()
        .from(schema.propFirms)
        .where(eq(schema.propFirms.id, id))
        .get()
      return { ok: true, data: row as PropFirm }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('propFirms:update', (_e, raw: UpdatePropFirmInput): IpcResponse<PropFirm> => {
    const parsed = UpdatePropFirmSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const { id, ...fields } = parsed.data
      const updateData: Partial<typeof schema.propFirms.$inferInsert> = { updatedAt: Date.now() }
      if (fields.name !== undefined) updateData.name = fields.name
      if (fields.defaultStepCount !== undefined) updateData.defaultStepCount = fields.defaultStepCount
      if ('notes' in fields) updateData.notes = fields.notes ?? null
      if ('deletedAt' in fields) updateData.deletedAt = fields.deletedAt ?? null
      db.update(schema.propFirms).set(updateData).where(eq(schema.propFirms.id, id)).run()
      const row = db.select().from(schema.propFirms).where(eq(schema.propFirms.id, id)).get()
      if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Prop firm not found' } }
      return { ok: true, data: row as PropFirm }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
