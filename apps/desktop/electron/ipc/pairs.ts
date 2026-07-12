import { eq, asc } from 'drizzle-orm'
import { ipcMain } from 'electron'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import { derivePipValueFromTick } from '../services/pricing'
import type { IpcResponse, Pair, CreatePairInput, UpdatePairInput } from '../../shared/types/index'

const CreatePairSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  displayName: z.string().min(1).max(50),
  assetClass: z.enum(['forex', 'commodities', 'indices', 'crypto', 'stocks', 'other']),
  pipDecimal: z.number().int().min(0).max(5),
  pipValuePerStandardLotCents: z.number().int().positive(),
  tickSize: z.number().int().positive().nullable().optional(),
  tickValueCents: z.number().int().positive().nullable().optional(),
  correlatedWith: z.array(z.string()).optional(),
  notes: z.string().max(500).optional(),
})

const UpdatePairSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string().min(1).max(20).toUpperCase().optional(),
  displayName: z.string().min(1).max(50).optional(),
  assetClass: z.enum(['forex', 'commodities', 'indices', 'crypto', 'stocks', 'other']).optional(),
  pipDecimal: z.number().int().min(0).max(5).optional(),
  pipValuePerStandardLotCents: z.number().int().positive().optional(),
  tickSize: z.number().int().positive().nullable().optional(),
  tickValueCents: z.number().int().positive().nullable().optional(),
  correlatedWith: z.array(z.string()).nullable().optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  notes: z.string().max(500).nullable().optional(),
})

function mapRow(row: typeof schema.pairs.$inferSelect): Pair {
  return {
    id: row.id,
    symbol: row.symbol,
    displayName: row.displayName,
    assetClass: row.assetClass,
    pipDecimal: row.pipDecimal,
    pipValuePerStandardLotCents: row.pipValuePerStandardLotCents,
    tickSize: row.tickSize ?? null,
    tickValueCents: row.tickValueCents ?? null,
    correlatedWith: row.correlatedWith ?? null,
    active: row.active,
    displayOrder: row.displayOrder,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function registerPairHandlers(): void {
  ipcMain.handle('pairs:list', (): IpcResponse<Pair[]> => {
    try {
      const db = getDb()
      const rows = db.select().from(schema.pairs).orderBy(asc(schema.pairs.displayOrder)).all()
      return { ok: true, data: rows.map(mapRow) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('pairs:create', (_e, raw: CreatePairInput): IpcResponse<Pair> => {
    const parsed = CreatePairSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const now = Date.now()
      const id = uuidv7()
      const maxOrder = db.select().from(schema.pairs).orderBy(asc(schema.pairs.displayOrder)).all()
      const displayOrder =
        maxOrder.length > 0 ? (maxOrder[maxOrder.length - 1]?.displayOrder ?? 0) + 1 : 1
      // Contract-spec pairs derive their canonical pip value from the tick spec;
      // pip-configured pairs use the value entered directly.
      const tickSize = parsed.data.tickSize ?? null
      const tickValueCents = parsed.data.tickValueCents ?? null
      const pipValuePerStandardLotCents =
        tickSize !== null && tickValueCents !== null
          ? derivePipValueFromTick(tickSize, tickValueCents)
          : parsed.data.pipValuePerStandardLotCents
      db.insert(schema.pairs)
        .values({
          id,
          symbol: parsed.data.symbol,
          displayName: parsed.data.displayName,
          assetClass: parsed.data.assetClass,
          pipDecimal: parsed.data.pipDecimal,
          pipValuePerStandardLotCents,
          tickSize,
          tickValueCents,
          correlatedWith: parsed.data.correlatedWith
            ? JSON.stringify(parsed.data.correlatedWith)
            : null,
          active: 1,
          displayOrder,
          notes: parsed.data.notes ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      const row = db.select().from(schema.pairs).where(eq(schema.pairs.id, id)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Insert failed' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('pairs:update', (_e, raw: UpdatePairInput): IpcResponse<Pair> => {
    const parsed = UpdatePairSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const { id, ...fields } = parsed.data
      const u: Partial<typeof schema.pairs.$inferInsert> = { updatedAt: Date.now() }
      if (fields.symbol !== undefined) u.symbol = fields.symbol
      if (fields.displayName !== undefined) u.displayName = fields.displayName
      if (fields.assetClass !== undefined) u.assetClass = fields.assetClass
      if (fields.pipDecimal !== undefined) u.pipDecimal = fields.pipDecimal
      if ('tickSize' in fields) u.tickSize = fields.tickSize ?? null
      if ('tickValueCents' in fields) u.tickValueCents = fields.tickValueCents ?? null
      // A supplied contract spec derives the pip value; otherwise an explicitly
      // provided pip value is used as-is.
      if (fields.tickSize != null && fields.tickValueCents != null) {
        u.pipValuePerStandardLotCents = derivePipValueFromTick(
          fields.tickSize,
          fields.tickValueCents,
        )
      } else if (fields.pipValuePerStandardLotCents !== undefined) {
        u.pipValuePerStandardLotCents = fields.pipValuePerStandardLotCents
      }
      if (fields.active !== undefined) u.active = fields.active ? 1 : 0
      if (fields.displayOrder !== undefined) u.displayOrder = fields.displayOrder
      if ('correlatedWith' in fields)
        u.correlatedWith = fields.correlatedWith ? JSON.stringify(fields.correlatedWith) : null
      if ('notes' in fields) u.notes = fields.notes ?? null
      db.update(schema.pairs).set(u).where(eq(schema.pairs.id, id)).run()
      const row = db.select().from(schema.pairs).where(eq(schema.pairs.id, id)).get()
      if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Pair not found' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
