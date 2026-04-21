import { useState } from 'react'
import { Tabs } from '../../components/ui/tabs'
import { FilterBar } from './FilterBar'
import { PerformanceTab } from './tabs/PerformanceTab'
import { RuleAdherenceTab } from './tabs/RuleAdherenceTab'
import { SetupPerformanceTab } from './tabs/SetupPerformanceTab'
import { BehavioralTab } from './tabs/BehavioralTab'
import { AccountsPhasesTab } from './tabs/AccountsPhasesTab'
import { ReviewTab } from './tabs/ReviewTab'

const TABS = [
  { id: 'performance', label: 'Performance' },
  { id: 'adherence', label: 'Rule Adherence' },
  { id: 'setups', label: 'Setups' },
  { id: 'behavioral', label: 'Behavioral' },
  { id: 'phases', label: 'Accounts & Phases' },
  { id: 'review', label: 'Review' },
]

export function AnalyticsPage() {
  const [active, setActive] = useState('performance')

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-5">
        <h1 className="text-h1 font-semibold text-text-primary">Analytics</h1>
        <p className="mt-1 text-body-sm text-text-muted">
          Learn from your data. Turn it into behavior change.
        </p>
      </div>

      <FilterBar />

      <Tabs tabs={TABS} activeId={active} onChange={setActive} className="mb-6" />

      {active === 'performance' && <PerformanceTab />}
      {active === 'adherence' && <RuleAdherenceTab />}
      {active === 'setups' && <SetupPerformanceTab />}
      {active === 'behavioral' && <BehavioralTab />}
      {active === 'phases' && <AccountsPhasesTab />}
      {active === 'review' && <ReviewTab />}
    </div>
  )
}
