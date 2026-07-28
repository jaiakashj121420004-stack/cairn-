/**
 * Shared DB commit logic for all broker import adapters.
 *
 * Writes a list of fully-resolved ImportCandidates (all pairIds non-null)
 * into the trades + trade_partials tables inside a single transaction.
 * Called by every `import:commit*` IPC handler after parse → reconcile →
 * resolve → dedupe.
 */

import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../../db/schema'
import { computeMaeMfe } from '../../mae-mfe'
import { calculatePnl } from '../../pnl-calculator'
import { enqueueSyncOp } from '../../sync'
import {
  encodePrice,
  encodeLots,
  encodeCents,
  calcSlTenths,
  calcRR,
  calcRiskCents,
} from './encoder'
import type {
  ImportCandidate,
  ImportCommitResult,
  TradeDirection,
} from '../../../../shared/types/index'
import type { CairnDb } from '../../../db/index'

/**
 * The trade columns the broker's *settled statement* record is authoritative for
 * when a statement import collides on `external_ref` with a row a live stream
 * created first (docs/broker-integration.md §6). The settled statement wins these;
 * the live stream keeps intra-trade timing, SL/TP modification history, partials,
 * and the trader's honesty/reflection. Shared by the import reconciler here (which
 * writes them) and the live-broker ingest (which refuses to clobber them once
 * `imported_at` marks the row settled).
 */
export const STATEMENT_MONETARY_FIELDS = ['pnlCents', 'pnlPctBps', 'pnlR'] as const

export interface PairDetail {
  id: string
  pipDecimal: number
  pipValuePerStandardLotCents: number
}

export interface AccountDetail {
  id: string
  accountSizeCents: number
}

export interface CommitOptions {
  accountId: string
  defaultSetupId: string
  brokerSource: string // e.g. 'mt5' | 'ctrader'
  nowMs: number // caller provides so tests can control it
  /**
   * Phase-2 (deferred reflection) disposition of the written trade.
   *   0 → reflection still owed (lands in the Review-screen queue once closed).
   *   1 → no follow-up; never enters the queue.
   * Omitted → 0, matching the column default (statement imports go to the queue).
   * The live-broker ingest sets this per the auto-log mode
   * (docs/broker-integration.md §3): draft → 0, fully-auto → 1.
   */
  phase2Complete?: 0 | 1
  /**
   * Whether this write is a *settled* statement import. Statement imports carry the
   * broker's realised P&L, so they stamp `imported_at` (the marker that the row's
   * monetary fields are authoritative — docs/broker-integration.md §6). The live
   * ingest passes `false`: a streamed fill carries no settled P&L, so its row stays
   * `imported_at = null` until a statement reconciles it. Omitted → true.
   */
  settledImport?: boolean
}

/** The encoded rows for one candidate, ready to insert or upsert. */
export interface BuiltCandidateRows {
  trade: typeof schema.trades.$inferInsert
  partials: (typeof schema.tradePartials.$inferInsert)[]
}

/**
 * Price-derived $ P&L for one closed leg (the whole trade, or a single partial),
 * using the exact same decimal-safe pip-path formula `pnl-calculator.ts` uses
 * for manually-logged trades (reused here, not re-implemented, so there is one
 * source of truth for "$ from price + lot + pip value" — CLAUDE.md §2.5/§19.5).
 *
 * Used ONLY for live-captured fills (`options.settledImport === false`): a
 * streamed BrokerEvent carries no broker-settled dollar figure (no commission/
 * swap visibility), so this is a same-model estimate from the fill's own
 * prices — not a guess, and not silently 0 while `pnlR` is already correct. A
 * later statement import still wins per `STATEMENT_MONETARY_FIELDS` (§6).
 */
function priceDerivedPnlCents(
  direction: TradeDirection,
  entryTick: number,
  exitTick: number,
  lotSizeInt: number,
  slTenths: number,
  pipValuePerStandardLotCents: number,
  accountSizeCents: number,
): number {
  return calculatePnl({
    direction,
    entryPrice: entryTick,
    exitPrice: exitTick,
    lotSize: lotSizeInt,
    slPips: slTenths,
    pipValuePerStandardLotCents,
    accountSizeCents,
  }).pnlCents
}

/**
 * Encode a single resolved candidate into its trades + trade_partials rows.
 *
 * Pure: no DB access, no side effects, no time read (caller passes `nowMs` via
 * `options` and the `tradeId`). This is the one place broker numbers become
 * integer ticks/lots/cents (CLAUDE.md §2.5) — both the batch importer
 * ({@link commitCandidates}) and the live-broker ingest service drive their
 * writes through it so encoding never forks.
 *
 * Preconditions: `c.pairId === pair.id` (caller resolved + validated the pair).
 */
