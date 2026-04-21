import { registerPingHandler, registerSettingsHandlers } from './settings'
import { registerDbHandlers } from './db'
import { registerPropFirmHandlers } from './prop-firms'
import { registerAccountTemplateHandlers } from './account-templates'
import { registerAccountHandlers } from './accounts'
import { registerPathHandlers } from './paths'
import { registerRulesHandlers } from './rules'
import { registerAccountRulesHandlers } from './account-rules'
import { registerPairHandlers } from './pairs'
import { registerSetupHandlers } from './setups'
import { registerKillzoneHandlers } from './killzones'
import { registerDataHandlers } from './data'
import { registerSessionHandlers } from './sessions'
import { registerTradeHandlers } from './trades'
import { registerDashboardHandlers } from './dashboard'
import { registerAnalyticsHandlers } from './analytics'
import { registerBackupHandlers } from './backup'

export function setupIpcHandlers(): void {
  registerPingHandler()
  registerDbHandlers()
  registerSettingsHandlers()
  registerPropFirmHandlers()
  registerAccountTemplateHandlers()
  registerAccountHandlers()
  registerPathHandlers()
  registerRulesHandlers()
  registerAccountRulesHandlers()
  registerPairHandlers()
  registerSetupHandlers()
  registerKillzoneHandlers()
  registerDataHandlers()
  registerSessionHandlers()
  registerTradeHandlers()
  registerDashboardHandlers()
  registerAnalyticsHandlers()
  registerBackupHandlers()
}
