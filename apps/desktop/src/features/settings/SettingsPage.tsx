import { useState, useEffect } from 'react'
import { Tabs } from '../../components/ui'
import { useUiStore } from '../../stores/ui-store'
import { AccountTab } from './tabs/AccountTab'
import { AlertsTab } from './tabs/AlertsTab'
import { BackupsTab } from './tabs/BackupsTab'
import { DataTab } from './tabs/DataTab'
import { GeneralTab } from './tabs/GeneralTab'
import { ImportTab } from './tabs/ImportTab'
import { IntegrationsTab } from './tabs/IntegrationsTab'
import { KillzonesTab } from './tabs/KillzonesTab'
import { PairsTab } from './tabs/PairsTab'
import { PlaybooksTab } from './tabs/PlaybooksTab'
import { PropFirmsTab } from './tabs/PropFirmsTab'
import { SetupsTab } from './tabs/SetupsTab'
import { ShortcutsTab } from './tabs/ShortcutsTab'
import { TemplatesTab } from './tabs/TemplatesTab'
import type { TabItem } from '../../components/ui'

const TABS: TabItem[] = [
  { id: 'general', label: 'General' },
  { id: 'pairs', label: 'Pairs' },
  { id: 'setups', label: 'Setups' },
  { id: 'killzones', label: 'Killzones' },
  { id: 'playbooks', label: 'Playbooks' },
  { id: 'firms', label: 'Prop Firms' },
  { id: 'templates', label: 'Templates' },
  { id: 'import', label: 'Import' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'data', label: 'Data' },
  { id: 'backups', label: 'Backups' },
  { id: 'account', label: 'Account & Sync' },
]

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const { settingsTabRequested, setSettingsTabRequested } = useUiStore()

  useEffect(() => {
    if (!settingsTabRequested) return
    const valid = TABS.some((t) => t.id === settingsTabRequested)
    if (valid) setActiveTab(settingsTabRequested)
    setSettingsTabRequested(null)
  }, [settingsTabRequested, setSettingsTabRequested])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pt-5">
        <h1 className="mb-4 text-h2 font-semibold text-text-primary">Settings</h1>
        <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'pairs' && <PairsTab />}
        {activeTab === 'setups' && <SetupsTab />}
        {activeTab === 'killzones' && <KillzonesTab />}
        {activeTab === 'firms' && <PropFirmsTab />}
        {activeTab === 'playbooks' && <PlaybooksTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'alerts' && <AlertsTab />}
        {activeTab === 'shortcuts' && <ShortcutsTab />}
        {activeTab === 'import' && <ImportTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'backups' && <BackupsTab />}
        {activeTab === 'account' && <AccountTab />}
      </div>
    </div>
  )
}
