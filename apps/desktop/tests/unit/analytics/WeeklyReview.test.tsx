// WeeklyReview render tests — jsdom (default environment).
//
// Verifies the data-backed weekly digest: the stat grid populates from the
// analytics IPCs, the empty state shows when the week has no trades, and "Write
// review for this week" hands back the computed period + discipline score.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { WeeklyReview } from '../../../src/features/analytics/tabs/WeeklyReview'
import type {
  AnalyticsTotals,
  PerformanceStats,
  RuleAdherenceStats,
} from '../../../shared/types/index'

const EMPTY_TOTALS: AnalyticsTotals = {
  tradeCount: 0,
  winCount: 0,
  lossCount: 0,
  winRateBps: 0,
  expectancyR: 0,
  totalR: 0,
  netPnlCents: 0,
  netPnlPctBps: 0,
  profitFactor: 0,
  avgWinCents: 0,
  avgLossCents: 0,
}

function perf(tradeCount: number, netPnlCents: number): PerformanceStats {
  return {
    totals: {
      ...EMPTY_TOTALS,
      tradeCount,
      netPnlCents,
      winRateBps: 5000,
      totalR: 250,
      expectancyR: 30,
    },
    equityCurve: [],
    distribution: [],
    streaks: { currentKind: 'none', currentLen: 0, longestWin: 0, longestLoss: 0 },
    dailyHeatmap: [],
    maxDrawdownCents: 0,
    ddLimitCents: null,
  }
}

function adherence(scoreBps: number): RuleAdherenceStats {
  return {
    score: { cleanCount: 0, dirtyCount: 0, scoreBps, prevScoreBps: null, trendDirection: 'flat' },
    cleanVsDirty: { clean: EMPTY_TOTALS, dirty: EMPTY_TOTALS, avgPnlDiffCents: 0 },
    topBroken: [
      {
        ruleKey: 'no_sl_widening',
        count: 2,
        avgPnlCentsWhenBroken: 0,
        winRateBps: 0,
        netPnlCents: 0,
      },
    ],
    impactTable: [],
    blocked: { blockedCount: 0, projectedAvoidedCents: 0 },
    trendLine: [],
  }
}

let perfData: PerformanceStats
let adherenceData: RuleAdherenceStats

function ok<T>(data: T) {
  return Promise.resolve({ ok: true as const, data })
}

beforeEach(() => {
  vi.clearAllMocks()
  perfData = perf(5, 12300)
  adherenceData = adherence(8000)
  // @ts-expect-error — global augmentation not available in test env
  window.api = {
    analytics: {
      performance: () => ok(perfData),
      adherence: () => ok(adherenceData),
    },
    settings: { get: () => ok('monday'), set: vi.fn() },
  }
})

afterEach(() => {
  cleanup()
  // @ts-expect-error — global augmentation not available in test env
  delete window.api
})

describe('WeeklyReview', () => {
  it('populates the stat grid from the analytics IPCs', async () => {
    render(<WeeklyReview accountId="acct-1" onWriteReview={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('$123.00')).toBeDefined()
    })
    expect(screen.getByText('50.00%')).toBeDefined() // win rate
    expect(screen.getByText('no sl widening')).toBeDefined() // top broken
  })

  it('shows the empty state when the week has no trades', async () => {
    perfData = perf(0, 0)
    render(<WeeklyReview accountId="acct-1" onWriteReview={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('weekly-review-empty')).toBeDefined()
    })
  })

  it('hands the computed period + discipline score to onWriteReview', async () => {
    const onWrite = vi.fn()
    render(<WeeklyReview accountId="acct-1" onWriteReview={onWrite} />)
    await waitFor(() => {
      expect(screen.getByText('$123.00')).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: /write review for this week/i }))
    expect(onWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        adherencePct: 80, // 8000 bps → 80%
        startIso: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        endIso: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })
})
