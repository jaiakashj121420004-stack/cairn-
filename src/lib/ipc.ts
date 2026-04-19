import type { IpcResponse } from '@shared/types/index'

export interface DbStatus {
  integrityOk: boolean
  migrationCount: number
  tradeCount: number
}

declare global {
  interface Window {
    api: {
      ping: () => Promise<IpcResponse<string>>
      dbStatus: () => Promise<IpcResponse<DbStatus>>
    }
  }
}

export const ipc = {
  ping: (): Promise<IpcResponse<string>> => window.api.ping(),
  dbStatus: (): Promise<IpcResponse<DbStatus>> => window.api.dbStatus(),
} as const
