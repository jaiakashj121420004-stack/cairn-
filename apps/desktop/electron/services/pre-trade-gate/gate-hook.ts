/**
 * Pre-trade gate ingest hook (P0.7 slice 2). Bridges a live broker fill to the
 * gate backend: on a `position_opened` event, look up the just-persisted trade by
 * `external_ref` and bind it to a pending gate plan (clean / breach_ack).
 *
 * Safe by construction:
 *   - no-op on any event that isn't a fresh open;
 *   - no-op unless a PENDING plan matches — so backfill/historical/imported fills
 *     (which never have a recent pending plan) are untouched, and FREE users are
 *     untouched because the entitlement gate is enforced upstream at plan creation
 *     (docs/pre-trade-gate-popup.md §3.2), so they never have plans to match.
 *
 * Errors are the caller's to log — this stays free of the Electron logger so it is
 * unit-testable against a sql.js database.
 */
import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { applyGateOutcome } from './gate-outcome'
import { getGateConfig } from './plan-store'
import type { CairnDb } from '../../db/index'
import type { BrokerEvent } from '@cairn/shared-types'

export function maybeApplyGateForFill(db: CairnDb, event: BrokerEvent): void {
  if (event.type !== 'position_opened') return

  const trade = db
    .select({
      id: schema.trades.id,
      accountId: schema.trades.accountId,
      pairId: schema.trades.pairId,
      direction: schema.trades.direction,
      entryPrice: schema.trades.entryPrice,
      actualEntryPrice: schema.trades.actualEntryPrice,
      actualEntryTime: schema.trades.actualEntryTime,
      createdAt: schema.trades.createdAt,
      gateOutcome: schema.trades.gateOutcome,
    })
    .from(schema.trades)
    .where(eq(schema.trades.externalRef, event.brokerTradeId))
    .get()
  if (!trade || trade.gateOutcome != null) return

  const config = getGateConfig(db)
  applyGateOutcome(
    db,
    {
      tradeId: trade.id,
      accountId: trade.accountId,
      pairId: trade.pairId,
      direction: trade.direction,
      entryPriceTicks: trade.actualEntryPrice ?? trade.entryPrice,
      eventTimeMs: trade.actualEntryTime ?? trade.createdAt,
    },
    config.priceTolerancePips,
  )
}
