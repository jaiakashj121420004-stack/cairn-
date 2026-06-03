/**
 * Import deduplication against the local trades table.
 * Shared by all import adapters.
 */

import { inArray } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import type { CairnDb } from '../../../db/index'

/**
 * Return the set of external_refs from `externalRefs` that already exist in
 * the trades table. Uses a batched IN query; returns an empty Set for an
 * empty input list.
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
