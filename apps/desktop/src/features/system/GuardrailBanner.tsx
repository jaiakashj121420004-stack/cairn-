import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { eventBus } from '../../lib/event-bus'
import { ipc } from '../../lib/ipc'

/**
 * Persistent warning when a safety rule's stored configuration is malformed
 * and therefore not being enforced (electron/services/rules-engine/guardrail.ts
 * emits `guardrail.degraded` on a JSON parse failure of `account_rules.value`).
 *
 * This is deliberately NOT a toast: a degraded guardrail is an ongoing state,
 * not a moment-in-time event, so it stays on screen — dismissible per
 * occurrence — until the trader fixes it in Settings or a later cycle reports
 * it again. Mounted once at the app root (src/App.tsx), so it is visible
 * regardless of which page is open.
 */

interface DegradedGuardrail {
  ruleKey: string
  reason: string
  /** Distinguishes repeat reports of the same rule so dismissing one doesn't
   *  hide a later, fresh report of the same ruleKey. */
  seenAt: number
}

export function GuardrailBanner() {
  const [degraded, setDegraded] = useState<DegradedGuardrail[]>([])
  const labelsRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    void (async () => {
      const res = await ipc.rules.listAvailable()
      if (res.ok) {
        for (const r of res.data) labelsRef.current.set(r.key, r.label)
      }
    })()
  }, [])

  useEffect(() => {
    return eventBus.on('guardrail.degraded', (payload) => {
      setDegraded((prev) => [
        ...prev.filter((d) => d.ruleKey !== payload.ruleKey),
        { ruleKey: payload.ruleKey, reason: payload.reason, seenAt: Date.now() },
      ])
    })
  }, [])

  function dismiss(ruleKey: string): void {
    setDegraded((prev) => prev.filter((d) => d.ruleKey !== ruleKey))
  }

  if (degraded.length === 0) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-col gap-2 p-3">
      {degraded.map((d) => {
        const name = labelsRef.current.get(d.ruleKey) ?? d.ruleKey
        return (
          <div
            key={`${d.ruleKey}-${d.seenAt}`}
            className="mx-auto flex w-full max-w-2xl items-start gap-3 rounded-[10px] border border-warning/45 bg-surface-elevated px-4 py-3 shadow-[0_8px_28px_hsl(0_0%_0%/0.18)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="flex-1 text-body-sm text-text-primary">
              Safety rule &apos;{name}&apos; has invalid configuration and is not being enforced.
              Review it in Settings.
            </p>
            <button
              type="button"
              onClick={() => dismiss(d.ruleKey)}
              aria-label="Dismiss"
              className="shrink-0 rounded-md p-1 text-text-muted hover:bg-surface hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
