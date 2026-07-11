// LiveDisciplineCard render tests — jsdom (default environment).
//
// Verifies the Dashboard "Live discipline" card: the clean/all-good state when
// there are no live breaches today, the breach list (rule label + symbol + detail)
// when there are, and that it refetches when a `broker.warning` event fires so a
// breach detected while the dashboard is open appears without a manual reload.
//
// window.api is stubbed with a controllable `events` registry (so we can fire the
// push event) and a `dashboard.getLiveWarnings` reader (a spy backed by a mutable
// fixture) so we can also assert it is NOT called when there is no account.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import { LiveDisciplineCard } from '../../../src/features/dashboard/LiveDisciplineCard'
import type { LiveWarningItem } from '../../../shared/types/index'

type Listener = (payload: unknown) => void

function warning(overrides: Partial<LiveWarningItem> = {}): LiveWarningItem {
  return {
    id: 'v-1',
    tradeId: 't-1',
    ruleKey: 'no_sl_widening',
    symbol: 'EURUSD',
    detail: 'Stop moved from the planned 1.0850 to 1.0820, further from entry.',
    createdAt: Date.UTC(2026, 6, 11, 14, 30),
    ...overrides,
  }
}

let current: LiveWarningItem[]
let listeners: Map<string, Set<Listener>>
let getLiveWarnings: ReturnType<typeof vi.fn>

function emit(name: string, payload: unknown) {
  listeners.get(name)?.forEach((cb) => cb(payload))
}

beforeEach(() => {
  vi.clearAllMocks()
  current = []
  listeners = new Map()
  getLiveWarnings = vi.fn(() => Promise.resolve({ ok: true as const, data: current }))
  // @ts-expect-error — global augmentation not available in test env
  window.api = {
    dashboard: {
      getStats: vi.fn(),
      getLiveWarnings,
    },
    events: {
      on: (name: string, cb: Listener): (() => void) => {
        let set = listeners.get(name)
        if (!set) {
          set = new Set()
          listeners.set(name, set)
        }
        set.add(cb)
        return () => listeners.get(name)?.delete(cb)
      },
      off: (name: string, cb: Listener): void => {
        listeners.get(name)?.delete(cb)
      },
    },
  }
})

afterEach(() => {
  cleanup()
  // @ts-expect-error — global augmentation not available in test env
  delete window.api
})

describe('LiveDisciplineCard', () => {
  it('shows the clean state when there are no live breaches today', async () => {
    render(<LiveDisciplineCard accountId="acct-1" />)
    await waitFor(() => {
      expect(screen.getByText(/No live rule breaches today/)).toBeDefined()
    })
    expect(screen.queryByTestId('live-discipline-count')).toBeNull()
  })

  it('lists a breach with a mentor-voice label, symbol, and detail', async () => {
    current = [warning()]
    render(<LiveDisciplineCard accountId="acct-1" />)

    await waitFor(() => {
      expect(screen.getByText('Stop widened')).toBeDefined()
    })
    expect(screen.getByText('EURUSD')).toBeDefined()
    expect(screen.getByText(/further from entry/)).toBeDefined()
    expect(screen.getByTestId('live-discipline-count').textContent).toContain('1 breach')
  })

  it('refetches when a broker.warning event fires', async () => {
    render(<LiveDisciplineCard accountId="acct-1" />)
    await waitFor(() => {
      expect(screen.getByText(/No live rule breaches today/)).toBeDefined()
    })

    // A live breach arrives while the dashboard is open.
    current = [warning({ ruleKey: 'no_tp_narrowing', detail: 'Target moved closer to entry.' })]
    act(() => {
      emit('broker.warning', warning({ ruleKey: 'no_tp_narrowing' }))
    })

    await waitFor(() => {
      expect(screen.getByText('Target cut')).toBeDefined()
    })
  })

  it('does not fetch when accountId is null (shows clean, no read)', async () => {
    render(<LiveDisciplineCard accountId={null} />)
    await waitFor(() => {
      expect(screen.getByText(/No live rule breaches today/)).toBeDefined()
    })
    expect(getLiveWarnings).not.toHaveBeenCalled()
  })
})
