// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { tiltCycle } from '../../../electron/services/insights/tilt-cycle'
import type { ClosedTrade } from '../../../electron/services/insights/types'

const DEFAULT_RISK = 100 // 1% in bps

function trade(pnlR: number, riskPctBps = DEFAULT_RISK, dayOffset = 0): ClosedTrade {
  // Recent trades: within last 30 days
  const now = Date.now()
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
    riskPctBps,
    exitTime: now - dayOffset * 86_400_000,
  }
}

// Build a sequence: [loss, loss, loss, over-risk] within last 30 days
function tiltSequence(dayOffset = 0): ClosedTrade[] {
  const base = dayOffset * 86_400_000
  const now = Date.now()
  return [
    { ...trade(-100), exitTime: now - base - 4000 },
    { ...trade(-100), exitTime: now - base - 3000 },
    { ...trade(-100), exitTime: now - base - 2000 },
    { ...trade(50, DEFAULT_RISK * 2), exitTime: now - base - 1000 }, // 2× risk
  ]
}

describe('tiltCycle', () => {
  it('returns null when defaultRiskPctBps is 0', () => {
    const trades = tiltSequence()
    expect(tiltCycle(trades, 0)).toBeNull()
  })

  it('returns null when fewer than 2 tilt cycles in last 30 days', () => {
    // 1 occurrence → null
    const trades = tiltSequence(0)
    expect(tiltCycle(trades, DEFAULT_RISK)).toBeNull()
  })

  it('returns insight when ≥ 2 tilt cycles in last 30 days', () => {
    const trades = [
      ...tiltSequence(0), // cycle 1: recent
      ...tiltSequence(1), // cycle 2: yesterday
    ]
    const result = tiltCycle(trades, DEFAULT_RISK)
    expect(result).not.toBeNull()
    expect(result?.id).toBe('tilt-cycle')
    expect(result?.body).toContain('2 tilt cycle')
  })

  it('old cycles (> 30 days ago) do not count toward the 30-day threshold', () => {
    // 2 cycles but both > 30 days ago
    const old = [...tiltSequence(35), ...tiltSequence(40)]
    expect(tiltCycle(old, DEFAULT_RISK)).toBeNull()
  })

  it('body includes 60d and 90d counts', () => {
    const trades = [
      ...tiltSequence(0),
      ...tiltSequence(1),
      ...tiltSequence(45), // visible in 60d and 90d counts
    ]
    const result = tiltCycle(trades, DEFAULT_RISK)
    expect(result?.body).toContain('60 d')
    expect(result?.body).toContain('90 d')
  })

  it('uses high severity when ≥ 4 cycles in last 30 days', () => {
    const trades = [...tiltSequence(0), ...tiltSequence(1), ...tiltSequence(2), ...tiltSequence(3)]
    const result = tiltCycle(trades, DEFAULT_RISK)
    expect(result?.severity).toBe('high')
  })

  // ── Fast-check property ───────────────────────────────────────────────────
  it('property: if no three consecutive losses exist, returns null', () => {
    fc.assert(
      fc.property(
        fc.array(
          // Always winning trades — no consecutive loss run possible
          fc.record({ r: fc.integer({ min: 1, max: 500 }) }),
          { minLength: 0, maxLength: 40 },
        ),
        (items) => {
          const now = Date.now()
          const trades: ClosedTrade[] = items.map((item, i) => ({
            ...trade(item.r),
            id: String(i),
            exitTime: now - i * 1000,
          }))
          return tiltCycle(trades, DEFAULT_RISK) === null
        },
      ),
      { numRuns: 300 },
    )
  })
})
