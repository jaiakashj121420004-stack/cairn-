import { registerAccountRulesHandlers } from './account-rules'
import { registerAccountTemplateHandlers } from './account-templates'
import { registerAccountHandlers } from './accounts'
import { registerAnalyticsHandlers } from './analytics'
import { registerAuthHandlers } from './auth'
import { registerBackupHandlers } from './backup'
import { registerBrokerHandlers } from './broker'
import { registerDashboardHandlers } from './dashboard'
import { registerDataHandlers } from './data'
import { registerDbHandlers } from './db'
import { registerImportHandlers } from './import'
import { registerInsightsHandlers } from './insights'
import { registerKillzoneHandlers } from './killzones'
import { registerNotebookHandlers } from './notebook'
import { registerPairHandlers } from './pairs'
import { registerPathHandlers } from './paths'
import { registerPlaybookHandlers } from './playbooks'
import { registerPropFirmHandlers } from './prop-firms'
import { registerRulesHandlers } from './rules'
import { registerSessionHandlers } from './sessions'
import { registerPingHandler, registerSettingsHandlers } from './settings'
import { registerSetupHandlers } from './setups'
import { registerSyncHandlers } from './sync'
import { registerSyncConflictHandlers } from './sync-conflicts'
import { registerTradeHandlers } from './trades'
import { registerVaultHandlers } from './vault'

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
  registerInsightsHandlers()
  registerNotebookHandlers()
  registerBackupHandlers()
  registerImportHandlers()
  registerPlaybookHandlers()
  registerSyncHandlers()
  registerSyncConflictHandlers()
  registerAuthHandlers()
  registerVaultHandlers()
  registerBrokerHandlers()
}
