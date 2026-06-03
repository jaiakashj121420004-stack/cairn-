import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Account, Pair, Setup, Killzone, DatePreset, ModeFilter } from '@shared/types/index'
import { Button } from '../../components/ui/button'
import { Select } from '../../components/ui/select'
import { Switch } from '../../components/ui/switch'
import { ipc } from '../../lib/ipc'
import { useAnalyticsStore, DEFAULT_FILTER } from '../../stores/analytics-store'

const DATE_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
]

const MODE_OPTIONS: { value: ModeFilter; label: string }[] = [
  { value: 'all', label: 'All modes' },
  { value: 'live', label: 'Live' },
  { value: 'sim', label: 'Sim' },
  { value: 'backtest', label: 'Backtest' },
]

function dateInputValue(ms: number | null): string {
  if (ms === null) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

function parseDateInput(s: string): number | null {
  if (!s) return null
  return new Date(s + 'T00:00:00.000Z').getTime()
}

export function FilterBar() {
  const { filter, setFilter, setDatePreset, reset } = useAnalyticsStore()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [pairs, setPairs] = useState<Pair[]>([])
  const [setups, setSetups] = useState<Setup[]>([])
  const [killzones, setKillzones] = useState<Killzone[]>([])

  useEffect(() => {
    void ipc.accounts.list().then((r) => r.ok && setAccounts(r.data))
    void ipc.pairs.list().then((r) => r.ok && setPairs(r.data))
    void ipc.setups.list().then((r) => r.ok && setSetups(r.data))
    void ipc.killzones.list().then((r) => r.ok && setKillzones(r.data))
  }, [])

  const accountValue = filter.accountIds === 'all' ? 'all' : (filter.accountIds[0] ?? 'all')
  const accountOptions = [
    { value: 'all', label: 'All accounts' },
    ...accounts.map((a) => ({ value: a.id, label: a.displayName })),
  ]

  const isDirty = JSON.stringify(filter) !== JSON.stringify(DEFAULT_FILTER)

  return (
    <div className="mb-6 rounded-lg border border-border bg-surface-elevated p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <Select
            label="Date range"
            options={DATE_OPTIONS}
            value={filter.datePreset}
            onChange={(v) => setDatePreset(v as DatePreset)}
          />
        </div>

        {filter.datePreset === 'custom' && (
          <>
            <div>
              <label className="mb-1 block text-caption text-text-muted">From</label>
              <input
                type="date"
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-body-sm"
                value={dateInputValue(filter.dateFrom)}
                onChange={(e) => setFilter({ dateFrom: parseDateInput(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-caption text-text-muted">To</label>
              <input
                type="date"
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-body-sm"
                value={dateInputValue(filter.dateTo)}
                onChange={(e) => setFilter({ dateTo: parseDateInput(e.target.value) })}
              />
            </div>
          </>
        )}

        <div className="min-w-[160px]">
          <Select
            label="Account"
            options={accountOptions}
            value={accountValue}
            onChange={(v) => setFilter({ accountIds: v === 'all' ? 'all' : [v] })}
          />
        </div>

        <div className="min-w-[140px]">
          <Select
            label="Mode"
            options={MODE_OPTIONS}
            value={filter.mode}
            onChange={(v) => setFilter({ mode: v as ModeFilter })}
          />
        </div>

        <div className="min-w-[140px]">
          <Select
            label="Pair"
            options={[
              { value: '', label: 'All pairs' },
              ...pairs.map((p) => ({ value: p.id, label: p.symbol })),
            ]}
            value={filter.pairIds[0] ?? ''}
            onChange={(v) => setFilter({ pairIds: v ? [v] : [] })}
          />
        </div>

        <div className="min-w-[140px]">
          <Select
            label="Setup"
            options={[
              { value: '', label: 'All setups' },
              ...setups.map((s) => ({ value: s.id, label: s.name })),
            ]}
            value={filter.setupIds[0] ?? ''}
            onChange={(v) => setFilter({ setupIds: v ? [v] : [] })}
          />
        </div>

        <div className="min-w-[140px]">
          <Select
            label="Killzone"
            options={[
              { value: '', label: 'All killzones' },
              ...killzones.map((k) => ({ value: k.id, label: k.name })),
            ]}
            value={filter.killzoneIds[0] ?? ''}
            onChange={(v) => setFilter({ killzoneIds: v ? [v] : [] })}
          />
        </div>

        <div className="flex items-center gap-2 pb-2">
          <Switch checked={filter.cleanOnly} onChange={(c) => setFilter({ cleanOnly: c })} />
          <span className="text-body-sm text-text-secondary">Clean only</span>
        </div>

        {isDirty && (
          <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">
            <RotateCcw size={14} className="mr-1" /> Reset
          </Button>
        )}
      </div>
    </div>
  )
}
