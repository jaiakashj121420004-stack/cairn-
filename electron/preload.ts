import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResponse } from '../shared/types/index'
import type { DbStatus } from './ipc/db'

const api = {
  ping: (): Promise<IpcResponse<string>> => ipcRenderer.invoke('ping'),
  dbStatus: (): Promise<IpcResponse<DbStatus>> => ipcRenderer.invoke('db:status'),
} as const

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
