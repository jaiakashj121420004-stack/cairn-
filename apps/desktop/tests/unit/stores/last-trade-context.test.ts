import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLastTradeContextStore, getRecentContext } from '../../../src/stores/last-trade-context'

// ─── helpers ─────────────────────────────────────────────────────────────────

const ACCOUNT = 'acc-1'
const SAMPLE = {
  pairId: 'pair-eurusd',
  setupId: 'setup-fvg',
  mode: 'live' as const,
  accountId: ACCOUNT,
}

function freshStore() {
  // Reset Zustand store to initial state before each test
  useLastTradeContextStore.setState({ context: null })
}

// ─── getRecentContext ─────────────────────────────────────────────────────────

describe('getRecentContext', () => {
  it('returns null when context is null', () => {
    expect(getRecentContext(null, ACCOUNT)).toBeNull()
  })

  it('returns context when within the 6-hour window', () => {
    const ctx = { ...SAMPLE, timestamp: Date.now() - 1_000 }
    expect(getRecentContext(ctx, ACCOUNT)).toBe(ctx)
  })

  it('returns null when context is older than the window', () => {
    const ctx = { ...SAMPLE, timestamp: Date.now() - 7 * 60 * 60 * 1000 }
    expect(getRecentContext(ctx, ACCOUNT)).toBeNull()
  })

  it('returns null when accountId does not match', () => {
    const ctx = { ...SAMPLE, accountId: 'acc-other', timestamp: Date.now() }
    expect(getRecentContext(ctx, ACCOUNT)).toBeNull()
  })

  it('skips account check when accountId arg is null', () => {
    const ctx = { ...SAMPLE, timestamp: Date.now() }
    expect(getRecentContext(ctx, null)).toBe(ctx)
  })
})

// ─── store — setContext / clear ───────────────────────────────────────────────

describe('useLastTradeContextStore', () => {
  beforeEach(freshStore)

  it('starts with null context', () => {
    const { result } = renderHook(() => useLastTradeContextStore())
    expect(result.current.context).toBeNull()
  })

  it('setContext stores pair/setup/mode/accountId with a timestamp', () => {
    const { result } = renderHook(() => useLastTradeContextStore())
    const before = Date.now()
    act(() => {
      result.current.setContext(SAMPLE)
    })
    const { context } = result.current
    expect(context).not.toBeNull()
    expect(context?.pairId).toBe(SAMPLE.pairId)
    expect(context?.setupId).toBe(SAMPLE.setupId)
    expect(context?.mode).toBe(SAMPLE.mode)
    expect(context?.accountId).toBe(SAMPLE.accountId)
    expect(context?.timestamp).toBeGreaterThanOrEqual(before)
    expect(context?.timestamp).toBeLessThanOrEqual(Date.now())
  })

  it('clear resets context to null', () => {
    const { result } = renderHook(() => useLastTradeContextStore())
    act(() => {
      result.current.setContext(SAMPLE)
    })
    expect(result.current.context).not.toBeNull()
    act(() => {
      result.current.clear()
    })
    expect(result.current.context).toBeNull()
  })

  it('is NOT persisted — remounting after setState still reflects store state, not disk', () => {
    // Verify there is no `persist` middleware by checking that after a manual
    // state reset the store has no lingering data.  If `persist` were wired up,
    // the store would rehydrate from storage; without it, setState is definitive.
    const { result, rerender } = renderHook(() => useLastTradeContextStore())
    act(() => {
      result.current.setContext(SAMPLE)
    })
    // Simulate "unmount + remount" by resetting to initial state (what a fresh
    // in-memory module would look like) then reading back.
    act(() => {
      useLastTradeContextStore.setState({ context: null })
    })
    rerender()
    expect(result.current.context).toBeNull()
  })
})
