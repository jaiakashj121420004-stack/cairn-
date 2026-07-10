import { existsSync } from 'fs'
import { join, resolve, sep } from 'path'
import { ipcMain, dialog, shell, app } from 'electron'
import type { IpcResponse } from '../../shared/types/index'

export function registerPathHandlers(): void {
  ipcMain.handle('paths:pickFolder', async (): Promise<IpcResponse<string | null>> => {
    try {
      const defaultPath = join(app.getPath('documents'), 'Cairn Backups')
      const result = await dialog.showOpenDialog({
        title: 'Select Backup Folder',
        defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, data: null }
      }
      return { ok: true, data: result.filePaths[0] ?? null }
    } catch (err) {
      return { ok: false, error: { code: 'DIALOG_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('paths:pickImages', async (): Promise<IpcResponse<string[]>> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Chart Screenshot',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        properties: ['openFile', 'multiSelections'],
      })
      if (result.canceled) return { ok: true, data: [] }
      return { ok: true, data: result.filePaths }
    } catch (err) {
      return { ok: false, error: { code: 'DIALOG_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle(
    'paths:openFile',
    async (_e, raw: { filePath: string }): Promise<IpcResponse<void>> => {
      try {
        // openFile is only ever used to reveal Cairn-created screenshots, which live
        // under userData. Confine it to that tree so a compromised renderer cannot
        // launch an arbitrary file with its OS handler (i.e. code execution).
        const target = resolve(raw.filePath)
        const allowedRoot = resolve(app.getPath('userData'))
        if (target !== allowedRoot && !target.startsWith(allowedRoot + sep)) {
          return { ok: false, error: { code: 'FORBIDDEN_PATH', message: 'Path is not allowed' } }
        }
        if (!existsSync(target)) {
          return { ok: false, error: { code: 'NOT_FOUND', message: 'File not found' } }
        }
        await shell.openPath(target)
        return { ok: true, data: undefined }
      } catch (err) {
        return { ok: false, error: { code: 'OS_ERROR', message: String(err) } }
      }
    },
  )
}
