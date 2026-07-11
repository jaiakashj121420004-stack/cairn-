import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PreTradeNudgeConfig } from '@shared/types/index'
import { Button } from '../../../components/ui'
import { useToast } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'

interface RAlert {
  r: number
  enabled: boolean
}

/** Defaults mirror `DEFAULT_PRETRADE_NUDGES` (electron/services/insights/pre-trade-signals.ts). */
const DEFAULT_NUDGES: PreTradeNudgeConfig = {
  tilt: { enabled: true, lossRun: 3 },
  urgency: { enabled: true, level: 7 },
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function AlertsTab() {
  const [alerts, setAlerts] = useState<RAlert[]>([])
  const [newR, setNewR] = useState('')
  const [nudges, setNudges] = useState<PreTradeNudgeConfig>(DEFAULT_NUDGES)
  const toast = useToast()

  useEffect(() => {
    void (async () => {
      const [ra, pn] = await Promise.all([
        ipc.settings.get<RAlert[]>('r_alerts'),
        ipc.settings.get<PreTradeNudgeConfig>('pretrade_nudges'),
      ])
      if (ra.ok && ra.data) setAlerts(ra.data)
      if (pn.ok && pn.data) setNudges(pn.data)
    })()
  }, [])

  async function saveNudges(updated: PreTradeNudgeConfig) {
    setNudges(updated)
    const res = await ipc.settings.set('pretrade_nudges', updated)
    if (!res.ok) toast('Save failed', 'error')
  }

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

      <div className="space-y-4 border-t border-border pt-6">
        <div>
          <h3 className="text-body font-semibold text-text-primary mb-1">Pre-trade nudges</h3>
          <p className="text-caption text-text-muted">
            Calm reminders in the New Trade panel when you may be trading on tilt or urgency. They
            never block a trade — your rules do that.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body-sm text-text-primary">Tilt watch</p>
              <p className="text-caption text-text-muted">Warn after a losing run.</p>
            </div>
            <button
              type="button"
              onClick={() =>
                void saveNudges({
                  ...nudges,
                  tilt: { ...nudges.tilt, enabled: !nudges.tilt.enabled },
                })
              }
              className={
                nudges.tilt.enabled
                  ? 'text-caption font-medium text-accent-a'
                  : 'text-caption font-medium text-text-muted'
              }
            >
              {nudges.tilt.enabled ? 'On' : 'Off'}
            </button>
          </div>
          {nudges.tilt.enabled && (
            <label className="flex items-center justify-between gap-3">
              <span className="text-caption text-text-secondary">Losing trades in a row</span>
              <input
                type="number"
                min={2}
                max={20}
                value={nudges.tilt.lossRun}
                onChange={(e) =>
                  void saveNudges({
                    ...nudges,
                    tilt: {
                      ...nudges.tilt,
                      lossRun: clampInt(parseInt(e.target.value, 10), 2, 20, nudges.tilt.lossRun),
                    },
                  })
                }
                className="w-20 rounded-[10px] border border-border bg-surface-elevated px-3 py-1.5 text-body text-text-primary focus:border-accent-a focus:outline-none"
              />
            </label>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body-sm text-text-primary">Urgency check</p>
              <p className="text-caption text-text-muted">
                Warn when your win-rate is worse at high urgency.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                void saveNudges({
                  ...nudges,
                  urgency: { ...nudges.urgency, enabled: !nudges.urgency.enabled },
                })
              }
              className={
                nudges.urgency.enabled
                  ? 'text-caption font-medium text-accent-a'
                  : 'text-caption font-medium text-text-muted'
              }
            >
              {nudges.urgency.enabled ? 'On' : 'Off'}
            </button>
          </div>
          {nudges.urgency.enabled && (
            <label className="flex items-center justify-between gap-3">
              <span className="text-caption text-text-secondary">Urgency level (1–10)</span>
              <input
                type="number"
                min={1}
                max={10}
                value={nudges.urgency.level}
                onChange={(e) =>
                  void saveNudges({
                    ...nudges,
                    urgency: {
                      ...nudges.urgency,
                      level: clampInt(parseInt(e.target.value, 10), 1, 10, nudges.urgency.level),
                    },
                  })
                }
                className="w-20 rounded-[10px] border border-border bg-surface-elevated px-3 py-1.5 text-body text-text-primary focus:border-accent-a focus:outline-none"
              />
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