export function buildCandidateRows(
  c: ImportCandidate,
  tradeId: string,
  pair: PairDetail,
  account: AccountDetail,
  options: CommitOptions,
): BuiltCandidateRows {
  const lotSizeInt = encodeLots(c.volumeLots)
  const entryTick = encodePrice(c.entryPrice, pair.pipDecimal)

  const slTick = c.stopLoss ? encodePrice(c.stopLoss, pair.pipDecimal) : entryTick
  const tpTick = c.takeProfit ? encodePrice(c.takeProfit, pair.pipDecimal) : entryTick
  const slTenths = calcSlTenths(entryTick, slTick)
  const tpTenths = Math.abs(tpTick - entryTick)
  const rrRatio = calcRR(slTenths, tpTenths)
  const riskCents = calcRiskCents(slTenths, lotSizeInt, pair.pipValuePerStandardLotCents)

  const exitTick = c.exitPrice ? encodePrice(c.exitPrice, pair.pipDecimal) : null
  // Live fills carry no settled statement figure (accumulator.ts stubs
  // pnlAmount:'0') — compute it from price data instead of trusting that stub.
  // Statement imports (settledImport true/omitted) keep using the broker's
  // actual settled amount, which also reflects commission/swap this can't see.
  const grossPnlCents =
    exitTick !== null && options.settledImport === false
      ? priceDerivedPnlCents(
          c.direction,
          entryTick,
          exitTick,
          lotSizeInt,
          slTenths,
          pair.pipValuePerStandardLotCents,
          account.accountSizeCents,
        )
      : encodeCents(c.pnlAmount)
  const signedDiff =
    exitTick !== null
      ? c.direction === 'long'
        ? exitTick - entryTick
        : entryTick - exitTick
      : null
  const pnlR =
    signedDiff !== null && slTenths > 0 ? Math.round((signedDiff * 100) / slTenths) : null

  const durationMinutes =
    c.exitTime && c.entryTime ? Math.round((c.exitTime - c.entryTime) / 60_000) : null

  // MAE/MFE — only when the export carried a price series AND a real SL
  // (R is undefined without a stop). encodePrice on a distance yields the
  // same tenths-of-pip unit the mae_pips / mfe_pips columns store, so
  // mae_pips / sl_pips == maeR / 100 stays consistent. No series → null.
  const maeMfe =
    c.priceSeries && c.priceSeries.length > 0 && c.stopLoss
      ? computeMaeMfe({
          entryPrice: c.entryPrice,
          slPrice: c.stopLoss,
          direction: c.direction,
          candles: c.priceSeries,
        })
      : null
  const maePips = maeMfe ? encodePrice(maeMfe.maePriceDistance, pair.pipDecimal) : null
  const mfePips = maeMfe ? encodePrice(maeMfe.mfePriceDistance, pair.pipDecimal) : null

  const trade: typeof schema.trades.$inferInsert = {
    id: tradeId,
    accountId: options.accountId,
    sessionId: null,
    pairId: pair.id,
    setupId: options.defaultSetupId,
    killzoneId: null,
    mode: 'live',
    direction: c.direction,
    status: c.status === 'closed' ? 'closed' : 'open',
    entryPrice: entryTick,
    stopLossPrice: slTick,
    takeProfitPrice: tpTick,
    slPips: slTenths,
    rrRatio,
    lotSize: lotSizeInt,
    riskAmountCents: riskCents,
    riskPctBps:
      account.accountSizeCents > 0 ? Math.round((riskCents * 10000) / account.accountSizeCents) : 0,
    plannedInvalidation: 'Imported trade',
    mssConfirmed: 0,
    htfBiasAligned: 0,
    dxyAligned: null,
    smtConfirmed: null,
    correlatedPairUsed: null,
    preCalmScore: 5,
    preUrgencyScore: 5,
    preNeedScore: 5,
    actualEntryPrice: entryTick,
    actualEntryTime: c.entryTime,
    exitPrice: exitTick,
    exitTime: c.exitTime,
    exitReason: c.status === 'closed' ? 'manual' : null,
    pnlCents: c.status === 'closed' ? grossPnlCents : null,
    pnlR: c.status === 'closed' ? pnlR : null,
    pnlPctBps:
      c.status === 'closed' && account.accountSizeCents > 0
        ? Math.round((grossPnlCents * 10000) / account.accountSizeCents)
        : null,
    maePips: maePips,
    mfePips: mfePips,
    durationMinutes,
    followedPlanExactly: null,
    planChangesDescription: null,
    slMoved: null,
    slMovedReason: null,
    tpMoved: null,
    enteredBeforeMss: null,
    revengeTradeFlag: null,
    rulesBroken: null,
    isClean: null,
    postCalmScore: null,
    whatIDidRight: null,
    whatIDidWrong: null,
    tags: null,
    // Honesty stays unreviewed (null above); only the deferred-reflection
    // disposition is caller-driven. Default 0 = owed (matches column default).
    phase2Complete: options.phase2Complete ?? 0,
    screenshotPath: null,
    openedAt: c.entryTime,
    brokerSource: options.brokerSource,
    brokerTradeId: c.brokerTradeId,
    // Settled marker: statements stamp it, live capture leaves it null (spec §6).
    importedAt: (options.settledImport ?? true) ? options.nowMs : null,
    externalRef: c.externalRef,
    createdAt: options.nowMs,
    updatedAt: options.nowMs,
    deletedAt: null,
  }

  const totalLots = lotSizeInt
  const partials = c.partialExits.map((partial) => {
    const partialTick = encodePrice(partial.exitPrice, pair.pipDecimal)
    const partialLots = encodeLots(partial.volumeLots)
    // Same reasoning as grossPnlCents above: a live partial has no settled
    // statement figure yet, so derive it from price instead of trusting the
    // accumulator's '0' stub.
    const partialCents =
      options.settledImport === false
        ? priceDerivedPnlCents(
            c.direction,
            entryTick,
            partialTick,
            partialLots,
            slTenths,
            pair.pipValuePerStandardLotCents,
            account.accountSizeCents,
          )
        : encodeCents(partial.pnlAmount)
    const partialDiff = c.direction === 'long' ? partialTick - entryTick : entryTick - partialTick
    const partialPnlR = slTenths > 0 ? Math.round((partialDiff * 100) / slTenths) : null
    const pctBps = totalLots > 0 ? Math.round((partialLots * 10000) / totalLots) : 0

    const row: typeof schema.tradePartials.$inferInsert = {
      id: uuidv7(),
      tradeId,
      closePercentBps: pctBps,
      closeLots: partialLots,
      exitPrice: partialTick,
      exitTime: partial.exitTime,
      pnlR: partialPnlR,
      pnlCents: partialCents,
      notes: null,
      externalRef: partial.externalRef,
      createdAt: options.nowMs,
    }
    return row
  })

  return { trade, partials }
}

