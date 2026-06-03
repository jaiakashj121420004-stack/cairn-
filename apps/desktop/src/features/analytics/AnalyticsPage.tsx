import { Download } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui'
import { useToast } from '../../components/ui'
import { Tabs } from '../../components/ui/tabs'
import { ipc } from '../../lib/ipc'
import { FilterBar } from './FilterBar'
import { AccountsPhasesTab } from './tabs/AccountsPhasesTab'
import { BehavioralTab } from './tabs/BehavioralTab'
import { CalendarTab } from './tabs/CalendarTab'
import { DerivedTab } from './tabs/DerivedTab'
import { PerformanceTab } from './tabs/PerformanceTab'
import { ReviewTab } from './tabs/ReviewTab'
import { RuleAdherenceTab } from './tabs/RuleAdherenceTab'
import { SetupPerformanceTab } from './tabs/SetupPerformanceTab'

const TABS = [
  { id: 'performance', label: 'Performance' },
  { id: 'adherence', label: 'Rule Adherence' },
  { id: 'setups', label: 'Setups' },
  { id: 'behavioral', label: 'Behavioral' },
  { id: 'derived', label: 'Metrics' },
  { id: 'phases', label: 'Accounts & Phases' },
  { id: 'review', label: 'Review' },
  { id: 'calendar', label: 'Calendar' },
]

const TAB_IDS = new Set(TABS.map((t) => t.id))

export function AnalyticsPage() {
  const [active, setActive] = useState('performance')
  const [searchParams] = useSearchParams()
  const toast = useToast()

  // Allow deep-linking: /analytics?tab=calendar
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && TAB_IDS.has(tab)) setActive(tab)
  }, [searchParams])

  async function handleExportPdf() {
    const res = await ipc.data.exportPdf('cairn-analytics.pdf')
    if (res.ok && res.data) toast('PDF saved.', 'success')
    else if (res.ok) {
      /* cancelled */
    } else toast('PDF export failed.', 'error')
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 font-semibold text-text-primary">Analytics</h1>
          <p className="mt-1 text-body-sm text-text-muted">
            Learn from your data. Turn it into behavior change.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void handleExportPdf()}>
          <Download className="h-4 w-4" strokeWidth={1.5} />
          Export PDF
        </Button>
      </div>

      <FilterBar />

      <Tabs tabs={TABS} activeId={active} onChange={setActive} className="mb-6" />

      {active === 'performance' && <PerformanceTab />}
      {active === 'adherence' && <RuleAdherenceTab />}
      {active === 'setups' && <SetupPerformanceTab />}
      {active === 'behavioral' && <BehavioralTab />}
      {active === 'derived' && <DerivedTab />}
      {active === 'phases' && <AccountsPhasesTab />}
      {active === 'review' && <ReviewTab />}
      {active === 'calendar' && <CalendarTab />}
    </div>
  )
}
