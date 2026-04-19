import { registerPingHandler } from './settings'
import { registerDbHandlers } from './db'

export function setupIpcHandlers(): void {
  registerPingHandler()
  registerDbHandlers()
}
