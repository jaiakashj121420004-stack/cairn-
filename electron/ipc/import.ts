import { ipcMain } from 'electron'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import { parseMt5Html } from '../services/import-adapters/mt5/parser'
import { reconcileDeals } from '../services/import-adapters/mt5/reconciler'
import type {
  IpcResponse,
  Mt5ImportPreview,
  Mt5CommitResult,
  Mt5TradeCandidate,
} from '../../shared/types/index'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const PreviewSchema = z.object({
  html:       z.string().min(1),
  accountId:  z.string().uuid(),
})

const CommitSchema = z.object({
  html:           z.string().min(1),
  accountId:      z.string().uuid(),
  symbolMap:      z.record(z.string(), z.string().uuid()),
  defaultSetupId: z.string().uuid(),
})

// ─── Price / lot encoding helpers ─────────────────────────────────────────────

/** Price float string → integer tick (Math.round(price × 10^(pipDecimal+1))). */
function encodePrice(priceStr: string, pipDecimal: number): number {
  const p = parseFloat(priceStr)
  return Number.isFinite(p) ? Math.round(p * Math.pow(10, pipDecimal + 1)) : 0
}

/** Lots float string → integer (lots × 100). */
function encodeLots(lotsStr: string): number {
  const l = parseFloat(lotsStr)
  return Number.isFinite(l) ? Math.round(l * 100) : 0
}

/** Dollar amount string → integer cents (round-half-away-from-zero). */
function encodeCents(amountStr: string): number {
  const a = parseFloat(amountStr)
  if (!Number.isFinite(a)) return 0
  return Math.sign(a) * Math.round(Math.abs(a) * 100)
}

/** Calculate SL pips (stored as pips × 10 = "tenths"). */
function calcSlTenths(entryTick: number, slTick: number): number {
  return Math.abs(entryTick - slTick)
}

/** Calculate RR × 100 from tenths. */
function calcRR(slTenths: number, tpTenths: number): number {
  return slTenths > 0 ? Math.round((tpTenths * 100) / slTenths) : 0
}

/** Calculate risk in cents from lot/pip/sl data. */
function calcRiskCents(
  slTenths: number,
  lotSizeInt: number,
  pipValueCents: number,
): number {
  return slTenths > 0
    ? Math.round((slTenths * lotSizeInt * pipValueCents) / 1000)
    : 0
}

// ─── Symbol resolution ────────────────────────────────────────────────────────

/** Build a symbol → pairId map from the local pairs table (case-insensitive). */
function buildSymbolMap(
  pairs: Array<{ id: string; symbol: string }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of pairs) {
    map.set(p.symbol.toUpperCase(), p.id)
  }
  return map
}

