import { and, desc, eq, isNull, like, or } from 'drizzle-orm'
import { ipcMain } from 'electron'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type {
  IpcResponse,
  NotebookEntry,
  NotebookEntrySummary,
  CreateNotebookEntryInput,
  UpdateNotebookEntryInput,
  NotebookSearchInput,
} from '../../shared/types/index'

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(100_000).optional(),
  template: z.string().max(40).nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
})

const UpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(100_000).optional(),
  pinned: z.boolean().optional(),
  accountId: z.string().uuid().nullable().optional(),
})

const IdSchema = z.object({ id: z.string().uuid() })

const SearchSchema = z.object({
  query: z.string().min(1).max(200),
  accountId: z.string().uuid().nullable().optional(),
})

function mapRow(row: typeof schema.notebookEntries.$inferSelect): NotebookEntry {
  return {
    id: row.id,
    accountId: row.accountId ?? null,
    title: row.title,
    content: row.content,
    template: row.template ?? null,
    pinned: row.pinned,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Plain-text preview: strip common markdown markers and collapse whitespace. */
function toPreview(content: string): string {
  return content
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

function toSummary(row: typeof schema.notebookEntries.$inferSelect): NotebookEntrySummary {
  return {
    id: row.id,
    accountId: row.accountId ?? null,
    title: row.title,
    template: row.template ?? null,
    pinned: row.pinned,
    updatedAt: row.updatedAt,
    preview: toPreview(row.content),
  }
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
      return { ok: true, data: rows.map(toSummary) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle(
    'notebook:search',
    (_e, raw: NotebookSearchInput): IpcResponse<NotebookEntrySummary[]> => {
      const parsed = SearchSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        const q = `%${parsed.data.query}%`
        const rows = db
          .select()
          .from(schema.notebookEntries)
          .where(
            and(
              isNull(schema.notebookEntries.deletedAt),
              or(like(schema.notebookEntries.title, q), like(schema.notebookEntries.content, q)),
            ),
          )
          .orderBy(desc(schema.notebookEntries.pinned), desc(schema.notebookEntries.updatedAt))
          .all()
        return { ok: true, data: rows.map(toSummary) }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

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

  ipcMain.handle(
    'notebook:create',
    (_e, raw: CreateNotebookEntryInput): IpcResponse<NotebookEntry> => {
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
            accountId: parsed.data.accountId ?? null,
            title: parsed.data.title,
            content: parsed.data.content ?? '',
            template: parsed.data.template ?? null,
            pinned: 0,
            version: 1,
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
    },
  )

  ipcMain.handle(
    'notebook:update',
    (_e, raw: UpdateNotebookEntryInput): IpcResponse<NotebookEntry> => {
      const parsed = UpdateSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        const { id, ...fields } = parsed.data
        const existing = db
          .select()
          .from(schema.notebookEntries)
          .where(eq(schema.notebookEntries.id, id))
          .get()
        const currentVersion = existing?.version ?? 1
        const u: Partial<typeof schema.notebookEntries.$inferInsert> = { updatedAt: Date.now() }
        if (fields.title !== undefined) u.title = fields.title
        if (fields.content !== undefined) u.content = fields.content
        if (fields.pinned !== undefined) u.pinned = fields.pinned ? 1 : 0
        if ('accountId' in fields) u.accountId = fields.accountId ?? null
        if (fields.content !== undefined || fields.title !== undefined) {
          u.version = currentVersion + 1
        }
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
    },
  )

  ipcMain.handle('notebook:delete', (_e, raw: { id: string }): IpcResponse<{ ok: true }> => {
    const parsed = IdSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      db.update(schema.notebookEntries)
        .set({ deletedAt: Date.now(), updatedAt: Date.now() })
        .where(
          and(
            eq(schema.notebookEntries.id, parsed.data.id),
            isNull(schema.notebookEntries.deletedAt),
          ),
        )
        .run()
      return { ok: true, data: { ok: true } }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
