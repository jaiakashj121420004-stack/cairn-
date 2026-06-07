/**
 * Import deduplication against the local trades table.
 * Shared by all import adapters.
 */

import { inArray } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import type { ExistingTrade } from './committer'
import type { CairnDb } from '../../../db/index'

/**
 * Return the set of external_refs from `externalRefs` that already exist in
 * the trades table. Uses a batched IN query; returns an empty Set for an
 * empty input list.
 *
 * Used by the import *preview* (a present ref = already in the journal). The
 * *commit* path uses {@link findExistingTrades} instead, because it must tell a
 * still-live row (reconcile) apart from an already-settled one (skip) — spec §6.
 */
export function findExistingRefs(db: CairnDb, externalRefs: string[]): Set<string> {
  if (externalRefs.length === 0) return new Set()

  const rows = db
    .select({ externalRef: schema.trades.externalRef })
    .from(schema.trades)
    .where(inArray(schema.trades.externalRef, externalRefs))
    .all()

  return new Set(rows.map((r) => r.externalRef).filter((r): r is string => r !== null))
}

/**
 * Map every external_ref in `externalRefs` that exists in the trades table to its
 * {@link ExistingTrade} (id + settled marker + status). Drives the commit-time
 * reconcile/skip decision (docs/broker-integration.md §6). Empty input → empty Map.
 */
export function findExistingTrades(
  db: CairnDb,
  externalRefs: string[],
): Map<string, ExistingTrade> {
  const map = new Map<string, ExistingTrade>()
  if (externalRefs.length === 0) return map

  const rows = db
    .select({
      id: schema.trades.id,
      externalRef: schema.trades.externalRef,
      importedAt: schema.trades.importedAt,
      status: schema.trades.status,
    })
    .from(schema.trades)
    .where(inArray(schema.trades.externalRef, externalRefs))
    .all()

  for (const r of rows) {
    if (r.externalRef === null) continue
    map.set(r.externalRef, { id: r.id, importedAt: r.importedAt ?? null, status: r.status })
  }
  return map
}
