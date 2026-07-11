import { useEffect, useRef } from 'react'
import { useToast } from '../../components/ui'
import { eventBus } from '../../lib/event-bus'

/**
 * Surfaces live-detection breaches as calm, mentor-voice toasts (Wave 4,
 * docs/broker-integration.md §5).
 *
 * The broker ingest service emits `broker.warning` the instant a live position
 * diverges from the trader's plan in a way that breaks an account rule — a stop
 * widened, a target cut, size increased, an over-trade, an entry outside the
 * killzones, or a fill past the daily-loss circuit breaker. This component
 * (mounted inside the ToastProvider) turns each into a non-blocking `warning`
 * toast using the pre-written, mentor-voice `message` from the main process.
 *
 * These are DETECTIONS, not blocks (CLAUDE.md §2.1) — Cairn cannot stop an order
 * already live at the broker, so the toast never claims to. The persistent record
 * of the same breach lives on the Dashboard "Live discipline" card and at
 * reflection time (both read the `detected_live` rule_violations rows).
 *
 * Dedupe: the same `(tradeId, ruleKey)` breach is only toasted once per session,
 * mirroring the main-process persist dedup so a broker reconnect that replays the
 * opening event never re-toasts a warning the trader already saw.
 */

/** How long a live-warning toast stays up — long enough to read, then it clears
 *  (the Dashboard card is the durable surface). */
const WARNING_TOAST_MS = 8000

export function BrokerWarningToasts() {
  const toast = useToast()
  // Session-scoped set of (tradeId, ruleKey) already surfaced. A ref (not state)
  // so it never triggers a re-render or re-subscribes the effect.
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    return eventBus.on('broker.warning', (w) => {
      const key = `${w.tradeId}:${w.ruleKey}`
      if (seen.current.has(key)) return
      seen.current.add(key)
      toast(w.message, 'warning', WARNING_TOAST_MS)
    })
  }, [toast])

  return null
}