/** Resolve pairId for each candidate; collect unresolved symbols. */
function resolvePairIds(
  candidates: Mt5TradeCandidate[],
  symbolMap: Map<string, string>,
  extraMap: Record<string, string>,
): { resolved: Mt5TradeCandidate[]; unresolved: string[] } {
  const unresolved: string[] = []
  const seen = new Set<string>()

  const resolved = candidates.map((c) => {
    const upper = c.symbol.toUpperCase()
    const pairId = symbolMap.get(upper) ?? extraMap[upper] ?? extraMap[c.symbol] ?? null
    if (!pairId && !seen.has(c.symbol)) {
      unresolved.push(c.symbol)
      seen.add(c.symbol)
    }
    return { ...c, pairId }
  })

  return { resolved, unresolved }
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerImportHandlers(): void {
  // ── import:previewMt5 ─────────────────────────────────────────────────────
  // Parse the HTML, reconcile deals, resolve known symbols, check for
  // duplicates, and return a preview without writing anything to the DB.
  ipcMain.handle('import:previewMt5', (_e, raw: unknown): IpcResponse<Mt5ImportPreview> => {
    const parsed = PreviewSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }

    const { html } = parsed.data
    const db = getDb()

    const parseResult = parseMt5Html(html)
    const candidates  = reconcileDeals(parseResult.deals, parseResult.orders)

    // Load pairs for auto-resolution
    const pairs = db.select({ id: schema.pairs.id, symbol: schema.pairs.symbol })
      .from(schema.pairs).all()
    const autoMap = buildSymbolMap(pairs)
    const { resolved, unresolved } = resolvePairIds(candidates, autoMap, {})

    // Split resolved candidates into those with a matched pairId and those without
    const resolvedWithPair = resolved.filter((c) => c.pairId !== null)

    // Check for duplicates only among resolved candidates (unresolved are never "skipped")
    const externalRefs = resolvedWithPair.map((c) => c.externalRef)
    const existing = externalRefs.length > 0
      ? db.select({ externalRef: schema.trades.externalRef })
          .from(schema.trades)
          .where(inArray(schema.trades.externalRef, externalRefs))
          .all()
          .map((r) => r.externalRef)
          .filter((r): r is string => r !== null)
      : []
    const existingSet = new Set(existing)

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
  // Re-parse the HTML, apply the user-provided symbolMap, skip duplicates,
  // then write all new trades + partials in a single transaction.
  ipcMain.handle('import:commitMt5', (_e, raw: unknown): IpcResponse<Mt5CommitResult> => {
    const parsed = CommitSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }

    const { html, accountId, symbolMap: userSymbolMap, defaultSetupId } = parsed.data
    const db = getDb()

    // Validate that the default setup exists
    const setup = db.select({ id: schema.setups.id })
      .from(schema.setups)
      .where(eq(schema.setups.id, defaultSetupId))
      .get()
    if (!setup) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Setup not found: ${defaultSetupId}` } }
    }

    // Validate that the account exists
    const account = db.select({
      id: schema.accounts.id,
      accountSizeCents: schema.accounts.accountSizeCents,
      leverage: schema.accounts.leverage,
    }).from(schema.accounts).where(eq(schema.accounts.id, accountId)).get()
    if (!account) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Account not found: ${accountId}` } }
    }

    const parseResult = parseMt5Html(html)
    const candidates  = reconcileDeals(parseResult.deals, parseResult.orders)

    // Load pairs
    const pairs = db.select({
      id:                       schema.pairs.id,
      symbol:                   schema.pairs.symbol,
      pipDecimal:               schema.pairs.pipDecimal,
      pipValuePerStandardLotCents: schema.pairs.pipValuePerStandardLotCents,
    }).from(schema.pairs).all()
    const autoMap = buildSymbolMap(pairs)
    const pairDetailMap = new Map(pairs.map((p) => [p.id, p]))

    // Merge auto-resolved symbols + user-provided overrides
    const mergedMap = new Map(autoMap)
    for (const [sym, pairId] of Object.entries(userSymbolMap)) {
      mergedMap.set(sym.toUpperCase(), pairId)
    }

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

    // Check for existing external_refs (dedupe)
    const externalRefs = resolved.map((c) => c.externalRef)
    const existingRefs = externalRefs.length > 0
      ? new Set(
          db.select({ externalRef: schema.trades.externalRef })
            .from(schema.trades)
            .where(inArray(schema.trades.externalRef, externalRefs))
            .all()
            .map((r) => r.externalRef)
            .filter((r): r is string => r !== null),
        )
      : new Set<string>()

    const newCandidates = resolved.filter((c) => !existingRefs.has(c.externalRef))
    const skipped = resolved.length - newCandidates.length

    if (newCandidates.length === 0) {
      return { ok: true, data: { imported: 0, partials: 0, skipped } }
    }

    const nowMs = Date.now()
    let importedCount = 0
    let partialsCount = 0

    // Run all inserts inside a transaction
    db.transaction(() => {
      for (const c of newCandidates) {
        if (!c.pairId) continue  // should not happen after unresolved check

        const pair = pairDetailMap.get(c.pairId)
        if (!pair) continue

        const tradeId = uuidv7()
        const lotSizeInt = encodeLots(c.volumeLots)
        const entryTick  = encodePrice(c.entryPrice, pair.pipDecimal)

        // SL/TP encoding
        const slTick = c.stopLoss ? encodePrice(c.stopLoss, pair.pipDecimal) : entryTick
        const tpTick = c.takeProfit ? encodePrice(c.takeProfit, pair.pipDecimal) : entryTick
        const slTenths  = calcSlTenths(entryTick, slTick)
        const tpTenths  = Math.abs(tpTick - entryTick)
        const rrRatio   = calcRR(slTenths, tpTenths)
        const riskCents = calcRiskCents(slTenths, lotSizeInt, pair.pipValuePerStandardLotCents)

        // Exit fields
        const exitTick   = c.exitPrice ? encodePrice(c.exitPrice, pair.pipDecimal) : null
        const pnlCents   = encodeCents(c.pnlAmount)
        const signedDiff = exitTick !== null
          ? (c.direction === 'long' ? exitTick - entryTick : entryTick - exitTick)
          : null
        const pnlR = signedDiff !== null && slTenths > 0
          ? Math.round((signedDiff * 100) / slTenths)
          : null

        const durationMinutes =
          c.exitTime && c.entryTime
            ? Math.round((c.exitTime - c.entryTime) / 60_000)
            : null

        db.insert(schema.trades).values({
          id:                tradeId,
          accountId,
          sessionId:         null,
          pairId:            c.pairId,
          setupId:           defaultSetupId,
          killzoneId:        null,
          mode:              'live',
          direction:         c.direction,
          status:            c.status === 'closed' ? 'closed' : 'open',
          entryPrice:        entryTick,
          stopLossPrice:     slTick,
          takeProfitPrice:   tpTick,
          slPips:            slTenths,
          rrRatio,
          lotSize:           lotSizeInt,
          riskAmountCents:   riskCents,
          riskPctBps:        account.accountSizeCents > 0
            ? Math.round((riskCents * 10000) / account.accountSizeCents)
            : 0,
          plannedInvalidation: 'Imported trade',
          mssConfirmed:      0,
          htfBiasAligned:    0,
          dxyAligned:        null,
          smtConfirmed:      null,
          correlatedPairUsed: null,
          preCalmScore:      5,
          preUrgencyScore:   5,
          preNeedScore:      5,
          actualEntryPrice:  entryTick,
          actualEntryTime:   c.entryTime,
          exitPrice:         exitTick,
          exitTime:          c.exitTime,
          exitReason:        c.status === 'closed' ? 'manual' : null,
          pnlCents:          c.status === 'closed' ? pnlCents : null,
          pnlR:              c.status === 'closed' ? pnlR : null,
          pnlPctBps:         c.status === 'closed' && account.accountSizeCents > 0
            ? Math.round(((pnlCents ?? 0) * 10000) / account.accountSizeCents)
            : null,
          maePips:           null,
          mfePips:           null,
          durationMinutes,
          followedPlanExactly: null,
          planChangesDescription: null,
          slMoved:           null,
          slMovedReason:     null,
          tpMoved:           null,
          enteredBeforeMss:  null,
          revengeTradeFlag:  null,
          rulesBroken:       null,
          isClean:           null,
          postCalmScore:     null,
          whatIDidRight:     null,
          whatIDidWrong:     null,
          tags:              null,
          screenshotPath:    null,
          openedAt:          c.entryTime,
          brokerSource:      'mt5',
          brokerTradeId:     c.externalRef.replace('mt5_order_', ''),
          importedAt:        nowMs,
          externalRef:       c.externalRef,
          createdAt:         nowMs,
          updatedAt:         nowMs,
          deletedAt:         null,
        }).run()

        importedCount++

        // Insert partial exits
        for (const partial of c.partialExits) {
          const partialExitTick = encodePrice(partial.exitPrice, pair.pipDecimal)
          const partialLots     = encodeLots(partial.volumeLots)
          const partialPnlCents = encodeCents(partial.pnlAmount)
          const partialSignedDiff = c.direction === 'long'
            ? partialExitTick - entryTick
            : entryTick - partialExitTick
          const partialPnlR = slTenths > 0
            ? Math.round((partialSignedDiff * 100) / slTenths)
            : null

          // close_percent_bps: (partialLots / totalLots) × 10000
          const totalLots = encodeLots(c.volumeLots)
          const pctBps = totalLots > 0 ? Math.round((partialLots * 10000) / totalLots) : 0

          db.insert(schema.tradePartials).values({
            id:               uuidv7(),
            tradeId:          tradeId,
            closePercentBps:  pctBps,
            closeLots:        partialLots,
            exitPrice:        partialExitTick,
            exitTime:         partial.exitTime,
            pnlR:             partialPnlR,
            pnlCents:         partialPnlCents,
            notes:            null,
            externalRef:      partial.externalRef,
            createdAt:        nowMs,
          }).run()

          partialsCount++
        }
      }
    })

    return { ok: true, data: { imported: importedCount, partials: partialsCount, skipped } }
  })
}
