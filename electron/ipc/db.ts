import { ipcMain } from 'electron'
import type { IpcResponse } from '../../shared/types/index'
import { getDbStatus } from '../db/index'

export interface DbStatus {
  integrityOk: boolean
  migrationCount: number
  tradeCount: number
}

export function registerDbHandlers(): void {
  ipcMain.handle('db:status', (): IpcResponse<DbStatus> => {
    try {
      const status = getDbStatus()
      return { ok: true, data: status }
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'DB_STATUS_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error reading db status',
        },
      }
    }
  })
}
