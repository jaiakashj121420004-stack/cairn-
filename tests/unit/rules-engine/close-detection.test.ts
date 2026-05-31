// @vitest-environment node
//
// Pure-detector unit suites for close-time planned-vs-actual detection.
// One describe-block (suite) per detector, per the Wave 2 item 4 spec.

import { describe, it, expect } from 'vitest'
import {
  detectSlWidened,
  detectTpNarrowed,
  detectRiskIncreased,
  detectOutsideKillzone,
  detectDailyLimitExceeded,
  detectCircuitBreakerBypassed,
} from '../../../electron/services/rules-engine/close-detection'
import { makeKillzones } from './_helpers'

// 1. SL widened ────────────────────────────────────────────────────────────────
describe('detectSlWidened', () => {
  it('long: actual stop below the plan is widening', () => {
    expect(detectSlWidened({ direction: 'long', plannedSl: 107900, actualSl: 107800 })).toBe(true)
  })
  it('long: actual stop above the plan (trail to profit) is not widening', () => {
    expect(detectSlWidened({ direction: 'long', plannedSl: 107900, actualSl: 107950 })).toBe(false)
  })
  it('long: equal stop is not widening', () => {
    expect(detectSlWidened({ direction: 'long', plannedSl: 107900, actualSl: 107900 })).toBe(false)
  })
  it('short: actual stop above the plan is widening', () => {
    expect(detectSlWidened({ direction: 'short', plannedSl: 108100, actualSl: 108250 })).toBe(true)
  })
  it('short: actual stop below the plan is not widening', () => {
    expect(detectSlWidened({ direction: 'short', plannedSl: 108100, actualSl: 108000 })).toBe(false)
  })
})

// 2. TP narrowed ─────────────────────────────────────────────────────────────
describe('detectTpNarrowed', () => {
  it('long: actual target below the plan (toward entry) is narrowing', () => {
    expect(detectTpNarrowed({ direction: 'long', plannedTp: 108200, actualTp: 108050 })).toBe(true)
  })
  it('long: actual target above the plan (extended) is not narrowing', () => {
    expect(detectTpNarrowed({ direction: 'long', plannedTp: 108200, actualTp: 108400 })).toBe(false)
  })
  it('short: actual target above the plan (toward entry) is narrowing', () => {
    expect(detectTpNarrowed({ direction: 'short', plannedTp: 107800, actualTp: 107900 })).toBe(true)
  })
  it('short: actual target below the plan (extended) is not narrowing', () => {
    expect(detectTpNarrowed({ direction: 'short', plannedTp: 107800, actualTp: 107700 })).toBe(false)
  })
})

// 3. Risk increased ──────────────────────────────────────────────────────────
describe('detectRiskIncreased', () => {
  it('flags when actual exceeds planned by more than the threshold', () => {
    expect(
      detectRiskIncreased({ plannedRiskCents: 10000, actualRiskCents: 11001, thresholdPct: 10 }),
    ).toBe(true)
  })
  it('does not flag at exactly the threshold (must exceed)', () => {
    expect(
      detectRiskIncreased({ plannedRiskCents: 10000, actualRiskCents: 11000, thresholdPct: 10 }),
    ).toBe(false)
  })
  it('does not flag below the threshold', () => {
    expect(
      detectRiskIncreased({ plannedRiskCents: 10000, actualRiskCents: 10999, thresholdPct: 10 }),
    ).toBe(false)
  })
  it('does not flag a risk decrease', () => {
    expect(
      detectRiskIncreased({ plannedRiskCents: 10000, actualRiskCents: 8000, thresholdPct: 10 }),
    ).toBe(false)
  })
  it('returns false when planned risk is zero (no baseline)', () => {
    expect(
      detectRiskIncreased({ plannedRiskCents: 0, actualRiskCents: 5000, thresholdPct: 10 }),
    ).toBe(false)
  })
})

// 4. Outside killzone ────────────────────────────────────────────────────────
describe('detectOutsideKillzone', () => {
  const killzones = makeKillzones() // London 07-10, NY 12-15, Asia 00-05 (UTC)
  it('inside London killzone → not outside', () => {
    const entryTs = Date.UTC(2026, 3, 20, 8, 30)
    expect(detectOutsideKillzone({ entryTs, killzones })).toBe(false)
  })
  it('between killzones → outside', () => {
    const entryTs = Date.UTC(2026, 3, 20, 11, 0)
    expect(detectOutsideKillzone({ entryTs, killzones })).toBe(true)
  })
  it('no killzones configured → outside', () => {
    expect(detectOutsideKillzone({ entryTs: Date.UTC(2026, 3, 20, 8, 30), killzones: [] })).toBe(true)
  })
})

// 5. Daily limit exceeded ────────────────────────────────────────────────────
describe('detectDailyLimitExceeded', () => {
  it('the (N+1)-th trade exceeds an N-trade limit', () => {
    expect(detectDailyLimitExceeded({ priorTradeCountToday: 3, maxTrades: 3 })).toBe(true)
  })
  it('the N-th trade is within an N-trade limit', () => {
    expect(detectDailyLimitExceeded({ priorTradeCountToday: 2, maxTrades: 3 })).toBe(false)
  })
  it('the first trade of the day never exceeds', () => {
    expect(detectDailyLimitExceeded({ priorTradeCountToday: 0, maxTrades: 3 })).toBe(false)
  })
  it('a zero/disabled limit never flags', () => {
    expect(detectDailyLimitExceeded({ priorTradeCountToday: 5, maxTrades: 0 })).toBe(false)
  })
})

// 6. Circuit breaker bypassed ────────────────────────────────────────────────
describe('detectCircuitBreakerBypassed', () => {
  it('not flagged when the session was never locked', () => {
    expect(detectCircuitBreakerBypassed({ sessionLockedAt: null, tradeCreatedAt: 2000 })).toBe(false)
  })
  it('flagged when the lock preceded the trade', () => {
    expect(detectCircuitBreakerBypassed({ sessionLockedAt: 1000, tradeCreatedAt: 2000 })).toBe(true)
  })
  it('not flagged when the lock came after the trade (this trade tripped it)', () => {
    expect(detectCircuitBreakerBypassed({ sessionLockedAt: 2000, tradeCreatedAt: 1000 })).toBe(false)
  })
  it('flagged when locked at the same instant the trade was opened', () => {
    expect(detectCircuitBreakerBypassed({ sessionLockedAt: 1500, tradeCreatedAt: 1500 })).toBe(true)
  })
})
