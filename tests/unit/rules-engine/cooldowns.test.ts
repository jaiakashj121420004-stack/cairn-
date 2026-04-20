// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import {
  insertCooldown,
  listActiveCooldowns,
  clearCooldownById,
  recoverStaleLocks,
} from '../../../electron/services/rules-engine/cooldowns'
import { ensureSqlJs, createTestDb, schema } from './_db'

const ACK = 'I am trading my plan, not my emotions'

describe('cooldowns service', () => {
  beforeAll(async () => {
    await ensureSqlJs()
  })

  let bundle: ReturnType<typeof createTestDb>
  beforeEach(() => {
    bundle = createTestDb()
  })

  it('insertCooldown writes a row with correct expiry', () => {
    const { db, ids } = bundle
    const now = Date.UTC(2026, 3, 20, 9, 0)
    const cd = insertCooldown(db, ids.accountId, 'post_loss', 30 * 60_000, now)
    expect(cd.expiresAt).toBe(now + 30 * 60_000)
    expect(cd.startedAt).toBe(now)
    expect(cd.clearedAt).toBeNull()
    const row = db.select().from(schema.cooldowns).all()[0]
    expect(row?.reason).toBe('post_loss')
  })

  it('listActiveCooldowns returns uncleared cooldowns', () => {
    const { db, ids } = bundle
    const now = Date.UTC(2026, 3, 20, 9, 0)
    insertCooldown(db, ids.accountId, 'post_loss', 30 * 60_000, now)
    const active = listActiveCooldowns(db, ids.accountId, now + 60_000)
    expect(active.length).toBe(1)
  })

  it('clearCooldownById rejects when ack is wrong AND timer has not expired', () => {
    const { db, ids } = bundle
    const now = Date.UTC(2026, 3, 20, 9, 0)
    const cd = insertCooldown(db, ids.accountId, 'post_loss', 30 * 60_000, now)
    const res = clearCooldownById(db, cd.id, 'wrong ack', now + 60_000)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('not_expired')
  })

  it('clearCooldownById accepts user ack with the exact phrase before timer expiry', () => {
    const { db, ids } = bundle
    const now = Date.UTC(2026, 3, 20, 9, 0)
    const cd = insertCooldown(db, ids.accountId, 'post_loss', 30 * 60_000, now)
    const res = clearCooldownById(db, cd.id, ACK, now + 60_000)
    expect(res.ok).toBe(true)
    const row = db.select().from(schema.cooldowns).all()[0]
    expect(row?.clearedAt).toBe(now + 60_000)
    expect(row?.clearedBy).toBe('user_acknowledgment')
    expect(row?.acknowledgmentText).toBe(ACK)
  })

  it('clearCooldownById marks clearedBy=timer when called after expiry', () => {
    const { db, ids } = bundle
    const now = Date.UTC(2026, 3, 20, 9, 0)
    const cd = insertCooldown(db, ids.accountId, 'post_loss', 30 * 60_000, now)
    const past = now + 31 * 60_000
    const res = clearCooldownById(db, cd.id, '', past)
    expect(res.ok).toBe(true)
    const row = db.select().from(schema.cooldowns).all()[0]
    expect(row?.clearedBy).toBe('timer')
  })

  it('clearCooldownById returns not_found / already_cleared edges', () => {
    const { db, ids } = bundle
    const now = Date.UTC(2026, 3, 20, 9, 0)
    const a = clearCooldownById(db, 'missing', ACK, now)
    expect(a).toEqual({ ok: false, reason: 'not_found' })

    const cd = insertCooldown(db, ids.accountId, 'post_loss', 30 * 60_000, now)
    clearCooldownById(db, cd.id, ACK, now + 60_000)
    const b = clearCooldownById(db, cd.id, ACK, now + 120_000)
    expect(b).toEqual({ ok: false, reason: 'already_cleared' })
  })

  it('recoverStaleLocks closes expired cooldowns and returns the count', () => {
    const { db, ids } = bundle
    const now = Date.UTC(2026, 3, 20, 9, 0)
    insertCooldown(db, ids.accountId, 'post_loss', 30 * 60_000, now)
    insertCooldown(db, ids.accountId, 'manual', 30 * 60_000, now)
    const past = now + 31 * 60_000
    const n = recoverStaleLocks(db, past)
    expect(n).toBe(2)
    const remaining = listActiveCooldowns(db, ids.accountId, past)
    expect(remaining.length).toBe(0)
  })
})
