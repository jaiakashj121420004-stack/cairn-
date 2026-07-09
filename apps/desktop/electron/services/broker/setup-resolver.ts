/**
 * Default-setup resolution for a broker-captured trade (docs/broker-integration.md §6).
 *
 * A live fill carries no setup — the trader refines it at reflection time — so
 * `services/broker/index.ts#resolveAccount` needs SOME active setup to file the
 * trade under the moment it is captured. This module is pure DB logic (no
 * Electron, no logging) so it is directly unit-testable; `index.ts` is the only
 * caller and owns the one log line when the fallback setup is created.
 *
 * Guardrail this module exists to close: a mapped fill (a real, deliberate
 * account binding) must NEVER be dropped just because the setup catalogue is
 * empty. "Unclassified" is the always-succeeding fallback.
 */

import { desc, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../db/schema'
import type { CairnDb } from '../../db/index'

/** Name of the system-generated fallback setup. Matched by name — the `setups`
 *  table has no boolean "system-generated" flag (see schema.ts), so the name
 *  itself (plus the category/description set on creation) is the signal. */
export const UNCLASSIFIED_SETUP_NAME = 'Unclassified'

/** The first active setup by display order, or null if none exists. */
export function firstActiveSetupId(db: CairnDb): string | null {
  const row = db
    .select({ id: schema.setups.id })
    .from(schema.setups)
    .where(eq(schema.setups.active, 1))
    .orderBy(schema.setups.displayOrder)
    .get()
  return row?.id ?? null
}

export interface UnclassifiedSetupResult {
  readonly id: string
  /** True when this call created the row or reactivated an archived one — the
   *  caller logs a warning exactly once per occurrence. */
  readonly changed: boolean
}

/**
 * Find, reactivate, or create the system "Unclassified" setup. Matched by name
 * only (not `active = 1`): if the trader archived it earlier, this reactivates
 * the SAME row rather than creating a second "Unclassified" setup. Idempotent —
 * a call with nothing to do returns the existing row with `changed: false`.
 */
export function getOrCreateUnclassifiedSetup(
  db: CairnDb,
  nowMs: number = Date.now(),
): UnclassifiedSetupResult {
  const existing = db
    .select({ id: schema.setups.id, active: schema.setups.active })
    .from(schema.setups)
    .where(eq(schema.setups.name, UNCLASSIFIED_SETUP_NAME))
    .get()

  if (existing) {
    if (existing.active !== 1) {
      db.update(schema.setups)
        .set({ active: 1, updatedAt: nowMs })
        .where(eq(schema.setups.id, existing.id))
        .run()
      return { id: existing.id, changed: true }
    }
    return { id: existing.id, changed: false }
  }

  const id = uuidv7()
  const maxOrderRow = db
    .select({ displayOrder: schema.setups.displayOrder })
    .from(schema.setups)
    .orderBy(desc(schema.setups.displayOrder))
    .get()

  db.insert(schema.setups)
    .values({
      id,
      name: UNCLASSIFIED_SETUP_NAME,
      category: 'system',
      description:
        'Auto-created so broker fills are never dropped for want of a setup. Re-tag trades once reviewed.',
      color: '#6B7280',
      active: 1,
      displayOrder: (maxOrderRow?.displayOrder ?? 0) + 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    })
    .run()
  return { id, changed: true }
}

/**
 * The setup id a broker fill should file under: the first active setup, or
 * the system "Unclassified" fallback when none exists. Never null — a mapped
 * fill (a deliberate account binding) is never dropped for want of a setup.
 * `log`, if supplied, receives one message only when the fallback path
 * actually creates/reactivates a row (not on every fill).
 */
export function resolveDefaultSetupId(db: CairnDb, log?: (message: string) => void): string {
  const active = firstActiveSetupId(db)
  if (active) return active

  const result = getOrCreateUnclassifiedSetup(db)
  if (result.changed) {
    log?.(
      '[broker] "Unclassified" setup created/reactivated — no active setup existed to file a fill under',
    )
  }
  return result.id
}
