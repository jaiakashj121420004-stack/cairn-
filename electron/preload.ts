import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResponse } from '../shared/types/index'

// Typed API surface exposed to the renderer via window.api
// Only expose what the renderer explicitly needs — no raw ipcRenderer access.
const api = {
  ping: (): Promise<IpcResponse<string>> => ipcRenderer.invoke('ping'),
} as const

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
