import { registerPingHandler, registerSettingsHandlers } from './settings'
import { registerDbHandlers } from './db'
import { registerPropFirmHandlers } from './prop-firms'
import { registerAccountTemplateHandlers } from './account-templates'
import { registerAccountHandlers } from './accounts'
import { registerPathHandlers } from './paths'

export function setupIpcHandlers(): void {
  registerPingHandler()
  registerDbHandlers()
  registerSettingsHandlers()
  registerPropFirmHandlers()
  registerAccountTemplateHandlers()
  registerAccountHandlers()
  registerPathHandlers()
}
