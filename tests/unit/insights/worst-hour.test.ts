// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { worstHour } from '../../../electron/services/insights/worst-hour'
import type { ClosedTrade } from '../../../electron/services/insights/types'

const UTC = 'UTC'

/** Build a trade whose exit time falls at the given UTC hour on 2024-01-15. */
function tradeAt(hourUtc: number, pnlR: number): ClosedTrade {
  return {
    id: Math.random().toString(),
    accountId: 'acc-1',
    setupId: 's1',
    setupName: 'OB',
    killzoneId: 'kz-1',
    mode: 'live',
    pnlR,
    pnlCents: pnlR * 10,
    preUrgencyScore: 5,
    riskPctBps: 100,
    exitTime: new Date(`2024-01-15T${String(hourUtc).padStart(2, '0')}:30:00Z`).getTime(),
  }
}

describe('worstHour', () => {
  it('returns null for empty trades', () => {
    expect(worstHour([], UTC)).toBeNull()
  })

  it('returns null when all hours have < 5 trades', () => {
    const trades = Array.from({ length: 4 }, () => tradeAt(9, -100))
    expect(worstHour(trades, UTC)).toBeNull()
  })

  it('returns null when worst hour expectancy is ≥ 0', () => {
    const trades = Array.from({ length: 5 }, () => tradeAt(9, 100))
    expect(worstHour(trades, UTC)).toBeNull()
  })

  it('returns insight when worst hour expectancy is negative with ≥5 trades', () => {
    const trades = Array.from({ length: 5 }, () => tradeAt(9, -200))
    const result = worstHour(trades, UTC)
    expect(result).not.toBeNull()
    expect(result?.id).toBe('worst-hour')
    expect(result?.body).toContain('9am')
    expect(result?.body).toContain('-2.00R')
    expect(result?.sampleSize).toBe(5)
  })

  it('picks the hour with the lowest (worst) expectancy', () => {
    const trades = [
      ...Array.from({ length: 5 }, () => tradeAt(9, -100)),   // -1R avg
      ...Array.from({ length: 5 }, () => tradeAt(14, -300)),  // -3R avg (worse)
    ]
    const result = worstHour(trades, UTC)
    expect(result?.body).toContain('2pm')  // 14:00 → 2pm
    expect(result?.body).toContain('-3.00R')
  })

  it('uses high severity when expectancy < -50 hundredths (< -0.5R)', () => {
    const trades = Array.from({ length: 5 }, () => tradeAt(3, -300)) // -3R
    expect(worstHour(trades, UTC)?.severity).toBe('high')
  })

  it('uses medium severity when expectancy is between -50 and 0', () => {
    const trades = Array.from({ length: 5 }, () => tradeAt(3, -30)) // -0.3R
    expect(worstHour(trades, UTC)?.severity).toBe('medium')
  })

  it('formats midnight as 12am', () => {
    const trades = Array.from({ length: 5 }, () => tradeAt(0, -100))
    expect(worstHour(trades, UTC)?.body).toContain('12am')
  })

  it('formats noon as 12pm', () => {
    const trades = Array.from({ length: 5 }, () => tradeAt(12, -100))
    expect(worstHour(trades, UTC)?.body).toContain('12pm')
  })

  // ── Fast-check property ───────────────────────────────────────────────────
  it('property: if all hours have expectancyR ≥ 0, returns null', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            hour: fc.integer({ min: 0, max: 23 }),
            pnlR: fc.integer({ min: 0, max: 500 }),  // always non-negative
          }),
          { minLength: 0, maxLength: 100 },
        ),
        (items) => {
          const trades = items.map((item, i) => ({ ...tradeAt(item.hour, item.pnlR), id: String(i) }))
          return worstHour(trades, UTC) === null
        },
      ),
      { numRuns: 300 },
    )
  })
})
