// NotebookPage smoke (jsdom) — verifies the list renders and the empty editor
// state shows until a note is selected.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { NotebookPage } from '../../../src/features/notebook/NotebookPage'
import { ToastProvider } from '../../../src/components/ui/toast'
import type { NotebookEntrySummary } from '../../../shared/types/index'

function ok<T>(data: T) {
  return Promise.resolve({ ok: true as const, data })
}

const ENTRIES: NotebookEntrySummary[] = [
  { id: 'n1', accountId: null, title: 'My trading plan', template: 'trading_plan', pinned: 1, updatedAt: 1700000000000, preview: 'Markets and sessions' },
  { id: 'n2', accountId: null, title: 'Watchlist', template: 'watchlist', pinned: 0, updatedAt: 1700000001000, preview: 'EURUSD XAUUSD' },
]

function buildMockApi(entries: NotebookEntrySummary[]) {
  return {
    notebook: {
      list: () => ok(entries),
      search: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  }
}

afterEach(() => {
  cleanup()
  // @ts-expect-error — global augmentation not available in test env
  delete window.api
})

describe('NotebookPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the notebook list and the empty editor state', async () => {
    // @ts-expect-error — partial mock is sufficient for what the page calls
    window.api = buildMockApi(ENTRIES)
    render(
      <MemoryRouter>
        <ToastProvider>
          <NotebookPage />
        </ToastProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('My trading plan')).toBeDefined()
    })
    expect(screen.getByText('Watchlist')).toBeDefined()
    expect(screen.getByText(/Select a note/)).toBeDefined()
  })

  it('shows the empty-list hint when there are no notes', async () => {
    // @ts-expect-error — partial mock is sufficient for what the page calls
    window.api = buildMockApi([])
    render(
      <MemoryRouter>
        <ToastProvider>
          <NotebookPage />
        </ToastProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/No notes yet/)).toBeDefined()
    })
  })
})
