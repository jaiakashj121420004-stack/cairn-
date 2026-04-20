import { ipcMain } from 'electron'
import { eq, asc } from 'drizzle-orm'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type { IpcResponse, Setup, CreateSetupInput, UpdateSetupInput } from '../../shared/types/index'

const CreateSetupSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.string().min(1).max(40),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

const UpdateSetupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80).optional(),
  category: z.string().min(1).max(40).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
})

function mapRow(row: typeof schema.setups.$inferSelect): Setup {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? null,
    color: row.color,
    active: row.active,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function registerSetupHandlers(): void {
  ipcMain.handle('setups:list', (): IpcResponse<Setup[]> => {
    try {
      const db = getDb()
      const rows = db.select().from(schema.setups).orderBy(asc(schema.setups.displayOrder)).all()
      return { ok: true, data: rows.map(mapRow) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('setups:create', (_e, raw: CreateSetupInput): IpcResponse<Setup> => {
    const parsed = CreateSetupSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const now = Date.now()
      const id = uuidv7()
      const all = db.select().from(schema.setups).orderBy(asc(schema.setups.displayOrder)).all()
      const displayOrder = all.length > 0 ? (all[all.length - 1]?.displayOrder ?? 0) + 1 : 1
      db.insert(schema.setups)
        .values({
          id,
          name: parsed.data.name,
          category: parsed.data.category,
          description: parsed.data.description ?? null,
          color: parsed.data.color,
          active: 1,
          displayOrder,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      const row = db.select().from(schema.setups).where(eq(schema.setups.id, id)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Insert failed' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('setups:update', (_e, raw: UpdateSetupInput): IpcResponse<Setup> => {
    const parsed = UpdateSetupSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const { id, ...fields } = parsed.data
      const u: Partial<typeof schema.setups.$inferInsert> = { updatedAt: Date.now() }
      if (fields.name !== undefined) u.name = fields.name
      if (fields.category !== undefined) u.category = fields.category
      if (fields.color !== undefined) u.color = fields.color
      if (fields.active !== undefined) u.active = fields.active ? 1 : 0
      if (fields.displayOrder !== undefined) u.displayOrder = fields.displayOrder
      if ('description' in fields) u.description = fields.description ?? null
      db.update(schema.setups).set(u).where(eq(schema.setups.id, id)).run()
      const row = db.select().from(schema.setups).where(eq(schema.setups.id, id)).get()
      if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Setup not found' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
