// Display specs for the advanced-metrics grid (Sharpe, Sortino, drawdown,
// Kelly, SQN, day consistency, extremes & hold-time shape). Shared by the
// Dashboard's "Performance Metrics" grid and the Analytics -> Metrics tab so
// labels, formatting and tooltip copy can never drift between the two
// surfaces (both render the identical AdvancedMetrics DTO — see
// electron/services/analytics/advanced-metrics.ts).
//
// Every cell resolves to either a formatted value + an explanatory tooltip,
// or '—' + a tooltip naming the metric's actual data gate (mentor voice —
// direct and honest about *why* a number isn't shown yet, never a generic
// "needs more data" if the real reason is something else, e.g. "needs a
// loss" rather than "needs 10 trading days").
import type { AdvancedMetrics } from '@shared/types/index'
import { formatCents, formatPercent, formatRMultiple } from './formatters'

export interface MetricCellData {
  key: string
  label: string
  display: string
  tooltip: string
}

function formatRatioX100(x100: number): string {
  return (x100 / 100).toFixed(2)
}

function formatHoldMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function buildAdvancedMetricCells(m: AdvancedMetrics): MetricCellData[] {
  return [
    {
      key: 'sharpe',
      label: 'Sharpe Ratio',
      display: m.sharpeRatioX100.value !== null ? formatRatioX100(m.sharpeRatioX100.value) : '—',
      tooltip:
        m.sharpeRatioX100.value !== null
          ? 'Risk-adjusted return, annualized. Above 1 is good, above 2 is strong.'
          : 'Not enough data — needs 10+ trading days of closed trades.',
    },
    {
      key: 'sortino',
      label: 'Sortino Ratio',
      display: m.sortinoRatioX100.value !== null ? formatRatioX100(m.sortinoRatioX100.value) : '—',
      tooltip:
        m.sortinoRatioX100.value !== null
          ? 'Like Sharpe, but only penalizes downside volatility, not upside swings.'
          : 'Not enough data — needs 10+ trading days, including at least one losing day.',
    },
    {
      key: 'maxDrawdown',
      label: 'Max Drawdown',
      display: m.maxDrawdown.value !== null ? formatPercent(m.maxDrawdown.value.pctOfPeakBps) : '—',
      tooltip:
        m.maxDrawdown.value !== null
          ? `Largest peak-to-trough decline: ${formatCents(m.maxDrawdown.value.peakToTroughCents)} over ${m.maxDrawdown.value.durationDays} day${m.maxDrawdown.value.durationDays === 1 ? '' : 's'}.`
          : 'Not enough data — needs at least one closed trade.',
    },
    {
      key: 'recoveryFactor',
      label: 'Recovery Factor',
      display:
        m.recoveryFactorX100.value !== null ? formatRatioX100(m.recoveryFactorX100.value) : '—',
      tooltip:
        m.recoveryFactorX100.value !== null
          ? 'Net profit divided by max drawdown. Higher means faster recovery from losses.'
          : 'Not enough data — no drawdown recorded yet to divide by.',
    },
    {
      key: 'kelly',
      label: 'Kelly %',
      display: m.kellyPctBps.value !== null ? formatPercent(m.kellyPctBps.value) : '—',
      tooltip:
        m.kellyPctBps.value !== null
          ? 'Theoretical optimal risk per trade from your win rate and payoff ratio. A guide, not a rule — most traders risk a fraction of it.'
          : 'Not enough data — needs at least one win and one loss.',
    },
    {
      key: 'sqn',
      label: 'SQN',
      display: m.sqnX100.value !== null ? formatRatioX100(m.sqnX100.value) : '—',
      tooltip:
        m.sqnX100.value !== null
          ? 'System Quality Number — edge consistency from your R distribution. Above 2 is good, above 3 is excellent.'
          : 'Not enough data — needs 10+ closed trades with some variation in R.',
    },
    {
      key: 'dayConsistency',
      label: 'Day Consistency',
      display: m.dayConsistencyBps.value !== null ? formatPercent(m.dayConsistencyBps.value) : '—',
      tooltip:
        m.dayConsistencyBps.value !== null
          ? 'Share of profit not concentrated in your single best day — the prop-firm consistency measure. Higher is more evenly spread.'
          : 'Not enough data — needs at least one profitable trading day.',
    },
    {
      key: 'largestWin',
      label: 'Largest Win',
      display: m.largestWin.value !== null ? formatCents(m.largestWin.value.cents) : '—',
      tooltip:
        m.largestWin.value !== null
          ? `Your best single trade (${formatRMultiple(m.largestWin.value.r)}).`
          : 'No winning trades yet.',
    },
    {
      key: 'largestLoss',
      label: 'Largest Loss',
      display: m.largestLoss.value !== null ? formatCents(m.largestLoss.value.cents) : '—',
      tooltip:
        m.largestLoss.value !== null
          ? `Your worst single trade (${formatRMultiple(m.largestLoss.value.r)}).`
          : 'No losing trades yet.',
    },
    {
      key: 'stddevR',
      label: 'R Volatility',
      display: m.stddevRX100.value !== null ? `±${formatRatioX100(m.stddevRX100.value)}R` : '—',
      tooltip:
        m.stddevRX100.value !== null
          ? 'Spread of R outcomes. Lower means more predictable trade sizing.'
          : 'Not enough data — needs at least 2 closed trades.',
    },
    {
      key: 'holdWinners',
      label: 'Avg Hold — Winners',
      display:
        m.avgHoldMinutesWinners.value !== null
          ? formatHoldMinutes(m.avgHoldMinutesWinners.value)
          : '—',
      tooltip:
        m.avgHoldMinutesWinners.value !== null
          ? 'Average time in trade for winning trades.'
          : 'No winning trades with a recorded duration yet.',
    },
    {
      key: 'holdLosers',
      label: 'Avg Hold — Losers',
      display:
        m.avgHoldMinutesLosers.value !== null
          ? formatHoldMinutes(m.avgHoldMinutesLosers.value)
          : '—',
      tooltip:
        m.avgHoldMinutesLosers.value !== null
          ? 'Average time in trade for losing trades. Much longer than winners often means holding on to hope.'
          : 'No losing trades with a recorded duration yet.',
    },
  ]
}
