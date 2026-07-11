// @vitest-environment node
//
// Guardrail hardening: a broker fill is bound to a Cairn account
// (`broker_account_map`), but a live fill carries no setup. `resolveAccount`
// (services/broker/index.ts) used to return null — dropping the fill — when
// the catalogue had no active setup. These tests exercise the pure resolver
// (services/broker/setup-resolver.ts) it now falls back to: the fill must
// always land somewhere.

import { drizzle } from 'drizzle-orm/sql-js'
import { eq } from 'drizzle-orm'
import initSqlJs from 'sql.js'
import { describe, it, expect, beforeAll } from 'vitest'
import * as schema from '../../../electron/db/schema'
import {
  firstActiveSetupId,
  getOrCreateUnclassifiedSetup,
  resolveDefaultSetupId,
  UNCLASSIFIED_SETUP_NAME,
} from '../../../electron/services/broker/setup-resolver'
import { applyAllMigrations } from '../../helpers/test-migrations'
import type { CairnDb } from '../../../electron/db/index'

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
})

/** A fresh DB with an empty `setups` table — mirrors a freshly wiped
 *  catalogue, the exact scenario that used to drop a mapped fill. */
function makeEmptyDb(): CairnDb {
  const sqlite = new SQL.Database()
  applyAllMigrations(sqlite)
  return drizzle(sqlite, { schema }) as unknown as CairnDb
}

let setupCounter = 0

/** Insert a setup row, returning its id. */
function insertSetup(
  db: CairnDb,
  overrides: Partial<typeof schema.setups.$inferInsert> = {},
): string {
  setupCounter += 1
  const id = overrides.id ?? `setup-${setupCounter}`
  db.insert(schema.setups)
    .values({
      id,
      name: 'FVG',
      category: 'ict',
      description: null,
      color: '#888',
      active: 1,
      displayOrder: setupCounter,
      createdAt: 0,
      updatedAt: 0,
      ...overrides,
      id,
    })
    .run()
  return id
}

function setupByName(db: CairnDb, name: string) {
  return db.select().from(schema.setups).where(eq(schema.setups.name, name)).all()
}

function setupById(db: CairnDb, id: string) {
  return db.select().from(schema.setups).where(eq(schema.setups.id, id)).get()
}

describe('firstActiveSetupId', () => {
  it('returns null when the catalogue is empty', () => {
    const db = makeEmptyDb()
    expect(firstActiveSetupId(db)).toBeNull()
  })

  it('returns null when every setup is archived', () => {
    const db = makeEmptyDb()
    insertSetup(db, { active: 0 })
    expect(firstActiveSetupId(db)).toBeNull()
  })

  it('returns the active setup with the lowest display order', () => {
    const db = makeEmptyDb()
    insertSetup(db, { id: 's-2', displayOrder: 2 })
    const first = insertSetup(db, { id: 's-1', displayOrder: 1 })
    expect(firstActiveSetupId(db)).toBe(first)
  })
})

describe('getOrCreateUnclassifiedSetup', () => {
  it('creates the setup on first call, active and named "Unclassified"', () => {
    const db = makeEmptyDb()
    const result = getOrCreateUnclassifiedSetup(db, 1_000)
    expect(result.changed).toBe(true)

    const row = setupById(db, result.id)
    expect(row?.name).toBe(UNCLASSIFIED_SETUP_NAME)
    expect(row?.active).toBe(1)
  })

  it('is idempotent: a second call finds the same row and reports no change', () => {
    const db = makeEmptyDb()
    const first = getOrCreateUnclassifiedSetup(db, 1_000)
    const second = getOrCreateUnclassifiedSetup(db, 2_000)
    expect(second.id).toBe(first.id)
    expect(second.changed).toBe(false)
    expect(setupByName(db, UNCLASSIFIED_SETUP_NAME).length).toBe(1) // never a duplicate row
  })

  it('reactivates an archived "Unclassified" row instead of creating a duplicate', () => {
    const db = makeEmptyDb()
    const first = getOrCreateUnclassifiedSetup(db, 1_000)
    db.update(schema.setups).set({ active: 0 }).where(eq(schema.setups.id, first.id)).run()

    const second = getOrCreateUnclassifiedSetup(db, 2_000)
    expect(second.id).toBe(first.id)
    expect(second.changed).toBe(true)
    expect(setupById(db, first.id)?.active).toBe(1)
    expect(setupByName(db, UNCLASSIFIED_SETUP_NAME).length).toBe(1)
  })
})

describe('resolveDefaultSetupId — a mapped fill is never dropped for want of a setup', () => {
  it('returns the first active setup when one exists, without touching "Unclassified"', () => {
    const db = makeEmptyDb()
    const active = insertSetup(db, { id: 's-active' })
    const id = resolveDefaultSetupId(db)
    expect(id).toBe(active)
    expect(setupByName(db, UNCLASSIFIED_SETUP_NAME)).toEqual([])
  })

  it('falls back to "Unclassified" — never null — when the catalogue has no active setup', () => {
    const db = makeEmptyDb()
    const id = resolveDefaultSetupId(db)
    expect(id).toBeTypeOf('string')
    expect(id.length).toBeGreaterThan(0)

    const row = setupById(db, id)
    expect(row?.name).toBe(UNCLASSIFIED_SETUP_NAME)
    expect(row?.active).toBe(1)
  })

  it('falls back to "Unclassified" even when every setup is archived', () => {
    const db = makeEmptyDb()
    insertSetup(db, { active: 0 })
    insertSetup(db, { id: 's-2', active: 0 })
    const id = resolveDefaultSetupId(db)
    expect(setupById(db, id)?.name).toBe(UNCLASSIFIED_SETUP_NAME)
  })

  it('calls the logger exactly once when the fallback is created, and not again on a repeat call', () => {
    const db = makeEmptyDb()
    const messages: string[] = []
    const log = (m: string) => messages.push(m)

    resolveDefaultSetupId(db, log)
    resolveDefaultSetupId(db, log)

    expect(messages.length).toBe(1)
  })
})
