import { eq } from 'drizzle-orm'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import { isAllowedSettingKey } from './settings-keys'
import type { IpcResponse } from '../../shared/types/index'

export function registerPingHandler(): void {
  ipcMain.handle('ping', (): IpcResponse<string> => {
    return { ok: true, data: 'pong' }
  })
}

const GetSettingInput = z.object({ key: z.string().min(1) })
const SetSettingInput = z.object({ key: z.string().min(1), value: z.string() })

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (_e, raw): IpcResponse<string | null> => {
    const parsed = GetSettingInput.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const row = db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, parsed.data.key))
        .get()
      return { ok: true, data: row?.value ?? null }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('settings:set', (_e, raw): IpcResponse<void> => {
    const parsed = SetSettingInput.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    // Only allow-listed keys may be written from the renderer (P1 security). This
    // stops a compromised renderer from injecting arbitrary keys into `settings`.
    if (!isAllowedSettingKey(parsed.data.key)) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `setting key not allowed: ${parsed.data.key}` },
      }
    }
    try {
      const db = getDb()
      db.insert(schema.settings)
        .values({ key: parsed.data.key, value: parsed.data.value, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: parsed.data.value, updatedAt: Date.now() },
        })
        .run()
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
