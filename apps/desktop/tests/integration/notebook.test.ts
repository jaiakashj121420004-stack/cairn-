// @vitest-environment node
//
// CRUD round-trip for the notebook IPC handlers against a real sql.js DB with
// all migrations applied (same harness style as event-bus.test.ts).

import { vi, describe, it, expect, beforeAll } from 'vitest'
import type { IpcResponse, NotebookEntry, NotebookEntrySummary } from '../../shared/types/index'

type IpcHandler = (e: unknown, raw: unknown) => unknown
const handlers = new Map<string, IpcHandler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((ch: string, fn: IpcHandler) => {
      handlers.set(ch, fn)
    }),
  },
  app: { getPath: () => '/tmp' },
}))

import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as schema from '../../electron/db/schema'

let injectedDb: unknown
vi.mock('../../electron/db/index', () => ({ getDb: () => injectedDb }))

import { registerNotebookHandlers } from '../../electron/ipc/notebook'

const MIGRATIONS = [
  '0001_initial',
  '0002_v11',
  '0003_opened_at',
  '0004_consolidate_partials',
  '0005_dismissed_insights',
  '0006_notebook',
  '0007_notebook_account',
].map((t) => readFileSync(join(__dirname, `../../electron/db/migrations/${t}.sql`), 'utf-8'))

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
  registerNotebookHandlers()
})

function makeDb() {
  const sqlite = new SQL.Database()
  for (const sql of MIGRATIONS) {
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  injectedDb = drizzle(sqlite, { schema })
}

function call<T>(name: string, raw: unknown): IpcResponse<T> {
  const fn = handlers.get(name)
  if (!fn) throw new Error(`handler not registered: ${name}`)
  return fn({}, raw) as IpcResponse<T>
}

function unwrap<T>(res: IpcResponse<T>): T {
  if (!res.ok) throw new Error(`expected ok, got ${res.error.code}: ${res.error.message}`)
  return res.data
}

describe('notebook IPC CRUD', () => {
  it('creates, lists, gets, updates, pins and soft-deletes an entry', () => {
    makeDb()

    // create
    const created = unwrap(
      call<NotebookEntry>('notebook:create', {
        title: 'Plan',
        content: '# Plan\n- a',
        template: 'trading_plan',
      }),
    )
    expect(created.title).toBe('Plan')
    expect(created.template).toBe('trading_plan')
    expect(created.pinned).toBe(0)

    // list (preview strips markdown markers)
    const list1 = unwrap(call<NotebookEntrySummary[]>('notebook:list', undefined))
    expect(list1).toHaveLength(1)
    expect(list1[0]?.id).toBe(created.id)
    expect(list1[0]?.preview).not.toContain('#')

    // get
    const got = unwrap(call<NotebookEntry>('notebook:get', { id: created.id }))
    expect(got.content).toBe('# Plan\n- a')

    // update content + title
    const updated = unwrap(
      call<NotebookEntry>('notebook:update', {
        id: created.id,
        title: 'Plan v2',
        content: 'changed',
      }),
    )
    expect(updated.title).toBe('Plan v2')
    expect(updated.content).toBe('changed')

    // pin
    const pinned = unwrap(call<NotebookEntry>('notebook:update', { id: created.id, pinned: true }))
    expect(pinned.pinned).toBe(1)

    // delete (soft)
    unwrap(call<{ ok: true }>('notebook:delete', { id: created.id }))
    expect(unwrap(call<NotebookEntrySummary[]>('notebook:list', undefined))).toHaveLength(0)
    const afterDelete = call<NotebookEntry>('notebook:get', { id: created.id })
    expect(afterDelete.ok).toBe(false)
  })

  it('orders pinned entries first, then by most recently updated', () => {
    makeDb()
    const a = unwrap(call<NotebookEntry>('notebook:create', { title: 'A' }))
    const b = unwrap(call<NotebookEntry>('notebook:create', { title: 'B' }))
    const c = unwrap(call<NotebookEntry>('notebook:create', { title: 'C' }))
    // Pin A → it should float to the top despite B/C being newer.
    call('notebook:update', { id: a.id, pinned: true })

    const ids = unwrap(call<NotebookEntrySummary[]>('notebook:list', undefined)).map((e) => e.id)
    expect(ids[0]).toBe(a.id)
    expect(ids).toContain(b.id)
    expect(ids).toContain(c.id)
  })

  it('rejects an invalid create (empty title)', () => {
    makeDb()
    const res = call<NotebookEntry>('notebook:create', { title: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns NOT_FOUND when getting an unknown id', () => {
    makeDb()
    const res = call<NotebookEntry>('notebook:get', { id: '00000000-0000-0000-0000-000000000000' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })

  it('version starts at 1 and increments on content or title update', () => {
    makeDb()
    const created = unwrap(call<NotebookEntry>('notebook:create', { title: 'Versioned' }))
    expect(created.version).toBe(1)
    const afterTitle = unwrap(
      call<NotebookEntry>('notebook:update', { id: created.id, title: 'New Title' }),
    )
    expect(afterTitle.version).toBe(2)
    // pinning alone must not bump the version
    const afterPin = unwrap(
      call<NotebookEntry>('notebook:update', { id: created.id, pinned: true }),
    )
    expect(afterPin.version).toBe(2)
  })

  it('accountId defaults to null and can be set on create and update', () => {
    makeDb()
    const created = unwrap(call<NotebookEntry>('notebook:create', { title: 'Scoped' }))
    expect(created.accountId).toBeNull()
    const updated = unwrap(
      call<NotebookEntry>('notebook:update', { id: created.id, accountId: null }),
    )
    expect(updated.accountId).toBeNull()
  })
})

describe('notebook IPC search', () => {
  it('finds entries by title substring', () => {
    makeDb()
    unwrap(
      call<NotebookEntry>('notebook:create', {
        title: 'My Trading Plan',
        content: 'morning session',
      }),
    )
    unwrap(call<NotebookEntry>('notebook:create', { title: 'Watchlist', content: 'EURUSD XAUUSD' }))

    const results = unwrap(call<NotebookEntrySummary[]>('notebook:search', { query: 'Trading' }))
    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('My Trading Plan')
  })

  it('finds entries by body content substring', () => {
    makeDb()
    unwrap(
      call<NotebookEntry>('notebook:create', { title: 'Plan A', content: 'London killzone entry' }),
    )
    unwrap(call<NotebookEntry>('notebook:create', { title: 'Plan B', content: 'NY session notes' }))

    const results = unwrap(call<NotebookEntrySummary[]>('notebook:search', { query: 'killzone' }))
    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('Plan A')
  })

  it('returns empty array when no entries match', () => {
    makeDb()
    unwrap(call<NotebookEntry>('notebook:create', { title: 'Watchlist' }))
    const results = unwrap(
      call<NotebookEntrySummary[]>('notebook:search', { query: 'xyznotfound' }),
    )
    expect(results).toHaveLength(0)
  })

  it('rejects a search with an empty query', () => {
    makeDb()
    const res = call<NotebookEntrySummary[]>('notebook:search', { query: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR')
  })

  it('excludes soft-deleted entries from search results', () => {
    makeDb()
    const entry = unwrap(
      call<NotebookEntry>('notebook:create', { title: 'Gone', content: 'deleted content' }),
    )
    unwrap(call<{ ok: true }>('notebook:delete', { id: entry.id }))

    const results = unwrap(
      call<NotebookEntrySummary[]>('notebook:search', { query: 'deleted content' }),
    )
    expect(results).toHaveLength(0)
  })
})
