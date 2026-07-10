import { eq } from 'drizzle-orm'
import { ipcMain } from 'electron'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import {
  DEMO_ACCOUNT_ID,
  DEMO_MODE_SETTING,
  removeDemoData,
  seedDemoData,
} from '../services/demo/demo-seed'
import type { IpcResponse } from '../../shared/types/index'
import type { CairnDb } from '../db/index'

function setDemoFlag(db: CairnDb, active: boolean): void {
  const now = Date.now()
  const value = JSON.stringify(active)
  db.insert(schema.settings)
    .values({ key: DEMO_MODE_SETTING, value, updatedAt: now })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: now } })
    .run()
}

function readDemoFlag(db: CairnDb): boolean {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, DEMO_MODE_SETTING))
    .get()
  if (!row) return false
  try {
    return JSON.parse(row.value) === true
  } catch {
    return false
  }
}

export function registerDemoHandlers(): void {
  ipcMain.handle('demo:status', (): IpcResponse<{ active: boolean; accountId: string | null }> => {
    try {
      const db = getDb()
      const active = readDemoFlag(db)
      return { ok: true, data: { active, accountId: active ? DEMO_ACCOUNT_ID : null } }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('demo:enter', (): IpcResponse<{ accountId: string }> => {
    try {
      const db = getDb()
      const { accountId } = seedDemoData(db)
      setDemoFlag(db, true)
      return { ok: true, data: { accountId } }
    } catch (err) {
      return { ok: false, error: { code: 'DEMO_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('demo:exit', (): IpcResponse<void> => {
    try {
      const db = getDb()
      removeDemoData(db)
      setDemoFlag(db, false)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'DEMO_ERROR', message: String(err) } }
    }
  })
}
