import { ipcMain } from 'electron'
import { eq, and, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type { IpcResponse, Trade, CreateTradeInput } from '../../shared/types/index'

function mapRow(row: typeof schema.trades.$inferSelect): Trade {
  return {
    id: row.id,
    accountId: row.accountId,
    sessionId: row.sessionId ?? null,
    pairId: row.pairId,
    setupId: row.setupId,
    killzoneId: row.killzoneId ?? null,
    mode: row.mode as Trade['mode'],
    direction: row.direction as Trade['direction'],
    status: row.status as Trade['status'],
    entryPrice: row.entryPrice,
    stopLossPrice: row.stopLossPrice,
    takeProfitPrice: row.takeProfitPrice,
    slPips: row.slPips,
    rrRatio: row.rrRatio,
    lotSize: row.lotSize,
    riskAmountCents: row.riskAmountCents,
    riskPctBps: row.riskPctBps,
    plannedInvalidation: row.plannedInvalidation,
    mssConfirmed: row.mssConfirmed,
    htfBiasAligned: row.htfBiasAligned,
    dxyAligned: row.dxyAligned ?? null,
    smtConfirmed: row.smtConfirmed ?? null,
    correlatedPairUsed: row.correlatedPairUsed ?? null,
    preCalmScore: row.preCalmScore,
    preUrgencyScore: row.preUrgencyScore,
    preNeedScore: row.preNeedScore,
    isClean: row.isClean ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const CreateTradeSchema = z.object({
  accountId: z.string().uuid(),
  sessionId: z.string().uuid().nullable().optional(),
  pairId: z.string().uuid(),
  setupId: z.string().uuid(),
  killzoneId: z.string().uuid().nullable().optional(),
  mode: z.enum(['live', 'sim', 'backtest']),
  direction: z.enum(['long', 'short']),
  status: z.enum(['planned', 'open', 'closed', 'cancelled']),
  entryPrice: z.number().int(),
  stopLossPrice: z.number().int(),
  takeProfitPrice: z.number().int(),
  slPips: z.number().int().nonnegative(),
  rrRatio: z.number().int().nonnegative(),
  lotSize: z.number().int().nonnegative(),
  riskAmountCents: z.number().int().nonnegative(),
  riskPctBps: z.number().int().nonnegative(),
  plannedInvalidation: z.string().min(1),
  mssConfirmed: z.number().int().min(0).max(1),
  htfBiasAligned: z.number().int().min(0).max(1),
  dxyAligned: z.number().int().min(0).max(1).nullable().optional(),
  smtConfirmed: z.number().int().min(0).max(1).nullable().optional(),
  correlatedPairUsed: z.string().max(20).nullable().optional(),
  preCalmScore: z.number().int().min(1).max(10),
  preUrgencyScore: z.number().int().min(1).max(10),
  preNeedScore: z.number().int().min(1).max(10),
})

export function registerTradeHandlers(): void {
  ipcMain.handle('trades:create', (_e, raw: CreateTradeInput): IpcResponse<Trade> => {
    const parsed = CreateTradeSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const now = Date.now()
      const id = uuidv7()
      const d = parsed.data

      let tradeId = id
      db.transaction(() => {
        db.insert(schema.trades)
          .values({
            id,
            accountId: d.accountId,
            sessionId: d.sessionId ?? null,
            pairId: d.pairId,
            setupId: d.setupId,
            killzoneId: d.killzoneId ?? null,
            mode: d.mode,
            direction: d.direction,
            status: d.status,
            entryPrice: d.entryPrice,
            stopLossPrice: d.stopLossPrice,
            takeProfitPrice: d.takeProfitPrice,
            slPips: d.slPips,
            rrRatio: d.rrRatio,
            lotSize: d.lotSize,
            riskAmountCents: d.riskAmountCents,
            riskPctBps: d.riskPctBps,
            plannedInvalidation: d.plannedInvalidation,
            mssConfirmed: d.mssConfirmed,
            htfBiasAligned: d.htfBiasAligned,
            dxyAligned: d.dxyAligned ?? null,
            smtConfirmed: d.smtConfirmed ?? null,
            correlatedPairUsed: d.correlatedPairUsed ?? null,
            preCalmScore: d.preCalmScore,
            preUrgencyScore: d.preUrgencyScore,
            preNeedScore: d.preNeedScore,
            createdAt: now,
            updatedAt: now,
          })
          .run()

        // Lock session on first open trade
        if (d.status === 'open' && d.sessionId) {
          db.update(schema.sessions)
            .set({ lockedAt: now, updatedAt: now })
            .where(
              and(
                eq(schema.sessions.id, d.sessionId),
                isNull(schema.sessions.lockedAt),
              ),
            )
            .run()
        }

        tradeId = id
      })

      const row = db.select().from(schema.trades).where(eq(schema.trades.id, tradeId)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Insert failed' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle(
    'trades:setOpen',
    (_e, raw: { tradeId: string; accountId: string }): IpcResponse<Trade> => {
      try {
        const db = getDb()
        const now = Date.now()

        db.transaction(() => {
          db.update(schema.trades)
            .set({ status: 'open', updatedAt: now })
            .where(eq(schema.trades.id, raw.tradeId))
            .run()

          const trade = db
            .select()
            .from(schema.trades)
            .where(eq(schema.trades.id, raw.tradeId))
            .get()

          if (trade?.sessionId) {
            db.update(schema.sessions)
              .set({ lockedAt: now, updatedAt: now })
              .where(
                and(
                  eq(schema.sessions.id, trade.sessionId),
                  isNull(schema.sessions.lockedAt),
                ),
              )
              .run()
          }
        })

        const row = db.select().from(schema.trades).where(eq(schema.trades.id, raw.tradeId)).get()
        if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Trade not found' } }
        return { ok: true, data: mapRow(row) }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )
}
