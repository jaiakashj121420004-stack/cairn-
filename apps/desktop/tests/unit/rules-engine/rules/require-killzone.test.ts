// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/require-killzone'
import { makeContext, makeDraft } from '../_helpers'

const LONDON_TS = Date.UTC(2026, 3, 20, 8, 30) // 08:30 UTC
const OUTSIDE_TS = Date.UTC(2026, 3, 20, 22, 0) // 22:00 UTC

describe('require_killzone', () => {
  it('passes when entry time is inside an allowed killzone by name', () => {
    const ctx = makeContext({
      tradeInProgress: makeDraft({ timestamp: LONDON_TS }),
      now: LONDON_TS,
    })
    const r = rule.evaluate(ctx, { zoneNames: ['London', 'NY AM'] })
    expect(r.passed).toBe(true)
  })

  it('blocks when entry time is outside any allowed killzone', () => {
    const ctx = makeContext({
      tradeInProgress: makeDraft({ timestamp: OUTSIDE_TS }),
      now: OUTSIDE_TS,
    })
    const r = rule.evaluate(ctx, { zoneNames: ['London'] })
    expect(r.passed).toBe(false)
    expect(r.severity).toBe('blocking')
  })

  it('edge: empty zones config → any killzone passes', () => {
    const ctx = makeContext({
      tradeInProgress: makeDraft({ timestamp: LONDON_TS }),
      now: LONDON_TS,
    })
    expect(rule.evaluate(ctx, {}).passed).toBe(true)
  })
})
