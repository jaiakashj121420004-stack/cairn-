// CalendarTab render + navigation tests — jsdom environment
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { CalendarTab } from '../../../../src/features/analytics/tabs/CalendarTab'
import { ToastProvider } from '../../../../src/components/ui/toast'
import type { DailyPnlCell, PerformanceStats } from '../../../../shared/types/index'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data }
}

const EMPTY_STATS = {
  totals: {
    tradeCount: 0,
    winCount: 0,
    lossCount: 0,
    winRateBps: 0,
    expectancyR: 0,
    totalR: 0,
    netPnlCents: 0,
    netPnlPctBps: 0,
    profitFactor: 0,
    avgWinCents: 0,
    avgLossCents: 0,
  },
  equityCurve: [],
  distribution: [],
  streaks: { currentKind: 'none' as const, currentLen: 0, longestWin: 0, longestLoss: 0 },
  dailyHeatmap: [] as DailyPnlCell[],
  maxDrawdownCents: 0,
  ddLimitCents: null,
} satisfies PerformanceStats

function makeStats(heatmap: DailyPnlCell[]): PerformanceStats {
  return { ...EMPTY_STATS, dailyHeatmap: heatmap }
}

// ─── IPC mock ─────────────────────────────────────────────────────────────────

vi.mock('../../../../src/lib/ipc', () => ({
  ipc: {
    analytics: {
      performance: vi.fn(),
    },
  },
}))

// ─── analytics store mock ─────────────────────────────────────────────────────

vi.mock('../../../../src/stores/analytics-store', () => ({
  useAnalyticsStore: () => ({
    filter: {
      accountIds: 'all',
      dateFrom: null,
      dateTo: null,
      datePreset: 'all',
      mode: 'all',
      pairIds: [],
      setupIds: [],
      killzoneIds: [],
      cleanOnly: false,
    },
  }),
}))

import { ipc } from '../../../../src/lib/ipc'
const mockPerformance = vi.mocked(
  (ipc.analytics as { performance: typeof ipc.analytics.performance }).performance,
)

// Mock useNavigate so we can assert calls without actual routing
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderTab() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CalendarTab />
      </ToastProvider>
    </MemoryRouter>,
  )
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function currentMonthDate(day: number): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CalendarTab', () => {
  beforeEach(() => {
    mockPerformance.mockResolvedValue(ok(makeStats([])))
    mockNavigate.mockClear()
  })

  it('renders without crashing when heatmap is empty', async () => {
    renderTab()
    await waitFor(() => {
      expect(
        screen.getByText(
          /January|February|March|April|May|June|July|August|September|October|November|December/,
        ),
      ).toBeTruthy()
    })
  })

  it('renders weekday header labels Mon–Sun', async () => {
    renderTab()
    // Wait for loading to finish — 'Today' button only renders when !loading
    await screen.findByRole('button', { name: 'Today' })
    expect(screen.getByText('Mon')).toBeTruthy()
    expect(screen.getByText('Tue')).toBeTruthy()
    expect(screen.getByText('Sun')).toBeTruthy()
  })

  it('renders day cells from heatmap data (current month)', async () => {
    const date1 = currentMonthDate(1)
    const date2 = currentMonthDate(2)
    const cells: DailyPnlCell[] = [
      { date: date1, pnlCents: 15000, tradeCount: 3, winCount: 2 },
      { date: date2, pnlCents: -8000, tradeCount: 2, winCount: 0 },
    ]
    mockPerformance.mockResolvedValue(ok(makeStats(cells)))
    renderTab()
    await waitFor(() => {
      expect(screen.getByText('$150.00')).toBeTruthy()
      expect(screen.getByText('-$80.00')).toBeTruthy()
    })
  })

  it('shows trade count for a day', async () => {
    const date1 = currentMonthDate(1)
    const cells: DailyPnlCell[] = [{ date: date1, pnlCents: 10000, tradeCount: 3, winCount: 2 }]
    mockPerformance.mockResolvedValue(ok(makeStats(cells)))
    renderTab()
    await waitFor(() => {
      expect(screen.getByText('3 trades')).toBeTruthy()
    })
  })

  it('navigates to /trades?date=YYYY-MM-DD on day click', async () => {
    const date1 = currentMonthDate(1)
    const cells: DailyPnlCell[] = [{ date: date1, pnlCents: 10000, tradeCount: 1, winCount: 1 }]
    mockPerformance.mockResolvedValue(ok(makeStats(cells)))
    renderTab()

    await waitFor(() => {
      const cell = screen.getByRole('button', { name: new RegExp(date1) })
      fireEvent.click(cell)
    })

    expect(mockNavigate).toHaveBeenCalledWith(`/trades?date=${date1}`)
  })

  it('prev/next month buttons change the displayed month header', async () => {
    renderTab()
    const monthRe =
      /January|February|March|April|May|June|July|August|September|October|November|December/
    const nextBtn = await screen.findByLabelText('Next month')

    // Capture text BEFORE clicking — need to wait for initial render
    await waitFor(() => expect(screen.getByText(monthRe)).toBeTruthy())
    const headerBefore = screen.getByText(monthRe).textContent ?? ''

    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByText(monthRe).textContent).not.toBe(headerBefore)
    })
  })
})
