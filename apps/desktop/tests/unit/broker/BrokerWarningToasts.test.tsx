// BrokerWarningToasts render tests — jsdom (default environment).
//
// Verifies that a `broker.warning` event surfaces as a mentor-voice toast, that
// the same (tradeId, ruleKey) breach is only toasted once per session (mirroring
// the main-process persist dedup so a reconnect replay never re-toasts), and that
// a different rule on the same trade still surfaces.
//
// The only global stubbed is window.api — specifically its `events` channel, which
// we back with a real listener registry so the test can fire events by name.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import { BrokerWarningToasts } from '../../../src/features/broker/BrokerWarningToasts'
import { ToastProvider } from '../../../src/components/ui/toast'
import type { BrokerWarning } from '@cairn/shared-types'

// ─── Controllable events channel ──────────────────────────────────────────────

type Listener = (payload: unknown) => void

function buildEventsApi() {
  const listeners = new Map<string, Set<Listener>>()
  return {
    api: {
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
    },
    emit(name: string, payload: unknown) {
      listeners.get(name)?.forEach((cb) => cb(payload))
    },
  }
}

function warning(overrides: Partial<BrokerWarning> = {}): BrokerWarning {
  return {
    tradeId: 'trade-1',
    accountId: 'acct-1',
    ruleKey: 'no_sl_widening',
    symbol: 'EURUSD',
    message: 'Stop moved against you on EURUSD. Widening your stop breaks "No SL Widening".',
    detail: 'Stop moved from the planned 1.0850 to 1.0820, further from entry.',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let events: ReturnType<typeof buildEventsApi>

beforeEach(() => {
  vi.clearAllMocks()
  events = buildEventsApi()
  // @ts-expect-error — global augmentation not available in test env
  window.api = events.api
})

afterEach(() => {
  cleanup()
  // @ts-expect-error — global augmentation not available in test env
  delete window.api
})

describe('BrokerWarningToasts', () => {
  it('surfaces a broker.warning as a mentor-voice toast', async () => {
    render(
      <ToastProvider>
        <BrokerWarningToasts />
      </ToastProvider>,
    )

    act(() => {
      events.emit('broker.warning', warning())
    })

    await waitFor(() => {
      expect(screen.getByText(/Widening your stop breaks "No SL Widening"/)).toBeDefined()
    })
  })

  it('toasts the same (tradeId, ruleKey) breach only once', async () => {
    render(
      <ToastProvider>
        <BrokerWarningToasts />
      </ToastProvider>,
    )

    act(() => {
      events.emit('broker.warning', warning())
      events.emit('broker.warning', warning()) // replay — must be ignored
    })

    await waitFor(() => {
      expect(screen.getAllByText(/Widening your stop breaks/)).toHaveLength(1)
    })
  })

  it('surfaces a different rule on the same trade', async () => {
    render(
      <ToastProvider>
        <BrokerWarningToasts />
      </ToastProvider>,
    )

    act(() => {
      events.emit('broker.warning', warning())
      events.emit(
        'broker.warning',
        warning({
          ruleKey: 'no_tp_narrowing',
          message: 'Target pulled in on EURUSD. Cutting your take-profit breaks "No TP Narrowing".',
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText(/Widening your stop breaks/)).toBeDefined()
      expect(screen.getByText(/Cutting your take-profit breaks/)).toBeDefined()
    })
  })
})
