import { Waves, TrendingDown } from 'lucide-react'
import type { PreTradeSignals } from '../../../shared/types/index'

/**
 * Calm, mentor-voice pre-trade nudges (P3; CLAUDE.md §1 voice, §2.1 prevention).
 * Shown in the New Trade panel BEFORE the click, these are advisory only — the
 * rules engine remains the only thing that blocks a trade. Two signals:
 *
 *  - Tilt watch: the account is on a losing run at/above the configured length.
 *  - Urgency check: the current urgency is at/above the configured level AND this
 *    account's own win-rate is materially worse at that urgency.
 *
 * Presentational: it decides visibility from `signals` + the live `urgencyScore`
 * (so the urgency nudge reacts as the slider moves) and renders nothing when
 * neither applies — no empty container, no nagging.
 */
export function PreTradeNudges({
  signals,
  urgencyScore,
}: {
  signals: PreTradeSignals | null
  urgencyScore: number
}) {
  if (!signals) return null

  const showTilt = signals.tilt.enabled && signals.tilt.currentLossStreak >= signals.tilt.lossRun
  const showUrgency =
    signals.urgency.enabled && signals.urgency.sufficient && urgencyScore >= signals.urgency.level

  if (!showTilt && !showUrgency) return null

  return (
    <div className="space-y-2" data-testid="pre-trade-nudges">
      {showTilt && (
        <NudgeBanner
          icon={<TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.5} />}
          testId="nudge-tilt"
        >
          You&rsquo;re {signals.tilt.currentLossStreak} down in a row. This is where over-risking
          starts &mdash; hold your normal size and your plan.
        </NudgeBanner>
      )}
      {showUrgency && (
        <NudgeBanner
          icon={<Waves className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.5} />}
          testId="nudge-urgency"
        >
          Your win-rate falls from {signals.urgency.lowWinRatePct}% to{' '}
          {signals.urgency.highWinRatePct}% when urgency is {signals.urgency.level} or higher. Slow
          down before you size this.
        </NudgeBanner>
      )}
    </div>
  )
}

function NudgeBanner({
  icon,
  testId,
  children,
}: {
  icon: React.ReactNode
  testId: string
  children: React.ReactNode
}) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-[10px] border border-warning/35 bg-warning/10 px-3 py-2"
      data-testid={testId}
    >
      {icon}
      <p className="text-caption leading-relaxed text-text-secondary">{children}</p>
    </div>
  )
}
