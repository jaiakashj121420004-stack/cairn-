import { ipcMain, app, dialog } from 'electron'
import { eq, and, isNull, gte, lte, desc } from 'drizzle-orm'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type {
  IpcResponse,
  Trade,
  TradeListItem,
  TradeDetail,
  TradeScreenshot,
  CreateTradeInput,
  CloseTradeInput,
  TradeFilter,
} from '../../shared/types/index'

function screenshotsRoot(): string {
  return path.join(app.getPath('userData'), 'cairn', 'screenshots')
}

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
    actualEntryPrice: row.actualEntryPrice ?? null,
    actualEntryTime: row.actualEntryTime ?? null,
    exitPrice: row.exitPrice ?? null,
    exitTime: row.exitTime ?? null,
    exitReason: (row.exitReason ?? null) as Trade['exitReason'],
    pnlCents: row.pnlCents ?? null,
    pnlR: row.pnlR ?? null,
    pnlPctBps: row.pnlPctBps ?? null,
    maePips: row.maePips ?? null,
    mfePips: row.mfePips ?? null,
    durationMinutes: row.durationMinutes ?? null,
    followedPlanExactly: row.followedPlanExactly ?? null,
    planChangesDescription: row.planChangesDescription ?? null,
    slMoved: row.slMoved ?? null,
    slMovedReason: row.slMovedReason ?? null,
    tpMoved: row.tpMoved ?? null,
    enteredBeforeMss: row.enteredBeforeMss ?? null,
    revengeTradeFlag: row.revengeTradeFlag ?? null,
    rulesBroken: row.rulesBroken ?? null,
    isClean: row.isClean ?? null,
    postCalmScore: row.postCalmScore ?? null,
    whatIDidRight: row.whatIDidRight ?? null,
    whatIDidWrong: row.whatIDidWrong ?? null,
    tags: row.tags ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  }
}

function mapScreenshotRow(
  row: typeof schema.tradeScreenshots.$inferSelect,
): TradeScreenshot {
  const absPath = path.join(screenshotsRoot(), row.tradeId, row.filename)
  return {
    id: row.id,
    tradeId: row.tradeId,
    kind: row.kind as TradeScreenshot['kind'],
    filename: row.filename,
    caption: row.caption ?? null,
    createdAt: row.createdAt,
    absolutePath: absPath,
  }
}

