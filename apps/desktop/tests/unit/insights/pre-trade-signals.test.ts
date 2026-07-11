// @vitest-environment node
//
// Pure-logic tests for the pre-trade psychology signals (P3). Covers config
// parsing/clamping, the current-loss-streak scan, the urgency win-rate split, and
// the combined assembly. All inputs are plain arrays — no DB, no Electron.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PRETRADE_NUDGES,
  computePreTradeSignals,
  currentLossStreak,
  parsePreTradeNudgeConfig,
  urgencySplit,
} from '../../../electron/services/insights/pre-trade-signals'
import type { PreTradeSignalTrade } from '../../../electron/services/insights/pre-trade-signals'

function trade(pnlR: number | null, urgency: number, exitTime: number): PreTradeSignalTrade {
  return { pnlR, preUrgencyScore: urgency, exitTime }
}

// Build N trades in a bucket with a given win-rate, ordered arbitrarily.
function bucket(urgency: number, wins: number, losses: number): PreTradeSignalTrade[] {
  const out: PreTradeSignalTrade[] = []
  let t = 0
  for (let i = 0; i < wins; i++) out.push(trade(150, urgency, t++))
  for (let i = 0; i < losses; i++) out.push(trade(-100, urgency, t++))
  return out
}

describe('parsePreTradeNudgeConfig', () => {
  it('returns defaults for null / undefined', () => {
    expect(parsePreTradeNudgeConfig(null)).toEqual(DEFAULT_PRETRADE_NUDGES)
    expect(parsePreTradeNudgeConfig(undefined)).toEqual(DEFAULT_PRETRADE_NUDGES)
  })

  it('returns defaults for malformed JSON or non-object', () => {
    expect(parsePreTradeNudgeConfig('{not json')).toEqual(DEFAULT_PRETRADE_NUDGES)
    expect(parsePreTradeNudgeConfig('42')).toEqual(DEFAULT_PRETRADE_NUDGES)
    expect(parsePreTradeNudgeConfig('null')).toEqual(DEFAULT_PRETRADE_NUDGES)
  })

  it('fills missing fields from defaults', () => {
    const cfg = parsePreTradeNudgeConfig(JSON.stringify({ tilt: { enabled: false } }))
    expect(cfg.tilt.enabled).toBe(false)
    expect(cfg.tilt.lossRun).toBe(DEFAULT_PRETRADE_NUDGES.tilt.lossRun)
    expect(cfg.urgency).toEqual(DEFAULT_PRETRADE_NUDGES.urgency)
  })

  it('clamps out-of-range thresholds', () => {
    const cfg = parsePreTradeNudgeConfig(
      JSON.stringify({
        tilt: { enabled: true, lossRun: 999 },
        urgency: { enabled: true, level: 0 },
      }),
    )
    expect(cfg.tilt.lossRun).toBe(20) // LOSS_RUN_MAX
    expect(cfg.urgency.level).toBe(1) // URGENCY_LEVEL_MIN
  })

  it('rounds fractional thresholds', () => {
    const cfg = parsePreTradeNudgeConfig(JSON.stringify({ urgency: { level: 7.6 } }))
    expect(cfg.urgency.level).toBe(8)
  })
})

describe('currentLossStreak', () => {
  it('counts consecutive losses from the most recent trade', () => {
    const trades = [trade(200, 5, 1), trade(-100, 5, 2), trade(-50, 5, 3)]
    expect(currentLossStreak(trades)).toBe(2)
  })

  it('stops at the first win (newest-first)', () => {
    const trades = [trade(-100, 5, 1), trade(300, 5, 2), trade(-100, 5, 3)]
    expect(currentLossStreak(trades)).toBe(1)
  })

  it('is zero when the most recent trade is a win', () => {
    expect(currentLossStreak([trade(-100, 5, 1), trade(200, 5, 2)])).toBe(0)
  })

  it('treats a null result as ending the run', () => {
    const trades = [trade(-100, 5, 1), trade(null, 5, 2), trade(-100, 5, 3)]
    // newest is exitTime 3 (loss), then exitTime 2 (null) → stop
    expect(currentLossStreak(trades)).toBe(1)
  })

  it('is zero for no trades', () => {
    expect(currentLossStreak([])).toBe(0)
  })
})

describe('urgencySplit', () => {
  it('is sufficient when both buckets are large and the gap is material', () => {
    // low (< 7): 12 trades, ~75% wins; high (>= 7): 12 trades, ~25% wins
    const trades = [...bucket(3, 9, 3), ...bucket(8, 3, 9)]
    const s = urgencySplit(trades, 7)
    expect(s.lowSample).toBe(12)
    expect(s.highSample).toBe(12)
    expect(s.lowWinRatePct).toBeGreaterThan(s.highWinRatePct)
    expect(s.sufficient).toBe(true)
  })

  it('is insufficient on thin data', () => {
    const trades = [...bucket(3, 4, 1), ...bucket(8, 1, 4)]
    expect(urgencySplit(trades, 7).sufficient).toBe(false)
  })

  it('is insufficient when the gap is small even with a big sample', () => {
    const trades = [...bucket(3, 6, 6), ...bucket(8, 6, 6)]
    expect(urgencySplit(trades, 7).sufficient).toBe(false)
  })

  it('buckets at the boundary (< level vs >= level)', () => {
    const s = urgencySplit([trade(200, 7, 1), trade(-100, 6, 2)], 7)
    expect(s.highSample).toBe(1) // urgency 7 is high
    expect(s.lowSample).toBe(1) // urgency 6 is low
  })
})

describe('computePreTradeSignals', () => {
  it('assembles tilt + urgency signals with the config thresholds', () => {
    const trades = [trade(-100, 8, 1), trade(-100, 8, 2), trade(-100, 8, 3)]
    const signals = computePreTradeSignals(trades, {
      tilt: { enabled: true, lossRun: 3 },
      urgency: { enabled: false, level: 6 },
    })
    expect(signals.tilt).toEqual({ enabled: true, lossRun: 3, currentLossStreak: 3 })
    expect(signals.urgency.enabled).toBe(false)
    expect(signals.urgency.level).toBe(6)
  })
})
