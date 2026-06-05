import { describe, expect, it } from 'vitest'

import { VectorClockCache } from '../../../electron/services/sync'
import type { RecordVersion } from '../../../electron/services/sync/clock'

const DEVICE = 'dev-this'

describe('VectorClockCache', () => {
  it('hydrates each record with this device’s version as its clock component', () => {
    const cache = new VectorClockCache(DEVICE)
    const source: RecordVersion[] = [
      { tableName: 'trades', recordId: 'a', version: 3 },
      { tableName: 'accounts', recordId: 'x', version: 1 },
    ]
    cache.hydrate(() => source)
    expect(cache.isHydrated()).toBe(true)
    expect(cache.get('trades', 'a')).toEqual({ [DEVICE]: 3 })
    expect(cache.get('accounts', 'x')).toEqual({ [DEVICE]: 1 })
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
      { tableName: 'trades', recordId: 'id1', version: 5 },
      { tableName: 'accounts', recordId: 'id1', version: 9 },
    ])
    expect(cache.get('trades', 'id1')).toEqual({ [DEVICE]: 5 })
    expect(cache.get('accounts', 'id1')).toEqual({ [DEVICE]: 9 })
  })

  it('bumpLocal increments this device’s component', () => {
    const cache = new VectorClockCache(DEVICE)
    cache.hydrate(() => [{ tableName: 'trades', recordId: 'a', version: 2 }])
    expect(cache.bumpLocal('trades', 'a')).toEqual({ [DEVICE]: 3 })
    expect(cache.get('trades', 'a')).toEqual({ [DEVICE]: 3 })
    // A previously-unseen record starts at 1.
    expect(cache.bumpLocal('trades', 'new')).toEqual({ [DEVICE]: 1 })
  })

  it('mergeRemote takes the pointwise max and persists it', () => {
    const cache = new VectorClockCache(DEVICE)
    cache.hydrate(() => [{ tableName: 'trades', recordId: 'a', version: 2 }])
    const merged = cache.mergeRemote('trades', 'a', { 'dev-other': 4, [DEVICE]: 1 })
    expect(merged).toEqual({ [DEVICE]: 2, 'dev-other': 4 })
    expect(cache.get('trades', 'a')).toEqual({ [DEVICE]: 2, 'dev-other': 4 })
  })

  it('re-hydration replaces prior state', () => {
    const cache = new VectorClockCache(DEVICE)
    cache.hydrate(() => [{ tableName: 'trades', recordId: 'a', version: 2 }])
    cache.hydrate(() => [{ tableName: 'trades', recordId: 'b', version: 7 }])
    expect(cache.get('trades', 'a')).toEqual({})
    expect(cache.get('trades', 'b')).toEqual({ [DEVICE]: 7 })
  })
})
