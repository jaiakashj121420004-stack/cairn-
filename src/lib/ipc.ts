import type { IpcResponse } from '@shared/types/index'

// Type declaration for the API surface exposed by preload.ts via contextBridge.
// Keep in sync with the `api` object in electron/preload.ts.
declare global {
  interface Window {
    api: {
      ping: () => Promise<IpcResponse<string>>
    }
  }
}

// Typed wrapper so the renderer never calls window.api directly.
// Every method returns IpcResponse<T> — callers check .ok before using .data.
export const ipc = {
  ping: (): Promise<IpcResponse<string>> => window.api.ping(),
} as const
