import { eq } from 'drizzle-orm'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import { commitWithReconcile } from '../services/import-adapters/_shared/committer'
import { findExistingRefs, findExistingTrades } from '../services/import-adapters/_shared/deduper'
import { buildSymbolMap, resolvePairIds } from '../services/import-adapters/_shared/symbol-resolver'
import { parseCTraderHtml } from '../services/import-adapters/ctrader/parser'
import { reconcilePositions } from '../services/import-adapters/ctrader/reconciler'
import { parseMt5Html } from '../services/import-adapters/mt5/parser'
import { reconcileDeals } from '../services/import-adapters/mt5/reconciler'
import { parseTradingViewCsv } from '../services/import-adapters/tradingview/parser'
import { reconcileTvTrades } from '../services/import-adapters/tradingview/reconciler'
import type { IpcResponse, ImportPreview, ImportCommitResult } from '../../shared/types/index'

// ─── Shared Zod schemas ───────────────────────────────────────────────────────

const PreviewSchema = z.object({
  html: z.string().min(1),
  accountId: z.string().uuid(),
})

const CommitSchema = z.object({
  html: z.string().min(1),
  accountId: z.string().uuid(),
  symbolMap: z.record(z.string(), z.string().uuid()),
  defaultSetupId: z.string().uuid(),
})

const TvPreviewSchema = z.object({
  csv: z.string().min(1),
  accountId: z.string().uuid(),
})

const TvCommitSchema = z.object({
  csv: z.string().min(1),
  accountId: z.string().uuid(),
  symbolMap: z.record(z.string(), z.string().uuid()),
  defaultSetupId: z.string().uuid(),
})

// ─── Shared orchestration helpers ─────────────────────────────────────────────

/** Load pairs + build the auto-resolution map. */
function loadPairs(db: ReturnType<typeof getDb>) {
  return db
    .select({
      id: schema.pairs.id,
      symbol: schema.pairs.symbol,
      pipDecimal: schema.pairs.pipDecimal,
      pipValuePerStandardLotCents: schema.pairs.pipValuePerStandardLotCents,
    })
    .from(schema.pairs)
    .all()
}

/** Validate that a setup and account both exist; return account detail. */
function validateCommitEntities(
  db: ReturnType<typeof getDb>,
  setupId: string,
  accountId: string,
):
  | { ok: false; error: { code: string; message: string } }
  | { ok: true; account: { id: string; accountSizeCents: number } } {
  const setup = db
    .select({ id: schema.setups.id })
    .from(schema.setups)
    .where(eq(schema.setups.id, setupId))
    .get()
  if (!setup) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `Setup not found: ${setupId}` } }
  }

  const account = db
    .select({
      id: schema.accounts.id,
      accountSizeCents: schema.accounts.accountSizeCents,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .get()
  if (!account) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `Account not found: ${accountId}` } }
  }

  return { ok: true, account }
}

// ─── IPC handler registration ─────────────────────────────────────────────────

