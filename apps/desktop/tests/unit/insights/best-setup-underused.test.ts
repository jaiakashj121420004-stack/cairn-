// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { bestSetupUnderused } from '../../../electron/services/insights/best-setup-underused'
import type { ClosedTrade } from '../../../electron/services/insights/types'

let idCounter = 0
function trade(setupId: string, setupName: string, pnlR: number): ClosedTrade {
  return {
    id: String(idCounter++),
    accountId: 'acc-1',
    setupId,
    setupName,
    killzoneId: 'kz-1',
    mode: 'live',
    pnlR,
    pnlCents: pnlR * 10,
    preUrgencyScore: 5,
    riskPctBps: 100,
    exitTime: Date.now(),
  }
}

function setupTrades(id: string, name: string, n: number, pnlR: number): ClosedTrade[] {
  return Array.from({ length: n }, () => trade(id, name, pnlR))
}

describe('bestSetupUnderused', () => {
  beforeEach(() => {
    idCounter = 0
  })

  it('returns null for empty trade list', () => {
    expect(bestSetupUnderused([])).toBeNull()
  })

  it('returns null when all setups have < 10 trades', () => {
    const trades = [...setupTrades('s1', 'OB', 5, 200), ...setupTrades('s2', 'FVG', 5, 100)]
    expect(bestSetupUnderused(trades)).toBeNull()
  })

  it('returns null when best setup usage is ≥ 20%', () => {
    // s1: 10 trades (best), s2: 40 trades → s1 is 20%, not < 20%
    const trades = [...setupTrades('s1', 'OB', 10, 300), ...setupTrades('s2', 'FVG', 40, 50)]
    expect(bestSetupUnderused(trades)).toBeNull()
  })

  it('returns insight when best setup is < 20% and expectancy is highest', () => {
    // s1: 10 trades at 3R (best), s2: 80 trades at 0.5R (majority)
    // s1 usage = 10/90 ≈ 11%
    const trades = [
      ...setupTrades('s1', 'OB Reversal', 10, 300),
      ...setupTrades('s2', 'FVG', 80, 50),
    ]
    const result = bestSetupUnderused(trades)
    expect(result).not.toBeNull()
    expect(result?.id).toBe('best-setup-underused')
    expect(result?.body).toContain('OB Reversal')
    expect(result?.body).toContain('+3.00R')
    expect(result?.body).toContain('11%')
  })

  it('sampleSize is total trade count', () => {
    const trades = [...setupTrades('s1', 'OB', 10, 300), ...setupTrades('s2', 'FVG', 80, 50)]
    const result = bestSetupUnderused(trades)
    expect(result?.sampleSize).toBe(90)
  })

  it('ignores setups with null pnlR when computing expectancy', () => {
    // s1: 5 trades at 300 + 5 at null → only 5 non-null → below 10-trade threshold
    const trades = [
      ...Array.from({ length: 5 }, () => ({ ...trade('s1', 'OB', 300) })),
      ...Array.from({ length: 5 }, () => ({ ...trade('s1', 'OB', 300), pnlR: null })),
      ...setupTrades('s2', 'FVG', 80, 50),
    ]
    // s1 has 10 total trades but only 5 with pnlR — expectancy is computed from 5 values
    // The heuristic checks n (total) >= 10, so this still qualifies
    const result = bestSetupUnderused(trades)
    expect(result).not.toBeNull()
  })

  // ── Fast-check property ───────────────────────────────────────────────────
  it('property: if all setups have < 10 trades, returns null', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            setupIdx: fc.integer({ min: 0, max: 4 }),
            pnlR: fc.integer({ min: -200, max: 400 }),
          }),
          { minLength: 0, maxLength: 45 }, // max 9 per setup if evenly distributed
        ),
        (items) => {
          idCounter = 0
          // Give each item a distinct setup so max per setup < 10
          const setups = ['A', 'B', 'C', 'D', 'E']
          const trades: ClosedTrade[] = items.map((item, i) => ({
            ...trade(setups[item.setupIdx] ?? 'A', setups[item.setupIdx] ?? 'A', item.pnlR),
            id: String(i),
          }))
          // By construction, max per setup is < 10 only if each bucket < 10.
          // Enforce that invariant:
          const counts = new Map<string, number>()
          for (const t of trades) counts.set(t.setupId, (counts.get(t.setupId) ?? 0) + 1)
          if ([...counts.values()].some((c) => c >= 10)) return true // skip this case
          return bestSetupUnderused(trades) === null
        },
      ),
      { numRuns: 300 },
    )
  })
})