const CreateTradeSchema = z.object({
  id: z.string().uuid().optional(), // client-generated for idempotent retries (§13.11 item 12)
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

const CloseTradeSchema = z.object({
  tradeId: z.string().uuid(),
  exitPrice: z.number().int(),
  exitTime: z.number().int().positive(),
  exitReason: z.enum(['tp', 'sl', 'manual', 'be', 'partial_full', 'timeout']),
  maePips: z.number().int().nonnegative().optional(),
  mfePips: z.number().int().nonnegative().optional(),
  followedPlanExactly: z.boolean(),
  planChangesDescription: z.string().optional(),
  slMoved: z.boolean(),
  slMovedReason: z.string().optional(),
  enteredBeforeMss: z.boolean(),
  rulesBroken: z.array(z.string()),
  postCalmScore: z.number().int().min(1).max(10),
  whatIDidRight: z.string().optional(),
  whatIDidWrong: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const TradeFilterSchema = z.object({
  accountId: z.string().uuid(),
  dateFrom: z.number().int().optional(),
  dateTo: z.number().int().optional(),
  pairId: z.string().uuid().optional(),
  setupId: z.string().uuid().optional(),
  killzoneId: z.string().uuid().optional(),
  mode: z.enum(['live', 'sim', 'backtest']).optional(),
  direction: z.enum(['long', 'short']).optional(),
  isClean: z.boolean().optional(),
  status: z.enum(['planned', 'open', 'closed', 'cancelled']).optional(),
})

export function registerTradeHandlers(): void {
  // ── trades:create ────────────────────────────────────────────────────────────
  ipcMain.handle('trades:create', (_e, raw: CreateTradeInput): IpcResponse<Trade> => {
    const parsed = CreateTradeSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const now = Date.now()
      const d = parsed.data
      const id = d.id ?? uuidv7()

      // Idempotency: if client provided an id and the trade already exists, return it (§13.11 item 12)
      if (d.id) {
        const existing = db.select().from(schema.trades).where(eq(schema.trades.id, d.id)).get()
        if (existing) return { ok: true, data: mapRow(existing) }
      }

      // Duplicate prevention: warn if near-identical trade within last 5 min (§13.11 item 7)
      const fiveMinAgo = now - 5 * 60_000
      const nearDup = db
        .select({ id: schema.trades.id })
        .from(schema.trades)
        .where(
          and(
            eq(schema.trades.accountId, d.accountId),
            eq(schema.trades.pairId, d.pairId),
            eq(schema.trades.direction, d.direction),
            isNull(schema.trades.deletedAt),
            gte(schema.trades.createdAt, fiveMinAgo),
          ),
        )
        .get()
      if (nearDup) {
        return {
          ok: false,
          error: {
            code: 'DUPLICATE_TRADE',
            message: 'A trade with the same account, pair, and direction was logged within the last 5 minutes. Check your trade log before proceeding.',
          },
        }
      }

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

        if (d.status === 'open' && d.sessionId) {
          db.update(schema.sessions)
            .set({ lockedAt: now, updatedAt: now })
            .where(
              and(eq(schema.sessions.id, d.sessionId), isNull(schema.sessions.lockedAt)),
            )
            .run()
        }
      })

      const row = db.select().from(schema.trades).where(eq(schema.trades.id, id)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Insert failed' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── trades:setOpen ───────────────────────────────────────────────────────────
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

  // ── trades:close ─────────────────────────────────────────────────────────────
  ipcMain.handle('trades:close', (_e, raw: CloseTradeInput): IpcResponse<Trade> => {
    const parsed = CloseTradeSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const now = Date.now()
      const d = parsed.data

      const trade = db.select().from(schema.trades).where(eq(schema.trades.id, d.tradeId)).get()
      if (!trade) return { ok: false, error: { code: 'NOT_FOUND', message: 'Trade not found' } }
      if (trade.status === 'closed') {
        return { ok: false, error: { code: 'CONFLICT', message: 'Trade already closed' } }
      }

      const pair = db.select().from(schema.pairs).where(eq(schema.pairs.id, trade.pairId)).get()
      if (!pair) return { ok: false, error: { code: 'NOT_FOUND', message: 'Pair not found' } }

      const account = db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, trade.accountId))
        .get()
      if (!account) return { ok: false, error: { code: 'NOT_FOUND', message: 'Account not found' } }

      // P&L calculations (integer arithmetic)
      // signed_pnl_tenths: each unit = 1/10 pip (same encoding as slPips)
      const signedPnlTenths =
        trade.direction === 'long'
          ? d.exitPrice - trade.entryPrice
          : trade.entryPrice - d.exitPrice

      // pnl_cents = signedPnlTenths × lotSize × pipValuePerLotCents / 1000
      const pnlCents = Math.round(
        (signedPnlTenths * trade.lotSize * pair.pipValuePerStandardLotCents) / 1000,
      )
      // pnl_r (×100): R = signed_pnl_pips / sl_pips; both in tenths so ratio is same
      const pnlR = trade.slPips > 0 ? Math.round((signedPnlTenths * 100) / trade.slPips) : 0
      const pnlPctBps = Math.round((pnlCents * 10000) / account.accountSizeCents)
      const durationMinutes = Math.round((d.exitTime - trade.createdAt) / 60000)

      const isLoss = pnlCents < 0
      const isClean =
        d.rulesBroken.length === 0 && d.followedPlanExactly && !d.enteredBeforeMss ? 1 : 0
      const rulesBrokenJson = JSON.stringify(d.rulesBroken)
      const tagsJson = d.tags && d.tags.length > 0 ? JSON.stringify(d.tags) : null

      db.transaction(() => {
        // Update trade
        db.update(schema.trades)
          .set({
            status: 'closed',
            exitPrice: d.exitPrice,
            exitTime: d.exitTime,
            exitReason: d.exitReason,
            pnlCents,
            pnlR,
            pnlPctBps,
            maePips: d.maePips ?? null,
            mfePips: d.mfePips ?? null,
            durationMinutes,
            followedPlanExactly: d.followedPlanExactly ? 1 : 0,
            planChangesDescription: d.planChangesDescription ?? null,
            slMoved: d.slMoved ? 1 : 0,
            slMovedReason: d.slMovedReason ?? null,
            enteredBeforeMss: d.enteredBeforeMss ? 1 : 0,
            rulesBroken: rulesBrokenJson,
            isClean,
            postCalmScore: d.postCalmScore,
            whatIDidRight: d.whatIDidRight ?? null,
            whatIDidWrong: d.whatIDidWrong ?? null,
            tags: tagsJson,
            updatedAt: now,
          })
          .where(eq(schema.trades.id, d.tradeId))
          .run()

        // Update account equity
        const newEquity = account.currentEquityCents + pnlCents
        const newPeak = Math.max(account.peakEquityCents, newEquity)
        db.update(schema.accounts)
          .set({
            currentEquityCents: newEquity,
            peakEquityCents: newPeak,
            updatedAt: now,
          })
          .where(eq(schema.accounts.id, trade.accountId))
          .run()

        // Insert rule violations for each broken rule
        for (const ruleKey of d.rulesBroken) {
          db.insert(schema.ruleViolations)
            .values({
              id: uuidv7(),
              accountId: trade.accountId,
              tradeId: d.tradeId,
              ruleKey,
              severity: 'logged',
              outcome: 'logged_post_hoc',
              contextJson: JSON.stringify({ closedAt: d.exitTime }),
              createdAt: now,
            })
            .run()
        }

        // Cooldown if live loss: check cooldown_after_loss_minutes rule
        if (isLoss && trade.mode === 'live') {
          const cooldownRule = db
            .select()
            .from(schema.accountRules)
            .where(
              and(
                eq(schema.accountRules.accountId, trade.accountId),
                eq(schema.accountRules.ruleKey, 'cooldown_after_loss_minutes'),
              ),
            )
            .get()

          if (cooldownRule && cooldownRule.enabled === 1) {
            const config = JSON.parse(cooldownRule.value) as { minutes?: number }
            const minutes = config.minutes ?? 30
            db.insert(schema.cooldowns)
              .values({
                id: uuidv7(),
                accountId: trade.accountId,
                reason: 'post_loss',
                startedAt: now,
                expiresAt: now + minutes * 60 * 1000,
              })
              .run()
          }
        }
      })

      const row = db.select().from(schema.trades).where(eq(schema.trades.id, d.tradeId)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Close failed' } }
      return { ok: true, data: mapRow(row) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── trades:list ──────────────────────────────────────────────────────────────
  ipcMain.handle('trades:list', (_e, raw: TradeFilter): IpcResponse<TradeListItem[]> => {
    const parsed = TradeFilterSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const d = parsed.data

      // Build conditions array
      const conditions = [
        eq(schema.trades.accountId, d.accountId),
        isNull(schema.trades.deletedAt),
      ]
      if (d.dateFrom !== undefined) conditions.push(gte(schema.trades.createdAt, d.dateFrom))
      if (d.dateTo !== undefined) conditions.push(lte(schema.trades.createdAt, d.dateTo))
      if (d.pairId !== undefined) conditions.push(eq(schema.trades.pairId, d.pairId))
      if (d.setupId !== undefined) conditions.push(eq(schema.trades.setupId, d.setupId))
      if (d.mode !== undefined) conditions.push(eq(schema.trades.mode, d.mode))
      if (d.direction !== undefined) conditions.push(eq(schema.trades.direction, d.direction))
      if (d.status !== undefined) conditions.push(eq(schema.trades.status, d.status))
      if (d.isClean !== undefined)
        conditions.push(eq(schema.trades.isClean, d.isClean ? 1 : 0))

      const rows = db
        .select({
          id: schema.trades.id,
          accountId: schema.trades.accountId,
          sessionId: schema.trades.sessionId,
          pairId: schema.trades.pairId,
          pairSymbol: schema.pairs.symbol,
          pairPipDecimal: schema.pairs.pipDecimal,
          pairPipValuePerLotCents: schema.pairs.pipValuePerStandardLotCents,
          setupId: schema.trades.setupId,
          setupName: schema.setups.name,
          killzoneId: schema.trades.killzoneId,
          killzoneName: schema.killzones.name,
          mode: schema.trades.mode,
          direction: schema.trades.direction,
          status: schema.trades.status,
          entryPrice: schema.trades.entryPrice,
          stopLossPrice: schema.trades.stopLossPrice,
          takeProfitPrice: schema.trades.takeProfitPrice,
          slPips: schema.trades.slPips,
          rrRatio: schema.trades.rrRatio,
          lotSize: schema.trades.lotSize,
          riskAmountCents: schema.trades.riskAmountCents,
          riskPctBps: schema.trades.riskPctBps,
          exitPrice: schema.trades.exitPrice,
          exitTime: schema.trades.exitTime,
          exitReason: schema.trades.exitReason,
          pnlCents: schema.trades.pnlCents,
          pnlR: schema.trades.pnlR,
          pnlPctBps: schema.trades.pnlPctBps,
          durationMinutes: schema.trades.durationMinutes,
          isClean: schema.trades.isClean,
          rulesBroken: schema.trades.rulesBroken,
          tags: schema.trades.tags,
          followedPlanExactly: schema.trades.followedPlanExactly,
          slMoved: schema.trades.slMoved,
          enteredBeforeMss: schema.trades.enteredBeforeMss,
          createdAt: schema.trades.createdAt,
          updatedAt: schema.trades.updatedAt,
        })
        .from(schema.trades)
        .innerJoin(schema.pairs, eq(schema.trades.pairId, schema.pairs.id))
        .innerJoin(schema.setups, eq(schema.trades.setupId, schema.setups.id))
        .leftJoin(schema.killzones, eq(schema.trades.killzoneId, schema.killzones.id))
        .where(and(...conditions))
        .orderBy(desc(schema.trades.createdAt))
        .all()

      const items: TradeListItem[] = rows.map((r) => ({
        id: r.id,
        accountId: r.accountId,
        sessionId: r.sessionId ?? null,
        pairId: r.pairId,
        pairSymbol: r.pairSymbol,
        pairPipDecimal: r.pairPipDecimal,
        pairPipValuePerLotCents: r.pairPipValuePerLotCents,
        setupId: r.setupId,
        setupName: r.setupName,
        killzoneId: r.killzoneId ?? null,
        killzoneName: r.killzoneName ?? null,
        mode: r.mode as TradeListItem['mode'],
        direction: r.direction as TradeListItem['direction'],
        status: r.status as TradeListItem['status'],
        entryPrice: r.entryPrice,
        stopLossPrice: r.stopLossPrice,
        takeProfitPrice: r.takeProfitPrice,
        slPips: r.slPips,
        rrRatio: r.rrRatio,
        lotSize: r.lotSize,
        riskAmountCents: r.riskAmountCents,
        riskPctBps: r.riskPctBps,
        exitPrice: r.exitPrice ?? null,
        exitTime: r.exitTime ?? null,
        exitReason: (r.exitReason ?? null) as TradeListItem['exitReason'],
        pnlCents: r.pnlCents ?? null,
        pnlR: r.pnlR ?? null,
        pnlPctBps: r.pnlPctBps ?? null,
        durationMinutes: r.durationMinutes ?? null,
        isClean: r.isClean ?? null,
        rulesBroken: r.rulesBroken ?? null,
        tags: r.tags ?? null,
        followedPlanExactly: r.followedPlanExactly ?? null,
        slMoved: r.slMoved ?? null,
        enteredBeforeMss: r.enteredBeforeMss ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))

      return { ok: true, data: items }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── trades:get ───────────────────────────────────────────────────────────────
  ipcMain.handle('trades:get', (_e, raw: { tradeId: string }): IpcResponse<TradeDetail> => {
    try {
      const db = getDb()
      const { tradeId } = raw

      const tradeRow = db.select().from(schema.trades).where(eq(schema.trades.id, tradeId)).get()
      if (!tradeRow) return { ok: false, error: { code: 'NOT_FOUND', message: 'Trade not found' } }

      const pair = db.select().from(schema.pairs).where(eq(schema.pairs.id, tradeRow.pairId)).get()
      if (!pair) return { ok: false, error: { code: 'NOT_FOUND', message: 'Pair not found' } }

      const setup = db
        .select()
        .from(schema.setups)
        .where(eq(schema.setups.id, tradeRow.setupId))
        .get()
      if (!setup) return { ok: false, error: { code: 'NOT_FOUND', message: 'Setup not found' } }

      const killzone = tradeRow.killzoneId
        ? db
            .select()
            .from(schema.killzones)
            .where(eq(schema.killzones.id, tradeRow.killzoneId))
            .get()
        : null

      const screenshotRows = db
        .select()
        .from(schema.tradeScreenshots)
        .where(eq(schema.tradeScreenshots.tradeId, tradeId))
        .orderBy(schema.tradeScreenshots.createdAt)
        .all()

      const violations = db
        .select()
        .from(schema.ruleViolations)
        .where(eq(schema.ruleViolations.tradeId, tradeId))
        .all()

      // Related trades: same account, same day (by session_date substring of createdAt)
      const dayStart = new Date(tradeRow.createdAt)
      dayStart.setUTCHours(0, 0, 0, 0)
      const dayEnd = new Date(tradeRow.createdAt)
      dayEnd.setUTCHours(23, 59, 59, 999)

      const relatedRows = db
        .select({
          id: schema.trades.id,
          accountId: schema.trades.accountId,
          sessionId: schema.trades.sessionId,
          pairId: schema.trades.pairId,
          pairSymbol: schema.pairs.symbol,
          pairPipDecimal: schema.pairs.pipDecimal,
          pairPipValuePerLotCents: schema.pairs.pipValuePerStandardLotCents,
          setupId: schema.trades.setupId,
          setupName: schema.setups.name,
          killzoneId: schema.trades.killzoneId,
          killzoneName: schema.killzones.name,
          mode: schema.trades.mode,
          direction: schema.trades.direction,
          status: schema.trades.status,
          entryPrice: schema.trades.entryPrice,
          stopLossPrice: schema.trades.stopLossPrice,
          takeProfitPrice: schema.trades.takeProfitPrice,
          slPips: schema.trades.slPips,
          rrRatio: schema.trades.rrRatio,
          lotSize: schema.trades.lotSize,
          riskAmountCents: schema.trades.riskAmountCents,
          riskPctBps: schema.trades.riskPctBps,
          exitPrice: schema.trades.exitPrice,
          exitTime: schema.trades.exitTime,
          exitReason: schema.trades.exitReason,
          pnlCents: schema.trades.pnlCents,
          pnlR: schema.trades.pnlR,
          pnlPctBps: schema.trades.pnlPctBps,
          durationMinutes: schema.trades.durationMinutes,
          isClean: schema.trades.isClean,
          rulesBroken: schema.trades.rulesBroken,
          tags: schema.trades.tags,
          followedPlanExactly: schema.trades.followedPlanExactly,
          slMoved: schema.trades.slMoved,
          enteredBeforeMss: schema.trades.enteredBeforeMss,
          createdAt: schema.trades.createdAt,
          updatedAt: schema.trades.updatedAt,
        })
        .from(schema.trades)
        .innerJoin(schema.pairs, eq(schema.trades.pairId, schema.pairs.id))
        .innerJoin(schema.setups, eq(schema.trades.setupId, schema.setups.id))
        .leftJoin(schema.killzones, eq(schema.trades.killzoneId, schema.killzones.id))
        .where(
          and(
            eq(schema.trades.accountId, tradeRow.accountId),
            isNull(schema.trades.deletedAt),
            gte(schema.trades.createdAt, dayStart.getTime()),
            lte(schema.trades.createdAt, dayEnd.getTime()),
          ),
        )
        .all()

      const relatedTrades: import('../../shared/types/index').TradeListItem[] = relatedRows
        .filter((r) => r.id !== tradeId)
        .map((r) => ({
          id: r.id,
          accountId: r.accountId,
          sessionId: r.sessionId ?? null,
          pairId: r.pairId,
          pairSymbol: r.pairSymbol,
          pairPipDecimal: r.pairPipDecimal,
          pairPipValuePerLotCents: r.pairPipValuePerLotCents,
          setupId: r.setupId,
          setupName: r.setupName,
          killzoneId: r.killzoneId ?? null,
          killzoneName: r.killzoneName ?? null,
          mode: r.mode as TradeListItem['mode'],
          direction: r.direction as TradeListItem['direction'],
          status: r.status as TradeListItem['status'],
          entryPrice: r.entryPrice,
          stopLossPrice: r.stopLossPrice,
          takeProfitPrice: r.takeProfitPrice,
          slPips: r.slPips,
          rrRatio: r.rrRatio,
          lotSize: r.lotSize,
          riskAmountCents: r.riskAmountCents,
          riskPctBps: r.riskPctBps,
          exitPrice: r.exitPrice ?? null,
          exitTime: r.exitTime ?? null,
          exitReason: (r.exitReason ?? null) as TradeListItem['exitReason'],
          pnlCents: r.pnlCents ?? null,
          pnlR: r.pnlR ?? null,
          pnlPctBps: r.pnlPctBps ?? null,
          durationMinutes: r.durationMinutes ?? null,
          isClean: r.isClean ?? null,
          rulesBroken: r.rulesBroken ?? null,
          tags: r.tags ?? null,
          followedPlanExactly: r.followedPlanExactly ?? null,
          slMoved: r.slMoved ?? null,
          enteredBeforeMss: r.enteredBeforeMss ?? null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }))

      const detail: TradeDetail = {
        ...mapRow(tradeRow),
        pairSymbol: pair.symbol,
        pairPipDecimal: pair.pipDecimal,
        pairPipValuePerLotCents: pair.pipValuePerStandardLotCents,
        setupName: setup.name,
        killzoneName: killzone?.name ?? null,
        screenshots: screenshotRows.map(mapScreenshotRow),
        ruleViolations: violations.map((v) => ({
          id: v.id,
          accountId: v.accountId,
          tradeId: v.tradeId ?? null,
          ruleKey: v.ruleKey,
          severity: v.severity,
          outcome: v.outcome,
          contextJson: v.contextJson,
          createdAt: v.createdAt,
        })),
        relatedTrades,
      }

      return { ok: true, data: detail }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── trades:delete ────────────────────────────────────────────────────────────
  ipcMain.handle('trades:delete', (_e, raw: { tradeId: string }): IpcResponse<{ ok: true }> => {
    try {
      const db = getDb()
      db.update(schema.trades)
        .set({ deletedAt: Date.now(), updatedAt: Date.now() })
        .where(eq(schema.trades.id, raw.tradeId))
        .run()
      return { ok: true, data: { ok: true } }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── trades:addScreenshot ─────────────────────────────────────────────────────
  ipcMain.handle(
    'trades:addScreenshot',
    (
      _e,
      raw: { tradeId: string; kind: string; sourcePath: string; caption?: string },
    ): IpcResponse<TradeScreenshot> => {
      try {
        const db = getDb()
        const { tradeId, kind, sourcePath, caption } = raw

        if (!fs.existsSync(sourcePath)) {
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Source file not found' } }
        }

        const ext = path.extname(sourcePath).toLowerCase() || '.png'
        const filename = `${Date.now()}_${kind}${ext}`
        const tradeDir = path.join(screenshotsRoot(), tradeId)
        fs.mkdirSync(tradeDir, { recursive: true })
        fs.copyFileSync(sourcePath, path.join(tradeDir, filename))

        const now = Date.now()
        const id = uuidv7()
        db.insert(schema.tradeScreenshots)
          .values({
            id,
            tradeId,
            kind,
            filename,
            caption: caption ?? null,
            createdAt: now,
          })
          .run()

        const row = db
          .select()
          .from(schema.tradeScreenshots)
          .where(eq(schema.tradeScreenshots.id, id))
          .get()
        if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Insert failed' } }
        return { ok: true, data: mapScreenshotRow(row) }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  // ── trades:pickScreenshots ───────────────────────────────────────────────────
  ipcMain.handle(
    'trades:pickScreenshots',
    async (_e, raw: { tradeId: string }): Promise<IpcResponse<string[]>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Select Screenshots',
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
          properties: ['openFile', 'multiSelections'],
        })
        if (result.canceled) return { ok: true, data: [] }
        return { ok: true, data: result.filePaths }
      } catch (err) {
        return { ok: false, error: { code: 'DIALOG_ERROR', message: String(err) } }
      }
    },
  )

  // ── trades:listScreenshots ───────────────────────────────────────────────────
  ipcMain.handle(
    'trades:listScreenshots',
    (_e, raw: { tradeId: string }): IpcResponse<TradeScreenshot[]> => {
      try {
        const db = getDb()
        const rows = db
          .select()
          .from(schema.tradeScreenshots)
          .where(eq(schema.tradeScreenshots.tradeId, raw.tradeId))
          .orderBy(schema.tradeScreenshots.createdAt)
          .all()
        return { ok: true, data: rows.map(mapScreenshotRow) }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  // ── trades:deleteScreenshot ──────────────────────────────────────────────────
  ipcMain.handle(
    'trades:deleteScreenshot',
    (_e, raw: { screenshotId: string }): IpcResponse<{ ok: true }> => {
      try {
        const db = getDb()
        const row = db
          .select()
          .from(schema.tradeScreenshots)
          .where(eq(schema.tradeScreenshots.id, raw.screenshotId))
          .get()
        if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Screenshot not found' } }

        const absPath = path.join(screenshotsRoot(), row.tradeId, row.filename)
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath)

        db.delete(schema.tradeScreenshots)
          .where(eq(schema.tradeScreenshots.id, raw.screenshotId))
          .run()
        return { ok: true, data: { ok: true } }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )
}
