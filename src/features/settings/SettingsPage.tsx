import { useState, useEffect } from 'react'
import { Tabs } from '../../components/ui'
import { useUiStore } from '../../stores/ui-store'
import type { TabItem } from '../../components/ui'
import { GeneralTab } from './tabs/GeneralTab'
import { PairsTab } from './tabs/PairsTab'
import { SetupsTab } from './tabs/SetupsTab'
import { KillzonesTab } from './tabs/KillzonesTab'
import { PropFirmsTab } from './tabs/PropFirmsTab'
import { TemplatesTab } from './tabs/TemplatesTab'
import { DataTab } from './tabs/DataTab'
import { BackupsTab } from './tabs/BackupsTab'
import { AlertsTab } from './tabs/AlertsTab'
import { ShortcutsTab } from './tabs/ShortcutsTab'

const TABS: TabItem[] = [
  { id: 'general', label: 'General' },
  { id: 'pairs', label: 'Pairs' },
  { id: 'setups', label: 'Setups' },
  { id: 'killzones', label: 'Killzones' },
  { id: 'firms', label: 'Prop Firms' },
  { id: 'templates', label: 'Templates' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'data', label: 'Data' },
  { id: 'backups', label: 'Backups' },
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
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'alerts' && <AlertsTab />}
        {activeTab === 'shortcuts' && <ShortcutsTab />}
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'backups' && <BackupsTab />}
      </div>
    </div>
  )
}
