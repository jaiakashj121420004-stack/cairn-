import { ipcMain, dialog, app, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import log from 'electron-log'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import {
  createBackup,
  getBackupLog,
  readRestoreInfo,
  restoreFromBackup,
  runScheduledLocalBackup,
} from '../services/backup-service'
import type {
  IpcResponse,
  BackupLogEntry,
  BackupResult,
  RestoreInfo,
  BackupSettings,
} from '../../shared/types/index'

function getDataDir(): string {
  return join(app.getPath('userData'), 'cairn')
}

function getSetting(key: string): string | null {
  const db = getDb()
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  return row?.value ?? null
}

function setSetting(key: string, value: string): void {
  const db = getDb()
  db.insert(schema.settings)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: Date.now() } })
    .run()
}

function getBackupSettings(): BackupSettings {
  return {
    folder: getSetting('backup_folder') ? JSON.parse(getSetting('backup_folder')!) as string : null,
    schedule: (getSetting('backup_schedule') ? JSON.parse(getSetting('backup_schedule')!) : 'manual') as BackupSettings['schedule'],
    dailyTime: (getSetting('backup_daily_time') ? JSON.parse(getSetting('backup_daily_time')!) : '02:00') as string,
    backupOnClose: getSetting('backup_on_close') ? (JSON.parse(getSetting('backup_on_close')!) as boolean) : false,
  }
}

export function registerBackupHandlers(): void {
  // ── backup:getSettings ──────────────────────────────────────────────────────
  ipcMain.handle('backup:getSettings', (): IpcResponse<BackupSettings> => {
    try {
      return { ok: true, data: getBackupSettings() }
    } catch (err) {
      return { ok: false, error: { code: 'BACKUP_ERROR', message: String(err) } }
    }
  })

  // ── backup:setSettings ──────────────────────────────────────────────────────
  ipcMain.handle('backup:setSettings', (_e, raw: Partial<BackupSettings>): IpcResponse<void> => {
    try {
      if (raw.folder !== undefined) setSetting('backup_folder', JSON.stringify(raw.folder))
      if (raw.schedule !== undefined) setSetting('backup_schedule', JSON.stringify(raw.schedule))
      if (raw.dailyTime !== undefined) setSetting('backup_daily_time', JSON.stringify(raw.dailyTime))
      if (raw.backupOnClose !== undefined) setSetting('backup_on_close', JSON.stringify(raw.backupOnClose))
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'SETTINGS_ERROR', message: String(err) } }
    }
  })

  // ── backup:pickFolder ───────────────────────────────────────────────────────
  ipcMain.handle('backup:pickFolder', async (): Promise<IpcResponse<string | null>> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return { ok: true, data: null }
    return { ok: true, data: result.filePaths[0]! }
  })

  // ── backup:now ─────────────────────────────────────────────────────────────
  ipcMain.handle('backup:now', async (): Promise<IpcResponse<BackupResult>> => {
    try {
      const settings = getBackupSettings()
      const destDir = settings.folder ?? join(getDataDir(), 'backups', 'local')

      // If user has configured a custom folder, open native picker to let them pick destination
      const result = createBackup('manual', destDir)
      void shell.openPath(destDir)
      return { ok: true, data: result }
    } catch (err) {
      log.error('[backup:now]', err)
      return { ok: false, error: { code: 'BACKUP_FAILED', message: String(err) } }
    }
  })

  // ── backup:nowToFolder ─────────────────────────────────────────────────────
  ipcMain.handle('backup:nowToFolder', async (): Promise<IpcResponse<BackupResult>> => {
    try {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: { code: 'CANCELLED', message: 'No folder selected.' } }
      }
      const destDir = result.filePaths[0]!
      const backupResult = createBackup('manual', destDir)
      void shell.openPath(destDir)
      return { ok: true, data: backupResult }
    } catch (err) {
      log.error('[backup:nowToFolder]', err)
      return { ok: false, error: { code: 'BACKUP_FAILED', message: String(err) } }
    }
  })

  // ── backup:getLog ──────────────────────────────────────────────────────────
  ipcMain.handle('backup:getLog', (): IpcResponse<BackupLogEntry[]> => {
    try {
      return { ok: true, data: getBackupLog() }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── backup:pickRestoreFile ─────────────────────────────────────────────────
  ipcMain.handle('backup:pickRestoreFile', async (): Promise<IpcResponse<RestoreInfo & { path: string }>> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Cairn backup',
        filters: [{ name: 'Cairn Backup', extensions: ['zip'] }],
        properties: ['openFile'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: { code: 'CANCELLED', message: 'No file selected.' } }
      }
      const zipPath = result.filePaths[0]!
      if (!existsSync(zipPath)) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'File not found.' } }
      }
      const info = readRestoreInfo(zipPath)
      return { ok: true, data: { ...info, path: zipPath } }
    } catch (err) {
      return { ok: false, error: { code: 'INVALID_BACKUP', message: String(err) } }
    }
  })

  // ── backup:restore ─────────────────────────────────────────────────────────
  ipcMain.handle('backup:restore', (_e, raw: { path: string; ack: string }): IpcResponse<void> => {
    if (raw?.ack !== 'RESTORE') {
      return { ok: false, error: { code: 'ACK_REQUIRED', message: 'Type RESTORE to confirm.' } }
    }
    try {
      if (!raw.path || !existsSync(raw.path)) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Backup file not found.' } }
      }
      restoreFromBackup(raw.path)
      // Quit and relaunch so new DB is loaded fresh
      setImmediate(() => {
        app.relaunch()
        app.quit()
      })
      return { ok: true, data: undefined }
    } catch (err) {
      log.error('[backup:restore]', err)
      return { ok: false, error: { code: 'RESTORE_FAILED', message: String(err) } }
    }
  })

  // ── backup:runScheduled ────────────────────────────────────────────────────
  ipcMain.handle('backup:runScheduled', (): IpcResponse<void> => {
    try {
      runScheduledLocalBackup()
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'BACKUP_FAILED', message: String(err) } }
    }
  })
}

export { getBackupSettings }
