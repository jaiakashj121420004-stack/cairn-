import { motion } from 'framer-motion'
import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { eventBus } from '../../lib/event-bus'
import { ipc } from '../../lib/ipc'
import type { LiveWarningItem } from '../../../shared/types/index'

/**
 * The persistent surface for Wave 4 live-detection breaches
 * (docs/broker-integration.md §5). While `BrokerWarningToasts` fires a transient
 * toast the instant a live position breaks a rule, this card is the durable record
 * of today's breaches — a stop widened, a target cut, size increased, an
 * over-trade, an entry outside the killzones, or a fill past the circuit breaker.
 *
 * These are DETECTIONS, not blocks (CLAUDE.md §2.1) — Cairn cannot stop an order
 * already live at the broker, so the copy states what happened; it never claims to
 * have prevented it. When today is clean, the card says so plainly (mentor voice,
 * §1) rather than hiding — a visible "clean" is itself reinforcement.
 *
 * Data comes from the lightweight `dashboard:getLiveWarnings` read, refetched on
 * mount, on account change, and on every `broker.warning` / trade mutation so it
 * stays current without re-running the heavy `getStats` aggregation.
 */

/** Concise, mentor-voice label per engine rule key; falls back to the key. */
const RULE_LABELS: Record<string, string> = {
  no_sl_widening: 'Stop widened',
  no_tp_narrowing: 'Target cut',
  position_size_matches_plan: 'Size increased',
  max_trades_per_day: 'Over-trade',
  require_killzone: 'Outside killzone',
  max_daily_loss_pct: 'Past circuit breaker',
  max_daily_loss_fixed: 'Past circuit breaker',
}

function ruleLabel(ruleKey: string): string {
  const known = RULE_LABELS[ruleKey]
  if (known) return known
  const spaced = ruleKey.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function LiveDisciplineCard({ accountId }: { accountId: string | null }) {
  const [warnings, setWarnings] = useState<LiveWarningItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(() => {
    if (!accountId) {
      setWarnings([])
      setLoaded(true)
      return
    }
    void ipc.dashboard.getLiveWarnings(accountId).then((r) => {
      if (r.ok) setWarnings(r.data)
      setLoaded(true)
    })
  }, [accountId])

  useEffect(() => {
    load()
  }, [load])

  // Refetch the instant a live breach is detected, or a trade mutates the day.
  useEffect(() => {
    const unsubs = [
      eventBus.on('broker.warning', () => load()),
      eventBus.on('trade.placed', () => load()),
      eventBus.on('trade.closed', () => load()),
    ]
    return () => unsubs.forEach((u) => u())
  }, [load])

  const count = warnings.length
  const clean = loaded && count === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
      className="glass overflow-hidden rounded-[18px]"
      data-testid="live-discipline-card"
    >
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <p className="text-body-sm font-semibold text-text-primary">Live Discipline · Today</p>
        {count > 0 && (
          <span
            className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-micro font-bold text-danger"
            data-testid="live-discipline-count"
          >
            {count} breach{count === 1 ? '' : 'es'}
          </span>
        )}
      </div>

      <div className="p-5">
        {clean ? (
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-accent-a" strokeWidth={1.5} />
            <p className="text-caption text-text-secondary">
              No live rule breaches today. Rules: clean.
            </p>
          </div>
        ) : (
          <ul className="space-y-3" data-testid="live-discipline-list">
            {warnings.map((w) => (
              <li key={w.id} className="flex items-start gap-2.5">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-body-sm font-medium text-text-primary">
                      {ruleLabel(w.ruleKey)}
                      {w.symbol ? (
                        <span className="ml-1.5 font-mono text-caption text-text-muted">
                          {w.symbol}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-micro text-text-muted/70">
                      {timeLabel(w.createdAt)}
                    </span>
                  </div>
                  {w.detail ? (
                    <p className="mt-0.5 text-caption leading-relaxed text-text-secondary">
                      {w.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  )
}
