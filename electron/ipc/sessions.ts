import { ipcMain } from 'electron'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type { IpcResponse, Session, CreateSessionInput } from '../../shared/types/index'

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function mapRow(row: typeof schema.sessions.$inferSelect): Session {
  return {
    id: row.id,
    accountId: row.accountId,
    sessionDate: row.sessionDate,
    dailyBias: row.dailyBias as Session['dailyBias'],
    dailyBiasReason: row.dailyBiasReason,
    h4Bias: row.h4Bias as Session['h4Bias'],
    h4BiasReason: row.h4BiasReason,
    h1Bias: row.h1Bias as Session['h1Bias'],
    h1BiasReason: row.h1BiasReason,
    htfLiquidityTarget: row.htfLiquidityTarget ?? null,
    dxyBias: (row.dxyBias ?? null) as Session['dxyBias'],
    smtNotes: row.smtNotes ?? null,
    sessionPlan: row.sessionPlan ?? null,
    keyLevels: row.keyLevels ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lockedAt: row.lockedAt ?? null,
  }
}

const BiasEnum = z.enum(['bullish', 'bearish', 'neutral'])

const CreateSessionSchema = z.object({
  accountId: z.string().uuid(),
  dailyBias: BiasEnum,
  dailyBiasReason: z.string().min(1).max(300),
  h4Bias: BiasEnum,
  h4BiasReason: z.string().min(1).max(300),
  h1Bias: BiasEnum,
  h1BiasReason: z.string().min(1).max(300),
  htfLiquidityTarget: z.string().max(200).optional(),
  dxyBias: z.enum(['bullish', 'bearish', 'neutral', 'n/a']).optional(),
  smtNotes: z.string().max(500).optional(),
  sessionPlan: z.string().max(2000).optional(),
  keyLevels: z.array(z.string().max(20)).max(20).optional(),
})

export function registerSessionHandlers(): void {
  ipcMain.handle('sessions:getToday', (_e, raw: { accountId: string }): IpcResponse<Session | null> => {
    try {
      const db = getDb()
      const row = db
        .select()
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.accountId, raw.accountId),
            eq(schema.sessions.sessionDate, todayUtc()),
          ),
        )
        .get()
      return { ok: true, data: row ? mapRow(row) : null }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('sessions:upsert', (_e, raw: CreateSessionInput): IpcResponse<Session> => {
    const parsed = CreateSessionSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const today = todayUtc()

      // Guard: return existing if already logged today
      const existing = db
        .select()
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.accountId, parsed.data.accountId),
            eq(schema.sessions.sessionDate, today),
          ),
        )
        .get()

      if (existing) {
        // If not locked, allow update of bias fields
        if (!existing.lockedAt) {
          const now = Date.now()
          db.update(schema.sessions)
            .set({
              dailyBias: parsed.data.dailyBias,
              dailyBiasReason: parsed.data.dailyBiasReason,
              h4Bias: parsed.data.h4Bias,
              h4BiasReason: parsed.data.h4BiasReason,
              h1Bias: parsed.data.h1Bias,
              h1BiasReason: parsed.data.h1BiasReason,
              htfLiquidityTarget: parsed.data.htfLiquidityTarget ?? null,
              dxyBias: parsed.data.dxyBias ?? null,
              smtNotes: parsed.data.smtNotes ?? null,
              sessionPlan: parsed.data.sessionPlan ?? null,
              keyLevels: parsed.data.keyLevels ? JSON.stringify(parsed.data.keyLevels) : null,
              updatedAt: now,
            })
            .where(eq(schema.sessions.id, existing.id))
            .run()
        }
        const updated = db.select().from(schema.sessions).where(eq(schema.sessions.id, existing.id)).get()!
        return { ok: true, data: mapRow(updated) }
      }

      const now = Date.now()
      const id = uuidv7()
      db.insert(schema.sessions)
        .values({
          id,
          accountId: parsed.data.accountId,
          sessionDate: today,
          dailyBias: parsed.data.dailyBias,
          dailyBiasReason: parsed.data.dailyBiasReason,
          h4Bias: parsed.data.h4Bias,
          h4BiasReason: parsed.data.h4BiasReason,
          h1Bias: parsed.data.h1Bias,
          h1BiasReason: parsed.data.h1BiasReason,
          htfLiquidityTarget: parsed.data.htfLiquidityTarget ?? null,
          dxyBias: parsed.data.dxyBias ?? null,
          smtNotes: parsed.data.smtNotes ?? null,
          sessionPlan: parsed.data.sessionPlan ?? null,
          keyLevels: parsed.data.keyLevels ? JSON.stringify(parsed.data.keyLevels) : null,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const row = db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get()!
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('sessions:lock', (_e, raw: { sessionId: string }): IpcResponse<Session> => {
    try {
      const db = getDb()
      const now = Date.now()
      db.update(schema.sessions)
        .set({ lockedAt: now, updatedAt: now })
        .where(eq(schema.sessions.id, raw.sessionId))
        .run()
      const row = db.select().from(schema.sessions).where(eq(schema.sessions.id, raw.sessionId)).get()
      if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Session not found' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
