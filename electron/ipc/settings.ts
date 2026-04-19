import { ipcMain } from 'electron'
import type { IpcResponse } from '../../shared/types/index'

export function registerPingHandler(): void {
  ipcMain.handle('ping', (): IpcResponse<string> => {
    return { ok: true, data: 'pong' }
  })
}