/**
 * Write all candidates to the DB in a single transaction.
 *
 * Preconditions (caller is responsible):
 *   - Every candidate has `pairId !== null`.
 *   - Every pairId exists in `pairDetailMap`.
 *   - Duplicate external_refs have been filtered out (use {@link partitionCandidates}).
 *   - `defaultSetupId` and `accountId` are validated before calling.
 */
export function commitCandidates(
  db: CairnDb,
  candidates: ImportCandidate[],
  options: CommitOptions,
  pairDetailMap: Map<string, PairDetail>,
  account: AccountDetail,
): ImportCommitResult {
  let importedCount = 0
  let partialsCount = 0
  const written: BuiltCandidateRows[] = []

  db.transaction(() => {
    for (const c of candidates) {
      if (!c.pairId) continue // type guard — caller guarantees this won't fire

      const pair = pairDetailMap.get(c.pairId)
      if (!pair) continue // unknown pairId — should not happen

      const built = buildCandidateRows(c, uuidv7(), pair, account, options)

      db.insert(schema.trades).values(built.trade).run()
      importedCount++

      for (const partial of built.partials) {
        db.insert(schema.tradePartials).values(partial).run()
        partialsCount++
      }
      written.push(built)
    }
  })

  // Sync enqueue (docs/broker-integration.md §7, docs/sync-protocol.md §2.3): every
  // imported row converges to the web app like any manually-logged trade. Done AFTER
  // the commit — enqueueSyncOp opens its own transaction and must not nest in the one
  // above. A no-op until the device is enrolled (CLAUDE.md §2.4).
  for (const { trade, partials } of written) {
    enqueueSyncOp('trades', trade.id, 'upsert', trade)
    for (const partial of partials) enqueueSyncOp('trade_partials', partial.id, 'upsert', partial)
  }

  return { imported: importedCount, partials: partialsCount, skipped: 0 }
}

/** An existing trades row matched by external_ref, for reconciliation routing. */
export interface ExistingTrade {
  id: string
  /** Non-null ⟺ the row's monetary fields already came from a settled statement (spec §6). */
  importedAt: number | null
  status: string
}

/** How each resolved candidate collides with the local trades table (spec §6). */
export interface PartitionedCandidates {
  /** external_ref not in the DB → fresh insert. */
  fresh: ImportCandidate[]
  /** external_ref matches a still-live row (imported_at null) → settle its money. */
  reconcile: ImportCandidate[]
  /** external_ref matches an already-settled row → idempotent skip. */
  skipSettled: ImportCandidate[]
}

