// @vitest-environment node
//
// The broker auto-log mode is set in the renderer (Settings → Integrations) and
// read in the main process by the ingest service. This test exercises that full
// round-trip: the real settings IPC handlers persist the value the way the
// renderer encodes it (JSON), and `parseAutoLogMode` decodes what comes back.

import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  BROKER_AUTO_LOG_MODE_SETTING_KEY,
  DEFAULT_BROKER_AUTO_LOG_MODE,
  parseAutoLogMode,
} from '@cairn/shared-types'
import type { IpcResponse } from '../../shared/types/index'

type IpcHandler = (e: unknown, raw: unknown) => unknown
const handlers = new Map<string, IpcHandler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((ch: string, fn: IpcHandler) => {
      handlers.set(ch, fn)
    }),
  },
}))

import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import * as schema from '../../electron/db/schema'

let injectedDb: unknown
vi.mock('../../electron/db/index', () => ({ getDb: () => injectedDb }))

import { registerSettingsHandlers } from '../../electron/ipc/settings'

const MIGRATIONS = [
  '0001_initial',
  '0002_v11',
  '0003_opened_at',
  '0004_consolidate_partials',
  '0005_dismissed_insights',
  '0006_notebook',
  '0007_notebook_account',
  '0008_external_ref',
  '0009_phase2',
  '0010_playbooks',
  '0011_sync',
  '0012_sync_merge',
  '0013_sync_clocks',
  '0014_live_detection_outcome',
  '0015_broker_account_map',
  '0016_account_phases',
].map((t) => readFileSync(join(__dirname, `../../electron/db/migrations/${t}.sql`), 'utf-8'))

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
  registerSettingsHandlers()
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

// The renderer's ipc.settings.set JSON-encodes the value before persisting.
function setEncoded(key: string, value: unknown): IpcResponse<unknown> {
  return call<unknown>('settings:set', { key, value: JSON.stringify(value) })
}

describe('broker auto-log-mode setting round-trip', () => {
  it('defaults to draft_awaiting_context when unset', () => {
    makeDb()
    const res = call<string | null>('settings:get', { key: BROKER_AUTO_LOG_MODE_SETTING_KEY })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data).toBeNull()
      expect(parseAutoLogMode(res.data)).toBe(DEFAULT_BROKER_AUTO_LOG_MODE)
      expect(parseAutoLogMode(res.data)).toBe('draft_awaiting_context')
    }
  })

  it('persists fully_auto and decodes it back', () => {
    makeDb()
    expect(setEncoded(BROKER_AUTO_LOG_MODE_SETTING_KEY, 'fully_auto').ok).toBe(true)
    const res = call<string | null>('settings:get', { key: BROKER_AUTO_LOG_MODE_SETTING_KEY })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data).toBe('"fully_auto"') // stored JSON-encoded
      expect(parseAutoLogMode(res.data)).toBe('fully_auto')
    }
  })

  it('round-trips back to draft_awaiting_context', () => {
    makeDb()
    setEncoded(BROKER_AUTO_LOG_MODE_SETTING_KEY, 'fully_auto')
    setEncoded(BROKER_AUTO_LOG_MODE_SETTING_KEY, 'draft_awaiting_context')
    const res = call<string | null>('settings:get', { key: BROKER_AUTO_LOG_MODE_SETTING_KEY })
    expect(res.ok).toBe(true)
    if (res.ok) expect(parseAutoLogMode(res.data)).toBe('draft_awaiting_context')
  })

  it('falls back to the default for a malformed / unknown stored value', () => {
    expect(parseAutoLogMode('not json')).toBe('draft_awaiting_context')
    expect(parseAutoLogMode('"bogus_mode"')).toBe('draft_awaiting_context')
    expect(parseAutoLogMode(null)).toBe('draft_awaiting_context')
  })
})
