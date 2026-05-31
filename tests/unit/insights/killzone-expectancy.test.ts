// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { killzoneExpectancy } from '../../../electron/services/insights/killzone-expectancy'
import type { ClosedTrade } from '../../../electron/services/insights/types'

function trade(kzId: string | null, pnlR: number): ClosedTrade {
  return {
    id: Math.random().toString(),
    accountId: 'acc-1',
    setupId: 's1',
    setupName: 'OB',
    killzoneId: kzId,
    mode: 'live',
    pnlR,
    pnlCents: pnlR * 10,
    preUrgencyScore: 5,
    riskPctBps: 100,
    exitTime: Date.now(),
  }
}

describe('killzoneExpectancy', () => {
  it('returns null when fewer than 10 outside-killzone trades', () => {
    const trades = [
      ...Array.from({ length: 5 }, () => trade(null, -100)),
      ...Array.from({ length: 20 }, () => trade('kz-1', 200)),
    ]
    expect(killzoneExpectancy(trades)).toBeNull()
  })

  it('returns null when outside expectancy is zero or positive', () => {
    // 10 outside trades all winning
    const trades = Array.from({ length: 10 }, () => trade(null, 100))
    expect(killzoneExpectancy(trades)).toBeNull()
  })

  it('returns null when outside expectancy is exactly 0', () => {
    const trades = [
      ...Array.from({ length: 5 }, () => trade(null, 100)),
      ...Array.from({ length: 5 }, () => trade(null, -100)),
    ]
    expect(killzoneExpectancy(trades)).toBeNull()
  })

  it('returns insight when outside-KZ expectancy is negative with ≥10 trades', () => {
    const trades = [
      ...Array.from({ length: 10 }, () => trade(null, -150)),  // avg = -150
      ...Array.from({ length: 10 }, () => trade('kz-1', 200)), // inside: positive
    ]
    const result = killzoneExpectancy(trades)
    expect(result).not.toBeNull()
    expect(result?.id).toBe('killzone-expectancy')
    expect(result?.body).toContain('-1.50R')
    expect(result?.sampleSize).toBe(10)
  })

  it('body includes inside-KZ expectancy when inside trades exist', () => {
    const trades = [
      ...Array.from({ length: 10 }, () => trade(null, -100)),
      ...Array.from({ length: 10 }, () => trade('kz-1', 200)),
    ]
    const result = killzoneExpectancy(trades)
    expect(result?.body).toContain('+2.00R')  // inside avg
  })

  it('body does not mention inside expectancy when no inside trades', () => {
    const trades = Array.from({ length: 10 }, () => trade(null, -100))
    const result = killzoneExpectancy(trades)
    expect(result?.body).not.toContain('Inside killzones')
  })

  it('uses high severity when expectancy < -0.5R (outside < -50 hundredths)', () => {
    const trades = Array.from({ length: 10 }, () => trade(null, -200))  // -2R avg
    const result = killzoneExpectancy(trades)
    expect(result?.severity).toBe('high')
  })

  // ── Fast-check property ───────────────────────────────────────────────────
  it('property: if all trades are inside a killzone, returns null', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -500, max: 500 }), { minLength: 0, maxLength: 50 }),
        (pnlRs) => {
          const trades = pnlRs.map((r, i) => ({ ...trade('kz-1', r), id: String(i) }))
          return killzoneExpectancy(trades) === null
        },
      ),
      { numRuns: 300 },
    )
  })
})
