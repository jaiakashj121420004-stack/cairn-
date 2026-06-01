/**
 * Per-playbook expectancy analytics.
 *
 * For each playbook, filters the trades table by the playbook's criteria
 * (setup + pair + killzone) and computes n / win-rate / expectancy-R.
 * Only playbooks that have at least 1 matching closed trade are returned.
 *
 * Design note: trades don't carry a playbook_id FK (the spec doesn't add one).
 * Instead we match by criteria, which also captures trades placed before the
 * playbook was created — more analytically useful for historical comparison.
 */

import { and, eq, isNull, sql } from 'drizzle-orm'
import { trades } from '../../db/schema'
import type { CairnDb } from '../../db/index'
import type { AnalyticsFilter, PlaybookRow } from '../../../shared/types/index'
import { buildTradeWhereClauses } from './filter'

interface PlaybookSpec {
  id: string
  name: string
  pairId: string | null
  setupId: string
  killzoneId: string | null
}

/**
 * Compute per-playbook stats by matching each playbook's criteria against the
 * closed trades in `filter`. Playbooks with zero matching trades are omitted.
 */
export function getByPlaybook(
  db: CairnDb,
  filter: AnalyticsFilter,
  playbooks: PlaybookSpec[],
): PlaybookRow[] {
  if (playbooks.length === 0) return []

  const baseClauses = buildTradeWhereClauses(filter)
  const result: PlaybookRow[] = []

  for (const pb of playbooks) {
    const clauses = [
      ...baseClauses,
      isNull(trades.deletedAt),
      eq(trades.setupId, pb.setupId),
    ]
    if (pb.pairId)     clauses.push(eq(trades.pairId, pb.pairId))
    if (pb.killzoneId) clauses.push(eq(trades.killzoneId, pb.killzoneId))

    const row = db
      .select({
        n:        sql<number>`COUNT(*)`,
        winCount: sql<number>`SUM(CASE WHEN ${trades.pnlR} > 0 THEN 1 ELSE 0 END)`,
        sumR:     sql<number | null>`SUM(${trades.pnlR})`,
      })
      .from(trades)
      .where(and(...clauses))
      .get()

    const n = Number(row?.n ?? 0)
    if (n === 0) continue

    result.push({
      playbookId:   pb.id,
      playbookName: pb.name,
      n,
      winRateBps:   Math.round((Number(row?.winCount ?? 0) / n) * 10000),
      expectancyR:  Math.round(Number(row?.sumR ?? 0) / n),
    })
  }

  return result
}
