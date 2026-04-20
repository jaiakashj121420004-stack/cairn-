// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { recordOverride } from '../../../electron/services/rules-engine/engine'
import {
  OVERRIDE_ACK_PHRASE,
  OVERRIDE_MIN_REASON_CHARS,
} from '../../../electron/services/rules-engine/types'
import { ensureSqlJs, createTestDb, schema } from './_db'

const VALID_REASON = 'I am intentionally overriding because the structure invalidated my plan.'

describe('recordOverride', () => {
  beforeAll(async () => {
    await ensureSqlJs()
  })

  let bundle: ReturnType<typeof createTestDb>
  beforeEach(() => {
    bundle = createTestDb()
  })

  it('rejects when ack is not the exact OVERRIDE phrase', () => {
    const { db, ids } = bundle
    expect(() =>
      recordOverride(db, {
        accountId: ids.accountId,
        ruleKey: 'min_rr_ratio',
        reason: VALID_REASON,
        ack: 'override', // wrong case
      }),
    ).toThrow(/OVERRIDE/)
    expect(db.select().from(schema.ruleViolations).all().length).toBe(0)
  })

  it('rejects when reason is shorter than the minimum', () => {
    const { db, ids } = bundle
    const shortReason = 'a'.repeat(OVERRIDE_MIN_REASON_CHARS - 1)
    expect(() =>
      recordOverride(db, {
        accountId: ids.accountId,
        ruleKey: 'min_rr_ratio',
        reason: shortReason,
        ack: OVERRIDE_ACK_PHRASE,
      }),
    ).toThrow(/at least/i)
    expect(db.select().from(schema.ruleViolations).all().length).toBe(0)
  })

  it('rejects override on a hard-lock rule', () => {
    const { db, ids } = bundle
    expect(() =>
      recordOverride(db, {
        accountId: ids.accountId,
        ruleKey: 'max_overall_daily_loss_hard_stop_pct',
        reason: VALID_REASON,
        ack: OVERRIDE_ACK_PHRASE,
      }),
    ).toThrow(/cannot be overridden/i)
    expect(db.select().from(schema.ruleViolations).all().length).toBe(0)
  })

  it('writes a row with outcome=user_overrode on success', () => {
    const { db, ids } = bundle
    const now = Date.UTC(2026, 3, 20, 9, 0)
    recordOverride(
      db,
      {
        accountId: ids.accountId,
        ruleKey: 'min_rr_ratio',
        reason: VALID_REASON,
        ack: OVERRIDE_ACK_PHRASE,
      },
      now,
    )
    const rows = db.select().from(schema.ruleViolations).all()
    expect(rows.length).toBe(1)
    expect(rows[0]?.outcome).toBe('user_overrode')
    expect(rows[0]?.ruleKey).toBe('min_rr_ratio')
    expect(rows[0]?.severity).toBe('blocking')
    expect(rows[0]?.createdAt).toBe(now)
    const ctx = JSON.parse(rows[0]?.contextJson ?? '{}')
    expect(ctx.reason).toBe(VALID_REASON)
    expect(ctx.ack).toBe(OVERRIDE_ACK_PHRASE)
  })

  it('honors edge: reason exactly equal to minimum length passes', () => {
    const { db, ids } = bundle
    const exact = 'a'.repeat(OVERRIDE_MIN_REASON_CHARS)
    expect(() =>
      recordOverride(db, {
        accountId: ids.accountId,
        ruleKey: 'min_rr_ratio',
        reason: exact,
        ack: OVERRIDE_ACK_PHRASE,
      }),
    ).not.toThrow()
  })
})