/**
 * Split resolved statement candidates by how they collide with existing rows
 * (docs/broker-integration.md §6). A row is "settled" iff `imported_at` is non-null
 * (statements stamp it; live capture leaves it null), so a statement that matches a
 * still-live row reconciles it, while a re-imported statement skips.
 */
export function partitionCandidates(
  resolved: ImportCandidate[],
  existing: Map<string, ExistingTrade>,
): PartitionedCandidates {
  const fresh: ImportCandidate[] = []
  const reconcile: ImportCandidate[] = []
  const skipSettled: ImportCandidate[] = []
  for (const c of resolved) {
    const hit = existing.get(c.externalRef)
    if (!hit) fresh.push(c)
    else if (hit.importedAt === null) reconcile.push(c)
    else skipSettled.push(c)
  }
  return { fresh, reconcile, skipSettled }
}

/** {@link commitCandidates} extended with the count of live rows settled by this statement. */
export interface CommitReconcileResult extends ImportCommitResult {
  reconciled: number
}

/**
 * Settle a single live-streamed row with its statement record (docs/broker-integration.md §6).
 *
 * THE RULE: the broker's settled statement is authoritative for the MONETARY
 * columns ({@link STATEMENT_MONETARY_FIELDS}); the live stream keeps intra-trade
 * timing, SL/TP modification history, its partials, and the trader's
 * honesty/reflection. So we overwrite only the money columns and stamp
 * `imported_at` to mark the row settled — EXCEPT when the live stream never saw the
 * close (the row is still open): then there is no live exit timing to preserve, so
 * the statement also settles status + exit. Partials are deliberately NOT
 * re-inserted (the live stream's partial timing wins), so the trade stays one row
 * with one history.
 */
function reconcileSettledTrade(
  db: CairnDb,
  c: ImportCandidate,
  existing: ExistingTrade,
  pair: PairDetail,
  account: AccountDetail,
  options: CommitOptions,
): void {
  // Reuse the pure encoder so the settled numbers are integer-encoded identically
  // to a fresh insert — no fork (CLAUDE.md §2.5).
  const { trade } = buildCandidateRows(c, existing.id, pair, account, options)

  const set: Partial<typeof schema.trades.$inferInsert> = {
    pnlCents: trade.pnlCents,
    pnlPctBps: trade.pnlPctBps,
    pnlR: trade.pnlR,
    importedAt: options.nowMs,
    updatedAt: options.nowMs,
  }
  if (existing.status !== 'closed') {
    // Live only ever saw it open → no live exit timing to keep; settle it.
    set.status = 'closed'
    set.exitPrice = trade.exitPrice
    set.exitTime = trade.exitTime
    set.exitReason = trade.exitReason
    set.durationMinutes = trade.durationMinutes
  }

  db.update(schema.trades).set(set).where(eq(schema.trades.externalRef, c.externalRef)).run()

  const row = db.select().from(schema.trades).where(eq(schema.trades.id, existing.id)).get()
  if (row) enqueueSyncOp('trades', existing.id, 'upsert', row)
}

/**
 * Commit resolved statement candidates, reconciling any that collide with a
 * live-streamed row (docs/broker-integration.md §6):
 *
 *   - external_ref NOT in DB        → fresh insert ({@link commitCandidates}).
 *   - external_ref in a LIVE row    → {@link reconcileSettledTrade} (statement wins money).
 *   - external_ref in a SETTLED row → skip (idempotent re-import).
 *
 * Preconditions match {@link commitCandidates} except that duplicates are routed
 * here rather than pre-filtered.
 */
export function commitWithReconcile(
  db: CairnDb,
  resolved: ImportCandidate[],
  existing: Map<string, ExistingTrade>,
  options: CommitOptions,
  pairDetailMap: Map<string, PairDetail>,
  account: AccountDetail,
): CommitReconcileResult {
  const { fresh, reconcile, skipSettled } = partitionCandidates(resolved, existing)

  const inserted = commitCandidates(db, fresh, options, pairDetailMap, account)

  let reconciled = 0
  for (const c of reconcile) {
    if (!c.pairId) continue
    const pair = pairDetailMap.get(c.pairId)
    const hit = existing.get(c.externalRef)
    if (!pair || !hit) continue
    reconcileSettledTrade(db, c, hit, pair, account, options)
    reconciled++
  }

  return {
    imported: inserted.imported,
    partials: inserted.partials,
    reconciled,
    skipped: skipSettled.length,
  }
}
