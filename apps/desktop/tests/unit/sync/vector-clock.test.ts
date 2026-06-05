import { describe, expect, it } from 'vitest'

import {
  bumpClock,
  compareClocks,
  dominates,
  isConcurrent,
  mergeClocks,
  type VectorClock,
} from '@cairn/sync-protocol'

describe('compareClocks (docs/sync-protocol.md §3.1)', () => {
  it('equal clocks (absent component treated as 0)', () => {
    expect(compareClocks({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe('equal')
    expect(compareClocks({}, {})).toBe('equal')
    expect(compareClocks({ a: 0 }, {})).toBe('equal')
  })

  it('dominates / dominated are symmetric mirror results', () => {
    const newer: VectorClock = { a: 2, b: 1 }
    const older: VectorClock = { a: 1, b: 1 }
    expect(compareClocks(newer, older)).toBe('dominates')
    expect(compareClocks(older, newer)).toBe('dominated')
    expect(dominates(newer, older)).toBe(true)
    expect(dominates(older, newer)).toBe(false)
  })

  it('adding a brand-new device component dominates', () => {
    expect(compareClocks({ a: 1, c: 1 }, { a: 1 })).toBe('dominates')
  })

  it('concurrent: each has a component strictly greater than the other', () => {
    const a: VectorClock = { a: 2, b: 1 }
    const b: VectorClock = { a: 1, b: 2 }
    expect(compareClocks(a, b)).toBe('concurrent')
    expect(isConcurrent(a, b)).toBe(true)
    expect(dominates(a, b)).toBe(false)
    expect(dominates(b, a)).toBe(false)
  })

  it('disjoint device sets are concurrent (true conflict)', () => {
    expect(compareClocks({ a: 1 }, { b: 1 })).toBe('concurrent')
  })
})

describe('mergeClocks (pointwise max)', () => {
  it('takes the max of every component across both clocks', () => {
    expect(mergeClocks({ a: 2, b: 1 }, { a: 1, b: 3, c: 5 })).toEqual({ a: 2, b: 3, c: 5 })
  })

  it('the merge dominates (or equals) both inputs', () => {
    const a: VectorClock = { a: 2, b: 1 }
    const b: VectorClock = { a: 1, b: 2 }
    const merged = mergeClocks(a, b)
    expect(compareClocks(merged, a)).toBe('dominates')
    expect(compareClocks(merged, b)).toBe('dominates')
  })

  it('does not mutate its inputs', () => {
    const a: VectorClock = { a: 1 }
    const b: VectorClock = { b: 1 }
    mergeClocks(a, b)
    expect(a).toEqual({ a: 1 })
    expect(b).toEqual({ b: 1 })
  })
})

describe('bumpClock', () => {
  it('increments the named device, carrying others forward', () => {
    expect(bumpClock({ a: 1, b: 2 }, 'a')).toEqual({ a: 2, b: 2 })
  })

  it('introduces an absent device at 1', () => {
    expect(bumpClock({ a: 1 }, 'c')).toEqual({ a: 1, c: 1 })
  })

  it('the bumped clock dominates the original', () => {
    const before: VectorClock = { a: 1 }
    expect(dominates(bumpClock(before, 'a'), before)).toBe(true)
  })

  it('does not mutate its input', () => {
    const before: VectorClock = { a: 1 }
    bumpClock(before, 'a')
    expect(before).toEqual({ a: 1 })
  })
})
