// ImportTab smoke (jsdom) — verifies the broker selector and file-pick button render,
// and that the "no account" warning appears when no account is selected.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { ImportTab } from '../../../src/features/settings/tabs/ImportTab'
import { ToastProvider } from '../../../src/components/ui/toast'
import type { Pair, Setup } from '../../../shared/types/index'

// ─── Mocks ────────────────────────────────────────────────────────────────────

function ok<T>(data: T) {
  return Promise.resolve({ ok: true as const, data })
}

const PAIRS: Pair[] = [
  {
    id: 'p1',
    symbol: 'EURUSD',
    displayName: 'EUR/USD',
    assetClass: 'forex',
    pipDecimal: 4,
    pipValuePerStandardLotCents: 1000,
    correlatedWith: null,
    active: 1,
    displayOrder: 1,
    notes: null,
    createdAt: 1000,
    updatedAt: 1000,
  },
]

const SETUPS: Setup[] = [
  {
    id: 's1',
    name: 'ICT OB',
    category: 'ict',
    description: null,
    color: '#4CAF50',
    active: 1,
    displayOrder: 1,
    createdAt: 1000,
    updatedAt: 1000,
  },
]

function buildApi(_accountId: string | null = 'acct-1') {
  return {
    pairs: { list: () => ok(PAIRS) },
    setups: { list: () => ok(SETUPS) },
    import: {
      previewMt5: vi.fn(),
      commitMt5: vi.fn(),
      previewCtrader: vi.fn(),
      commitCtrader: vi.fn(),
      previewTradingView: vi.fn(),
      commitTradingView: vi.fn(),
    },
  }
}

// Stub the session store so we control selectedAccountId.
vi.mock('../../../src/stores/session-store', () => ({
  useSessionStore: vi.fn(),
}))

import { useSessionStore } from '../../../src/stores/session-store'
const mockUseSessionStore = vi.mocked(useSessionStore)

afterEach(() => {
  cleanup()
  // @ts-expect-error — partial mock
  delete window.api
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ImportTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders broker options and the file-pick button', async () => {
    mockUseSessionStore.mockReturnValue({ selectedAccountId: 'acct-1' } as ReturnType<
      typeof useSessionStore
    >)
    // @ts-expect-error — partial mock
    window.api = buildApi('acct-1')

    render(
      <ToastProvider>
        <ImportTab />
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('MetaTrader 5')).toBeDefined()
    })
    expect(screen.getByText('cTrader')).toBeDefined()
    expect(screen.getByText('TradingView')).toBeDefined()
    expect(screen.getByText(/Choose HTML file/)).toBeDefined()
  })

  it('shows the no-account warning when selectedAccountId is null', async () => {
    mockUseSessionStore.mockReturnValue({ selectedAccountId: null } as ReturnType<
      typeof useSessionStore
    >)
    // @ts-expect-error — partial mock
    window.api = buildApi(null)

    render(
      <ToastProvider>
        <ImportTab />
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
    })
    expect(screen.getByText(/No account selected/)).toBeDefined()
  })

  it('disables the file-pick button when no setup is chosen', async () => {
    mockUseSessionStore.mockReturnValue({ selectedAccountId: 'acct-1' } as ReturnType<
      typeof useSessionStore
    >)
    // @ts-expect-error — partial mock
    window.api = buildApi('acct-1')

    render(
      <ToastProvider>
        <ImportTab />
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Choose HTML file/)).toBeDefined()
    })

    const btn = screen.getByText(/Choose HTML file/).closest('button')
    expect(btn).toBeDefined()
    expect(btn?.disabled).toBe(true)
  })

  it('shows the Import statement heading', async () => {
    mockUseSessionStore.mockReturnValue({ selectedAccountId: 'acct-1' } as ReturnType<
      typeof useSessionStore
    >)
    // @ts-expect-error — partial mock
    window.api = buildApi('acct-1')

    render(
      <ToastProvider>
        <ImportTab />
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Import statement')).toBeDefined()
    })
  })
})
