/**
 * Shared DB commit logic for all broker import adapters.
 *
 * Writes a list of fully-resolved ImportCandidates (all pairIds non-null)
 * into the trades + trade_partials tables inside a single transaction.
 * Called by every `import:commit*` IPC handler after parse → reconcile →
 * resolve → dedupe.
 */

import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../../db/schema'
import { computeMaeMfe } from '../../mae-mfe'
import {
  encodePrice,
  encodeLots,
  encodeCents,
  calcSlTenths,
  calcRR,
  calcRiskCents,
} from './encoder'
import type { ImportCandidate, ImportCommitResult } from '../../../../shared/types/index'
import type { CairnDb } from '../../../db/index'

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
}

/**
 * Write all candidates to the DB in a single transaction.
 *
 * Preconditions (caller is responsible):
 *   - Every candidate has `pairId !== null`.
 *   - Every pairId exists in `pairDetailMap`.
 *   - Duplicate external_refs have been filtered out.
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

  db.transaction(() => {
    for (const c of candidates) {
      if (!c.pairId) continue // type guard — caller guarantees this won't fire

      const pair = pairDetailMap.get(c.pairId)
      if (!pair) continue // unknown pairId — should not happen

      const tradeId = uuidv7()
      const lotSizeInt = encodeLots(c.volumeLots)
      const entryTick = encodePrice(c.entryPrice, pair.pipDecimal)

      const slTick = c.stopLoss ? encodePrice(c.stopLoss, pair.pipDecimal) : entryTick
      const tpTick = c.takeProfit ? encodePrice(c.takeProfit, pair.pipDecimal) : entryTick
      const slTenths = calcSlTenths(entryTick, slTick)
      const tpTenths = Math.abs(tpTick - entryTick)
      const rrRatio = calcRR(slTenths, tpTenths)
      const riskCents = calcRiskCents(slTenths, lotSizeInt, pair.pipValuePerStandardLotCents)

      const exitTick = c.exitPrice ? encodePrice(c.exitPrice, pair.pipDecimal) : null
      const grossPnlCents = encodeCents(c.pnlAmount)
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

      db.insert(schema.trades)
        .values({
          id: tradeId,
          accountId: options.accountId,
          sessionId: null,
          pairId: c.pairId,
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
            account.accountSizeCents > 0
              ? Math.round((riskCents * 10000) / account.accountSizeCents)
              : 0,
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
          screenshotPath: null,
          openedAt: c.entryTime,
          brokerSource: options.brokerSource,
          brokerTradeId: c.brokerTradeId,
          importedAt: options.nowMs,
          externalRef: c.externalRef,
          createdAt: options.nowMs,
          updatedAt: options.nowMs,
          deletedAt: null,
        })
        .run()

      importedCount++

      // Partial exits
      for (const partial of c.partialExits) {
        const partialTick = encodePrice(partial.exitPrice, pair.pipDecimal)
        const partialLots = encodeLots(partial.volumeLots)
        const partialCents = encodeCents(partial.pnlAmount)
        const partialDiff =
          c.direction === 'long' ? partialTick - entryTick : entryTick - partialTick
        const partialPnlR = slTenths > 0 ? Math.round((partialDiff * 100) / slTenths) : null

        const totalLots = encodeLots(c.volumeLots)
        const pctBps = totalLots > 0 ? Math.round((partialLots * 10000) / totalLots) : 0

        db.insert(schema.tradePartials)
          .values({
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
          })
          .run()

        partialsCount++
      }
    }
  })

  return { imported: importedCount, partials: partialsCount, skipped: 0 }
}
