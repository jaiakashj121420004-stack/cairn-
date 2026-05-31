import { ipcMain } from 'electron'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type {
  IpcResponse,
  NotebookEntry,
  NotebookEntrySummary,
  CreateNotebookEntryInput,
  UpdateNotebookEntryInput,
} from '../../shared/types/index'

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(100_000).optional(),
  template: z.string().max(40).nullable().optional(),
})

const UpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(100_000).optional(),
  pinned: z.boolean().optional(),
})

const IdSchema = z.object({ id: z.string().uuid() })

function mapRow(row: typeof schema.notebookEntries.$inferSelect): NotebookEntry {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    template: row.template ?? null,
    pinned: row.pinned,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Plain-text preview: strip the common markdown markers and collapse whitespace. */
function toPreview(content: string): string {
  return content
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

export function registerNotebookHandlers(): void {
  ipcMain.handle('notebook:list', (): IpcResponse<NotebookEntrySummary[]> => {
    try {
      const db = getDb()
      const rows = db
        .select()
        .from(schema.notebookEntries)
        .where(isNull(schema.notebookEntries.deletedAt))
        .orderBy(desc(schema.notebookEntries.pinned), desc(schema.notebookEntries.updatedAt))
        .all()
      const data: NotebookEntrySummary[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        template: r.template ?? null,
        pinned: r.pinned,
        updatedAt: r.updatedAt,
        preview: toPreview(r.content),
      }))
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('notebook:get', (_e, raw: { id: string }): IpcResponse<NotebookEntry> => {
    const parsed = IdSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const row = db
        .select()
        .from(schema.notebookEntries)
        .where(eq(schema.notebookEntries.id, parsed.data.id))
        .get()
      if (!row || row.deletedAt !== null) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Note not found' } }
      }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('notebook:create', (_e, raw: CreateNotebookEntryInput): IpcResponse<NotebookEntry> => {
    const parsed = CreateSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const now = Date.now()
      const id = uuidv7()
      db.insert(schema.notebookEntries)
        .values({
          id,
          title: parsed.data.title,
          content: parsed.data.content ?? '',
          template: parsed.data.template ?? null,
          pinned: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      const row = db
        .select()
        .from(schema.notebookEntries)
        .where(eq(schema.notebookEntries.id, id))
        .get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Insert failed' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('notebook:update', (_e, raw: UpdateNotebookEntryInput): IpcResponse<NotebookEntry> => {
    const parsed = UpdateSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const { id, ...fields } = parsed.data
      const u: Partial<typeof schema.notebookEntries.$inferInsert> = { updatedAt: Date.now() }
      if (fields.title !== undefined) u.title = fields.title
      if (fields.content !== undefined) u.content = fields.content
      if (fields.pinned !== undefined) u.pinned = fields.pinned ? 1 : 0
      db.update(schema.notebookEntries).set(u).where(eq(schema.notebookEntries.id, id)).run()
      const row = db
        .select()
        .from(schema.notebookEntries)
        .where(eq(schema.notebookEntries.id, id))
        .get()
      if (!row || row.deletedAt !== null) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Note not found' } }
      }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('notebook:delete', (_e, raw: { id: string }): IpcResponse<{ ok: true }> => {
    const parsed = IdSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      db.update(schema.notebookEntries)
        .set({ deletedAt: Date.now(), updatedAt: Date.now() })
        .where(and(eq(schema.notebookEntries.id, parsed.data.id), isNull(schema.notebookEntries.deletedAt)))
        .run()
      return { ok: true, data: { ok: true } }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
