// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { urgencyHurts } from '../../../electron/services/insights/urgency-hurts'
import type { ClosedTrade } from '../../../electron/services/insights/types'

function trade(urgency: number, win: boolean): ClosedTrade {
  return {
    id: Math.random().toString(),
    accountId: 'acc-1',
    setupId: 's1',
    setupName: 'OB',
    killzoneId: 'kz-1',
    mode: 'live',
    pnlR: win ? 200 : -100,
    pnlCents: win ? 5000 : -2500,
    preUrgencyScore: urgency,
    riskPctBps: 100,
    exitTime: Date.now(),
  }
}

function fill(n: number, urgency: number, win: boolean): ClosedTrade[] {
  return Array.from({ length: n }, () => trade(urgency, win))
}

describe('urgencyHurts', () => {
  it('returns null when fewer than 10 low-urgency trades', () => {
    const trades = [
      ...fill(5, 4, true),   // only 5 low-urgency
      ...fill(15, 8, false),
    ]
    expect(urgencyHurts(trades)).toBeNull()
  })

  it('returns null when fewer than 10 high-urgency trades', () => {
    const trades = [
      ...fill(15, 4, true),
      ...fill(5, 8, false),   // only 5 high-urgency
    ]
    expect(urgencyHurts(trades)).toBeNull()
  })

  it('returns null when delta ≤ 10 percentage points', () => {
    // 60% win rate in both buckets → delta = 0
    const trades = [
      ...fill(6, 4, true), ...fill(4, 4, false),    // 60% win at low urgency
      ...fill(6, 8, true), ...fill(4, 8, false),    // 60% win at high urgency
    ]
    expect(urgencyHurts(trades)).toBeNull()
  })

  it('returns insight when delta > 10pp and both buckets ≥ 10', () => {
    // Low urgency: 80% win (8/10), high urgency: 30% win (3/10) → delta = 50pp
    const trades = [
      ...fill(8, 3, true), ...fill(2, 3, false),   // low urg: 80%
      ...fill(3, 9, true), ...fill(7, 9, false),   // high urg: 30%
    ]
    const result = urgencyHurts(trades)
    expect(result).not.toBeNull()
    expect(result?.id).toBe('urgency-hurts')
    expect(result?.severity).toBe('high')  // delta 50 > 20 → high
    expect(result?.body).toContain('80%')
    expect(result?.body).toContain('30%')
    expect(result?.sampleSize).toBe(20)
  })

  it('uses medium severity when delta is 11–20 pp', () => {
    // Low urgency: 70%, high urgency: 55% → delta = 15pp
    const trades = [
      ...fill(7, 3, true), ...fill(3, 3, false),   // 70%
      ...fill(6, 9, true), ...fill(4, 9, false),   // 60% — actually 60, not 55
    ]
    // 70 - 60 = 10, exactly 10 → null (not > 10)
    expect(urgencyHurts(trades)).toBeNull()

    // 80% vs 65% → delta = 15
    const trades2 = [
      ...fill(8, 3, true), ...fill(2, 3, false),   // 80%
      ...fill(6, 9, true), ...fill(4, 9, false),   // 60% → delta 20
    ]
    // delta = 20 → exactly 20 is NOT > 20, so medium
    const r2 = urgencyHurts(trades2)
    expect(r2).not.toBeNull()
    expect(r2?.severity).toBe('medium')
  })

  it('urgency 6 is neither low (≤5) nor high (≥7) — ignored', () => {
    const trades = [
      ...fill(8, 4, true), ...fill(2, 4, false),   // low urgency: 80%
      ...fill(10, 6, false),                         // neutral urgency 6
      ...fill(3, 8, true), ...fill(7, 8, false),   // high urgency: 30%
    ]
    const result = urgencyHurts(trades)
    expect(result).not.toBeNull()
    // Should only see 10 low + 10 high
    expect(result?.body).toContain('10/10 trades each')
  })

  // ── Fast-check property ───────────────────────────────────────────────────
  it('property: if no trades have urgency ≥ 7, returns null', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            urgency: fc.integer({ min: 1, max: 6 }),
            win:     fc.boolean(),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        (items) => {
          const trades: ClosedTrade[] = items.map((item, i) => ({
            ...trade(item.urgency, item.win),
            id: String(i),
          }))
          return urgencyHurts(trades) === null
        },
      ),
      { numRuns: 300 },
    )
  })
})
