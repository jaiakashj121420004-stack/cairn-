// @vitest-environment node
//
// Pure tests for the local week-range helper. Assertions use weekday/offset
// invariants rather than hard-coded calendar dates, so they hold regardless of
// what weekday the reference date happens to fall on.
import { describe, it, expect } from 'vitest'
import { getWeekRange } from '../../../src/lib/week-range'

const REF = new Date(2026, 6, 8, 15, 30) // 2026-07-08 15:30 local

describe('getWeekRange', () => {
  it('starts on Monday at 00:00 when weekStartsOn=1', () => {
    const start = new Date(getWeekRange(REF, 1).start)
    expect(start.getDay()).toBe(1)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
  })

  it('starts on Sunday when weekStartsOn=0', () => {
    expect(new Date(getWeekRange(REF, 0).start).getDay()).toBe(0)
  })

  it('ends on the last day of the week at 23:59', () => {
    const mon = getWeekRange(REF, 1)
    const sun = getWeekRange(REF, 0)
    expect(new Date(mon.end).getDay()).toBe(0) // Monday-start week ends Sunday
    expect(new Date(sun.end).getDay()).toBe(6) // Sunday-start week ends Saturday
    expect(new Date(mon.end).getHours()).toBe(23)
  })

  it('contains the reference date', () => {
    const r = getWeekRange(REF, 1)
    expect(r.start).toBeLessThanOrEqual(REF.getTime())
    expect(r.end).toBeGreaterThanOrEqual(REF.getTime())
  })

  it('offsetWeeks shifts the window by whole weeks', () => {
    const cur = getWeekRange(REF, 1, 0)
    const prev = getWeekRange(REF, 1, -1)
    expect(Math.round((cur.start - prev.start) / 86_400_000)).toBe(7)
  })

  it('spans just under 7 local days', () => {
    const r = getWeekRange(REF, 1)
    const days = (r.end - r.start) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7)
  })

  it('produces local YYYY-MM-DD ISO strings', () => {
    const r = getWeekRange(REF, 1)
    expect(r.startIso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.endIso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
