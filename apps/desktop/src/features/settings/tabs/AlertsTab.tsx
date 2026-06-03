import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui'
import { useToast } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'

interface RAlert {
  r: number
  enabled: boolean
}

export function AlertsTab() {
  const [alerts, setAlerts] = useState<RAlert[]>([])
  const [newR, setNewR] = useState('')
  const toast = useToast()

  useEffect(() => {
    void (async () => {
      const res = await ipc.settings.get<RAlert[]>('r_alerts')
      if (res.ok && res.data) setAlerts(res.data)
    })()
  }, [])

  async function saveAlerts(updated: RAlert[]) {
    setAlerts(updated)
    const res = await ipc.settings.set('r_alerts', updated)
    if (!res.ok) toast('Save failed', 'error')
  }

  function addAlert() {
    const r = parseFloat(newR)
    if (!Number.isFinite(r) || r <= 0) {
      toast('Enter a valid R value > 0', 'error')
      return
    }
    if (alerts.some((a) => a.r === r)) {
      toast('That R level already exists', 'error')
      return
    }
    setNewR('')
    void saveAlerts([...alerts, { r, enabled: true }].sort((a, b) => a.r - b.r))
  }

  function toggle(r: number) {
    void saveAlerts(alerts.map((a) => (a.r === r ? { ...a, enabled: !a.enabled } : a)))
  }

  function remove(r: number) {
    void saveAlerts(alerts.filter((a) => a.r !== r))
  }

  return (
    <div className="max-w-sm space-y-6">
      <div>
        <h3 className="text-body font-semibold text-text-primary mb-1">R-target alerts</h3>
        <p className="text-caption text-text-muted">
          A toast fires when a trade closes at or above the configured R multiple.
        </p>
      </div>

      {alerts.length === 0 ? (
        <p className="text-caption text-text-muted">No alerts configured.</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.r}
              className="flex items-center justify-between rounded-[10px] border border-border bg-surface-elevated px-3 py-2"
            >
              <span className="font-mono text-body text-text-primary">{a.r}R</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(a.r)}
                  className={
                    a.enabled
                      ? 'text-caption font-medium text-accent-a'
                      : 'text-caption font-medium text-text-muted'
                  }
                >
                  {a.enabled ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(a.r)}
                  className="text-text-muted hover:text-danger transition-colors"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="number"
          value={newR}
          onChange={(e) => setNewR(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addAlert()
          }}
          placeholder="e.g. 2"
          min="0.1"
          step="0.5"
          className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
        />
        <Button size="sm" onClick={addAlert}>
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Add
        </Button>
      </div>
    </div>
  )
}
