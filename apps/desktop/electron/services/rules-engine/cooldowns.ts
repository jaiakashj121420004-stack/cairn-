import { eq, and, isNull } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../db/schema'
import type { CooldownRecord } from './types'
import type { CooldownReason } from '../../../shared/types/index'
import type { CairnDb } from '../../db/index'

export function listActiveCooldowns(db: CairnDb, accountId: string, now: number): CooldownRecord[] {
  const rows = db
    .select()
    .from(schema.cooldowns)
    .where(and(eq(schema.cooldowns.accountId, accountId), isNull(schema.cooldowns.clearedAt)))
    .all()
  return rows.map(mapRow).filter((c) => c.expiresAt > now || c.clearedAt === null)
}

export function insertCooldown(
  db: CairnDb,
  accountId: string,
  reason: CooldownReason,
  durationMs: number,
  now: number,
): CooldownRecord {
  const id = uuidv7()
  const expiresAt = now + durationMs
  db.insert(schema.cooldowns)
    .values({
      id,
      accountId,
      reason,
      startedAt: now,
      expiresAt,
      clearedAt: null,
      clearedBy: null,
      acknowledgmentText: null,
    })
    .run()
  return {
    id,
    accountId,
    reason,
    startedAt: now,
    expiresAt,
    clearedAt: null,
    clearedBy: null,
    acknowledgmentText: null,
  }
}

export function clearCooldownById(
  db: CairnDb,
  id: string,
  ack: string,
  now: number,
): { ok: true } | { ok: false; reason: string } {
  const row = db.select().from(schema.cooldowns).where(eq(schema.cooldowns.id, id)).get()
  if (!row) return { ok: false, reason: 'not_found' }
  if (row.clearedAt !== null) return { ok: false, reason: 'already_cleared' }
  const timerExpired = row.expiresAt <= now
  const ackRequired = 'I am trading my plan, not my emotions'
  const ackValid = ack === ackRequired
  if (!timerExpired && !ackValid) return { ok: false, reason: 'not_expired' }
  db.update(schema.cooldowns)
    .set({
      clearedAt: now,
      clearedBy: timerExpired ? 'timer' : 'user_acknowledgment',
      acknowledgmentText: ackValid ? ack : null,
    })
    .where(eq(schema.cooldowns.id, id))
    .run()
  return { ok: true }
}

export function recoverStaleLocks(db: CairnDb, now: number): number {
  const stale = db
    .select()
    .from(schema.cooldowns)
    .where(isNull(schema.cooldowns.clearedAt))
    .all()
    .filter((r) => r.expiresAt <= now)
  for (const s of stale) {
    db.update(schema.cooldowns)
      .set({ clearedAt: now, clearedBy: 'timer' })
      .where(eq(schema.cooldowns.id, s.id))
      .run()
  }
  return stale.length
}

function mapRow(row: typeof schema.cooldowns.$inferSelect): CooldownRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    reason: row.reason as CooldownReason,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    clearedAt: row.clearedAt,
    clearedBy: row.clearedBy as CooldownRecord['clearedBy'],
    acknowledgmentText: row.acknowledgmentText,
  }
}
