import { registerPingHandler } from './settings'

export function setupIpcHandlers(): void {
  registerPingHandler()
}