export function registerImportHandlers(): void {
  // ── import:previewMt5 ─────────────────────────────────────────────────────
  ipcMain.handle('import:previewMt5', (_e, raw: unknown): IpcResponse<ImportPreview> => {
    const parsed = PreviewSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }

    const { html } = parsed.data
    const db = getDb()

    const parseResult = parseMt5Html(html)
    const candidates = reconcileDeals(parseResult.deals, parseResult.orders)

    const pairs = loadPairs(db)
    const autoMap = buildSymbolMap(pairs)
    const { resolved, unresolved } = resolvePairIds(candidates, autoMap, {})

    const resolvedWithPair = resolved.filter((c) => c.pairId !== null)
    const existingSet = findExistingRefs(
      db,
      resolvedWithPair.map((c) => c.externalRef),
    )
    const skippedCount = resolvedWithPair.filter((c) => existingSet.has(c.externalRef)).length
    const newCandidates = resolvedWithPair.filter((c) => !existingSet.has(c.externalRef))

    return {
      ok: true,
      data: {
        candidates: newCandidates,
        skippedCount,
        unresolvedSymbols: unresolved,
        parseErrors: parseResult.errors,
      },
    }
  })

  // ── import:commitMt5 ──────────────────────────────────────────────────────
  ipcMain.handle('import:commitMt5', (_e, raw: unknown): IpcResponse<ImportCommitResult> => {
    const parsed = CommitSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }

    const { html, accountId, symbolMap: userSymbolMap, defaultSetupId } = parsed.data
    const db = getDb()

    const validation = validateCommitEntities(db, defaultSetupId, accountId)
    if (!validation.ok) return { ok: false, error: validation.error }
    const { account } = validation

    const parseResult = parseMt5Html(html)
    const candidates = reconcileDeals(parseResult.deals, parseResult.orders)

    const pairs = loadPairs(db)
    const autoMap = buildSymbolMap(pairs)
    const mergedMap = new Map(autoMap)
    for (const [sym, id] of Object.entries(userSymbolMap)) {
      mergedMap.set(sym.toUpperCase(), id)
    }
    const pairDetailMap = new Map(pairs.map((p) => [p.id, p]))

    const { resolved, unresolved } = resolvePairIds(candidates, mergedMap, {})
    if (unresolved.length > 0) {
      return {
        ok: false,
        error: {
          code: 'UNRESOLVED_SYMBOLS',
          message: `Cannot commit: unresolved symbols: ${unresolved.join(', ')}`,
          details: { unresolvedSymbols: unresolved },
        },
      }
    }

    // Live-streamed rows (imported_at null) are reconciled in place — the settled
    // statement wins monetary fields, the live stream keeps timing (spec §6); a
    // re-imported statement is skipped. commitWithReconcile routes all three.
    const existing = findExistingTrades(
      db,
      resolved.map((c) => c.externalRef),
    )
    const result = commitWithReconcile(
      db,
      resolved,
      existing,
      { accountId, defaultSetupId, brokerSource: 'mt5', nowMs: Date.now() },
      pairDetailMap,
      account,
    )
    return { ok: true, data: result }
  })

  // ── import:previewCtrader ────────────────────────────────────────────────
  ipcMain.handle('import:previewCtrader', (_e, raw: unknown): IpcResponse<ImportPreview> => {
    const parsed = PreviewSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }

    const { html } = parsed.data
    const db = getDb()

    const parseResult = parseCTraderHtml(html)
    const candidates = reconcilePositions(parseResult.closedPositions, parseResult.openPositions)

    const pairs = loadPairs(db)
    const autoMap = buildSymbolMap(pairs)
    const { resolved, unresolved } = resolvePairIds(candidates, autoMap, {})

    const resolvedWithPair = resolved.filter((c) => c.pairId !== null)
    const existingSet = findExistingRefs(
      db,
      resolvedWithPair.map((c) => c.externalRef),
    )
    const skippedCount = resolvedWithPair.filter((c) => existingSet.has(c.externalRef)).length
    const newCandidates = resolvedWithPair.filter((c) => !existingSet.has(c.externalRef))

    return {
      ok: true,
      data: {
        candidates: newCandidates,
        skippedCount,
        unresolvedSymbols: unresolved,
        parseErrors: parseResult.errors,
      },
    }
  })

  // ── import:commitCtrader ─────────────────────────────────────────────────
  ipcMain.handle('import:commitCtrader', (_e, raw: unknown): IpcResponse<ImportCommitResult> => {
    const parsed = CommitSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }

    const { html, accountId, symbolMap: userSymbolMap, defaultSetupId } = parsed.data
    const db = getDb()

    const validation = validateCommitEntities(db, defaultSetupId, accountId)
    if (!validation.ok) return { ok: false, error: validation.error }
    const { account } = validation

    const parseResult = parseCTraderHtml(html)
    const candidates = reconcilePositions(parseResult.closedPositions, parseResult.openPositions)

    const pairs = loadPairs(db)
    const autoMap = buildSymbolMap(pairs)
    const mergedMap = new Map(autoMap)
    for (const [sym, id] of Object.entries(userSymbolMap)) {
      mergedMap.set(sym.toUpperCase(), id)
    }
    const pairDetailMap = new Map(pairs.map((p) => [p.id, p]))

    const { resolved, unresolved } = resolvePairIds(candidates, mergedMap, {})
    if (unresolved.length > 0) {
      return {
        ok: false,
        error: {
          code: 'UNRESOLVED_SYMBOLS',
          message: `Cannot commit: unresolved symbols: ${unresolved.join(', ')}`,
          details: { unresolvedSymbols: unresolved },
        },
      }
    }

    const existing = findExistingTrades(
      db,
      resolved.map((c) => c.externalRef),
    )
    const result = commitWithReconcile(
      db,
      resolved,
      existing,
      { accountId, defaultSetupId, brokerSource: 'ctrader', nowMs: Date.now() },
      pairDetailMap,
      account,
    )
    return { ok: true, data: result }
  })

  // ── import:previewTradingView ─────────────────────────────────────────────
  ipcMain.handle('import:previewTradingView', (_e, raw: unknown): IpcResponse<ImportPreview> => {
    const parsed = TvPreviewSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }

    const { csv } = parsed.data
    const db = getDb()

    const parseResult = parseTradingViewCsv(csv)
    const candidates = reconcileTvTrades(parseResult.rows)

    const pairs = loadPairs(db)
    const autoMap = buildSymbolMap(pairs)
    const { resolved, unresolved } = resolvePairIds(candidates, autoMap, {})

    const resolvedWithPair = resolved.filter((c) => c.pairId !== null)
    const existingSet = findExistingRefs(
      db,
      resolvedWithPair.map((c) => c.externalRef),
    )
    const skippedCount = resolvedWithPair.filter((c) => existingSet.has(c.externalRef)).length
    const newCandidates = resolvedWithPair.filter((c) => !existingSet.has(c.externalRef))

    return {
      ok: true,
      data: {
        candidates: newCandidates,
        skippedCount,
        unresolvedSymbols: unresolved,
        parseErrors: parseResult.errors,
      },
    }
  })

  // ── import:commitTradingView ──────────────────────────────────────────────
  ipcMain.handle(
    'import:commitTradingView',
    (_e, raw: unknown): IpcResponse<ImportCommitResult> => {
      const parsed = TvCommitSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }

      const { csv, accountId, symbolMap: userSymbolMap, defaultSetupId } = parsed.data
      const db = getDb()

      const validation = validateCommitEntities(db, defaultSetupId, accountId)
      if (!validation.ok) return { ok: false, error: validation.error }
      const { account } = validation

      const parseResult = parseTradingViewCsv(csv)
      const candidates = reconcileTvTrades(parseResult.rows)

      const pairs = loadPairs(db)
      const autoMap = buildSymbolMap(pairs)
      const mergedMap = new Map(autoMap)
      for (const [sym, id] of Object.entries(userSymbolMap)) {
        mergedMap.set(sym.toUpperCase(), id)
      }
      const pairDetailMap = new Map(pairs.map((p) => [p.id, p]))

      const { resolved, unresolved } = resolvePairIds(candidates, mergedMap, {})
      if (unresolved.length > 0) {
        return {
          ok: false,
          error: {
            code: 'UNRESOLVED_SYMBOLS',
            message: `Cannot commit: unresolved symbols: ${unresolved.join(', ')}`,
            details: { unresolvedSymbols: unresolved },
          },
        }
      }

      const existing = findExistingTrades(
        db,
        resolved.map((c) => c.externalRef),
      )
      const result = commitWithReconcile(
        db,
        resolved,
        existing,
        { accountId, defaultSetupId, brokerSource: 'tradingview', nowMs: Date.now() },
        pairDetailMap,
        account,
      )
      return { ok: true, data: result }
    },
  )
}
