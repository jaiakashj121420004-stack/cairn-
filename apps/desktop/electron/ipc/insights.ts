import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { ipcMain } from 'electron'
import { v7 as uuidv7 } from 'uuid'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import { runInsights } from '../services/insights/index'
import { getConfiguredTimeZone } from '../services/time/trading-day'
import type { Insight, IpcResponse } from '../../shared/types/index'
import type { ClosedTrade } from '../services/insights/types'

const DISMISS_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function err(e: unknown): IpcResponse<never> {
  return { ok: false, error: { code: 'INSIGHTS_ERROR', message: String(e) } }
}

export function registerInsightsHandlers(): void {
  // ── insights:list ────────────────────────────────────────────────────────────
  ipcMain.handle(
    'insights:list',
    (_e, { accountId }: { accountId: string }): IpcResponse<Insight[]> => {
      try {
        const db = getDb()
        const now = Date.now()

        // 1. Fetch closed, non-deleted trades for this account
        const rows = db
          .select({
            id: schema.trades.id,
            accountId: schema.trades.accountId,
            setupId: schema.trades.setupId,
            setupName: schema.setups.name,
            killzoneId: schema.trades.killzoneId,
            mode: schema.trades.mode,
            pnlR: schema.trades.pnlR,
            pnlCents: schema.trades.pnlCents,
            preUrgencyScore: schema.trades.preUrgencyScore,
            riskPctBps: schema.trades.riskPctBps,
            exitTime: schema.trades.exitTime,
          })
          .from(schema.trades)
          .innerJoin(schema.setups, eq(schema.trades.setupId, schema.setups.id))
          .where(
            and(
              eq(schema.trades.accountId, accountId),
              eq(schema.trades.status, 'closed'),
              isNull(schema.trades.deletedAt),
            ),
          )
          .all()

        const trades: ClosedTrade[] = rows
          .filter((r) => r.exitTime != null)
          .map((r) => ({
            id: r.id,
            accountId: r.accountId,
            setupId: r.setupId,
            setupName: r.setupName,
            killzoneId: r.killzoneId ?? null,
            mode: r.mode as ClosedTrade['mode'],
            pnlR: r.pnlR ?? null,
            pnlCents: r.pnlCents ?? null,
            preUrgencyScore: r.preUrgencyScore,
            riskPctBps: r.riskPctBps,
            exitTime: r.exitTime as number,
          }))

        // 2. Determine account's default risk pct (basis points)
        //    Prefer the configured max_risk_per_trade_pct rule value; fall back to median.
        const riskRule = db
          .select({ value: schema.accountRules.value })
          .from(schema.accountRules)
          .where(
            and(
              eq(schema.accountRules.accountId, accountId),
              eq(schema.accountRules.ruleKey, 'max_risk_per_trade_pct'),
              eq(schema.accountRules.enabled, 1),
            ),
          )
          .get()

        let defaultRiskPctBps = 0
        if (riskRule) {
          const parsed = JSON.parse(riskRule.value) as { pct?: number }
          // Rule stores risk % as a float (e.g. 1.0 for 1%). Convert to bps (×100).
          defaultRiskPctBps = typeof parsed.pct === 'number' ? Math.round(parsed.pct * 100) : 0
        }
        if (defaultRiskPctBps <= 0 && trades.length > 0) {
          // Median of actual riskPctBps values
          const sorted = [...trades].map((t) => t.riskPctBps).sort((a, b) => a - b)
          const mid = Math.floor(sorted.length / 2)
          defaultRiskPctBps =
            sorted.length % 2 === 0
              ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
              : (sorted[mid] ?? 0)
        }

        // 3. Run all heuristics
        const tz = getConfiguredTimeZone(db)
        const all = runInsights(trades, defaultRiskPctBps, tz)

        // 4. Filter dismissed
        const now_ = now
        const dismissed = db
          .select({ insightId: schema.dismissedInsights.insightId })
          .from(schema.dismissedInsights)
          .where(
            and(
              or(
                isNull(schema.dismissedInsights.accountId),
                eq(schema.dismissedInsights.accountId, accountId),
              ),
              gt(schema.dismissedInsights.dismissedUntil, now_),
            ),
          )
          .all()

        const dismissedIds = new Set(dismissed.map((d) => d.insightId))
        const visible = all.filter((i) => !dismissedIds.has(i.id))

        return { ok: true, data: visible }
      } catch (e) {
        return err(e)
      }
    },
  )

  // ── insights:dismiss ──────────────────────────────────────────────────────────
  ipcMain.handle(
    'insights:dismiss',
    (_e, { accountId, insightId }: { accountId: string; insightId: string }): IpcResponse<void> => {
      try {
        const db = getDb()
        const now = Date.now()
        db.insert(schema.dismissedInsights)
          .values({
            id: uuidv7(),
            insightId,
            accountId,
            dismissedUntil: now + DISMISS_MS,
            createdAt: now,
          })
          .run()
        return { ok: true, data: undefined }
      } catch (e) {
        return err(e)
      }
    },
  )
}
