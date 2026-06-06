import { describe, expect, it } from 'vitest'

import { VectorClockCache } from '../../../electron/services/sync'
import type { RecordClock } from '../../../electron/services/sync/clock'

const DEVICE = 'dev-this'

describe('VectorClockCache', () => {
  it('hydrates each record with its FULL persisted clock (every device component)', () => {
    const cache = new VectorClockCache(DEVICE)
    const source: RecordClock[] = [
      { tableName: 'trades', recordId: 'a', clock: { [DEVICE]: 3 } },
      { tableName: 'accounts', recordId: 'x', clock: { [DEVICE]: 1, 'dev-other': 4 } },
    ]
    cache.hydrate(() => source)
    expect(cache.isHydrated()).toBe(true)
    expect(cache.get('trades', 'a')).toEqual({ [DEVICE]: 3 })
    // A foreign component survives the round-trip — this is what prevents phantom conflicts.
    expect(cache.get('accounts', 'x')).toEqual({ [DEVICE]: 1, 'dev-other': 4 })
    expect(cache.size()).toBe(2)
  })

  it('an empty source yields an empty cache (existing-install default)', () => {
    const cache = new VectorClockCache(DEVICE)
    cache.hydrate(() => [])
    expect(cache.size()).toBe(0)
    expect(cache.get('trades', 'missing')).toEqual({})
  })

  it('does not confuse same record id across different tables', () => {
    const cache = new VectorClockCache(DEVICE)
    cache.hydrate(() => [
      { tableName: 'trades', recordId: 'id1', clock: { [DEVICE]: 5 } },
      { tableName: 'accounts', recordId: 'id1', clock: { [DEVICE]: 9 } },
    ])
    expect(cache.get('trades', 'id1')).toEqual({ [DEVICE]: 5 })
    expect(cache.get('accounts', 'id1')).toEqual({ [DEVICE]: 9 })
  })

  it('bumpLocal increments this device’s component', () => {
    const cache = new VectorClockCache(DEVICE)
    cache.hydrate(() => [{ tableName: 'trades', recordId: 'a', clock: { [DEVICE]: 2 } }])
    expect(cache.bumpLocal('trades', 'a')).toEqual({ [DEVICE]: 3 })
    expect(cache.get('trades', 'a')).toEqual({ [DEVICE]: 3 })
    // A previously-unseen record starts at 1.
    expect(cache.bumpLocal('trades', 'new')).toEqual({ [DEVICE]: 1 })
  })

  it('bumpLocal carries foreign components forward (restart-safe causality)', () => {
    const cache = new VectorClockCache(DEVICE)
    cache.hydrate(() => [
      { tableName: 'trades', recordId: 'a', clock: { [DEVICE]: 2, 'dev-other': 5 } },
    ])
    // A local edit on top of an absorbed remote history must keep dev-other:5, so the new
    // op dominates the remote one rather than appearing concurrent.
    expect(cache.bumpLocal('trades', 'a')).toEqual({ [DEVICE]: 3, 'dev-other': 5 })
  })

  it('mergeRemote takes the pointwise max and persists it', () => {
    const cache = new VectorClockCache(DEVICE)
    cache.hydrate(() => [{ tableName: 'trades', recordId: 'a', clock: { [DEVICE]: 2 } }])
    const merged = cache.mergeRemote('trades', 'a', { 'dev-other': 4, [DEVICE]: 1 })
    expect(merged).toEqual({ [DEVICE]: 2, 'dev-other': 4 })
    expect(cache.get('trades', 'a')).toEqual({ [DEVICE]: 2, 'dev-other': 4 })
  })

  it('re-hydration replaces prior state', () => {
    const cache = new VectorClockCache(DEVICE)
    cache.hydrate(() => [{ tableName: 'trades', recordId: 'a', clock: { [DEVICE]: 2 } }])
    cache.hydrate(() => [{ tableName: 'trades', recordId: 'b', clock: { [DEVICE]: 7 } }])
    expect(cache.get('trades', 'a')).toEqual({})
    expect(cache.get('trades', 'b')).toEqual({ [DEVICE]: 7 })
  })
})
