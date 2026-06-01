// ReviewPage render tests — jsdom environment (default; no per-file environment directive)
//
// These tests verify that:
// (a) every empty-state message renders when the API returns no data
// (b) the period-summary stat grid populates with correctly formatted values when
//     the analytics API returns known data.
//
// Framer Motion and Lucide icons run as-is in jsdom — they render to DOM elements
// with no side-effects we need to neutralise.  The only global we stub is
// window.api (the Electron IPC surface).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { ReviewPage } from '../../../src/features/review/ReviewPage'
import { ToastProvider } from '../../../src/components/ui/toast'
import type {
  Insight,
  PerformanceStats,
  RuleAdherenceStats,
  ReviewSummary,
  Account,
  AnalyticsTotals,
} from '../../../shared/types/index'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withProviders(ui: React.ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

// Minimal IpcResponse wrappers
function ok<T>(data: T) {
  return Promise.resolve({ ok: true as const, data })
}

// ─── Fixture data ─────────────────────────────────────────────────────────────

const EMPTY_TOTALS: AnalyticsTotals = {
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
}

const EMPTY_PERF: PerformanceStats = {
  totals: EMPTY_TOTALS,
  equityCurve: [],
  distribution: [],
  streaks: { currentKind: 'none', currentLen: 0, longestWin: 0, longestLoss: 0 },
  dailyHeatmap: [],
  maxDrawdownCents: 0,
  ddLimitCents: null,
}

const EMPTY_ADHERENCE: RuleAdherenceStats = {
  score: {
    cleanCount: 0,
    dirtyCount: 0,
    scoreBps: 0,
    prevScoreBps: null,
    trendDirection: 'flat',
  },
  cleanVsDirty: {
    clean: EMPTY_TOTALS,
    dirty: EMPTY_TOTALS,
    avgPnlDiffCents: 0,
  },
  topBroken: [],
  impactTable: [],
  blocked: { blockedCount: 0, projectedAvoidedCents: 0 },
  trendLine: [],
}

// Known stats for the "populated" test.
// tradeCount=10, winRateBps=6000 (60%), expectancyR=75 (0.75R), netPnlCents=50000 ($500)
// adherence scoreBps=8000 (80%), current streak: 3 wins
const KNOWN_TOTALS: AnalyticsTotals = {
  tradeCount: 10,
  winCount: 6,
  lossCount: 4,
  winRateBps: 6000,
  expectancyR: 75,
  totalR: 750,
  netPnlCents: 50000,
  netPnlPctBps: 500,
  profitFactor: 220,
  avgWinCents: 12500,
  avgLossCents: -7500,
}

const KNOWN_PERF: PerformanceStats = {
  totals: KNOWN_TOTALS,
  equityCurve: [],
  distribution: [],
  streaks: { currentKind: 'win', currentLen: 3, longestWin: 5, longestLoss: 2 },
  dailyHeatmap: [],
  maxDrawdownCents: 2000,
  ddLimitCents: null,
}

const KNOWN_ADHERENCE: RuleAdherenceStats = {
  score: {
    cleanCount: 8,
    dirtyCount: 2,
    scoreBps: 8000,
    prevScoreBps: null,
    trendDirection: 'up',
  },
  cleanVsDirty: {
    clean: KNOWN_TOTALS,
    dirty: EMPTY_TOTALS,
    avgPnlDiffCents: 0,
  },
  topBroken: [],
  impactTable: [],
  blocked: { blockedCount: 0, projectedAvoidedCents: 0 },
  trendLine: [],
}

const MOCK_ACCOUNT: Account = {
  id: 'acc-1',
  displayName: 'Test Account',
  templateId: null,
  propFirmId: 'firm-1',
  stepCount: 2,
  currentPhase: 1,
  accountSizeCents: 1_000_000,
  leverage: 100,
  dailyDrawdownType: 'percent_of_balance',
  dailyDrawdownValue: 500,
  totalDrawdownType: 'percent_of_balance',
  totalDrawdownValue: 1000,
  drawdownBasis: 'initial_balance',
  profitTargetPct: 800,
  minTradingDays: null,
  maxTradingDays: null,
  weekendHoldingAllowed: 0,
  newsTradingAllowed: 0,
  consistencyRulePct: null,
  challengeCostCents: 30000,
  startDate: 1700000000000,
  status: 'active',
  endDate: null,
  endReason: null,
  peakEquityCents: 1_000_000,
  currentEquityCents: 1_000_000,
  notes: null,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  deletedAt: null,
}

const MOCK_REVIEW: ReviewSummary = {
  id: 'rev-1',
  accountId: 'acc-1',
  periodType: 'weekly',
  periodStart: '2024-11-11',
  periodEnd: '2024-11-17',
  topMistakes: 'Entered before MSS confirmation twice.',
  bestTradeId: null,
  worstTradeId: null,
  lessonNextPeriod: 'Wait for MSS before entry.',
  ruleFocus: 'require_mss_confirmation',
  adherenceScore: 8000,
  notes: 'Good discipline overall.',
  createdAt: 1731888000000,
}

// ─── Mock API factory ─────────────────────────────────────────────────────────

interface MockApiOptions {
  perf?: PerformanceStats
  adherence?: RuleAdherenceStats
  reviews?: ReviewSummary[]
  accounts?: Account[]
  insights?: Insight[]
}

const MOCK_INSIGHT: Insight = {
  id: 'urgency-hurts',
  severity: 'medium',
  title: 'High urgency hurts your win rate',
  body: 'Your win-rate is 75% when urgency ≤ 5, but 40% when urgency ≥ 7. (20/15 trades each.)',
  sampleSize: 35,
}

function buildMockApi(opts: MockApiOptions = {}) {
  const perf = opts.perf ?? EMPTY_PERF
  const adherence = opts.adherence ?? EMPTY_ADHERENCE
  const reviews = opts.reviews ?? []
  const accounts = opts.accounts ?? []
  const insights = opts.insights ?? []

  return {
    accounts: {
      list: () => ok(accounts),
      create: vi.fn(),
      update: vi.fn(),
      stats: vi.fn(),
    },
    analytics: {
      performance: () => ok(perf),
      adherence: () => ok(adherence),
      listReviews: () => ok(reviews),
      setups: vi.fn(),
      behavioral: vi.fn(),
      phases: vi.fn(),
      createReview: vi.fn(),
    },
    data: {
      exportPdf: vi.fn(),
      openFolder: vi.fn(),
      export: vi.fn(),
      reset: vi.fn(),
    },
    // Stubs for other namespaces the component doesn't call directly but ipc.ts
    // types may reference.
    pairs: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    setups: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    killzones: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    sessions: { getToday: vi.fn(), upsert: vi.fn(), lock: vi.fn() },
    trades: {
      create: vi.fn(), setOpen: vi.fn(), close: vi.fn(), partialClose: vi.fn(),
      closeMinimal: vi.fn(), completePhase2: vi.fn(),
      list: vi.fn(), get: vi.fn(), delete: vi.fn(),
      listAwaitingReflection: () => ok([]),
      countAwaitingReflection: () => ok(0),
      addScreenshot: vi.fn(), pickScreenshots: vi.fn(), listScreenshots: vi.fn(),
      deleteScreenshot: vi.fn(),
    },
    dashboard: { getStats: vi.fn() },
    rules: {
      evaluatePreTrade: vi.fn(), evaluateModification: vi.fn(), getSessionState: vi.fn(),
      override: vi.fn(), clearCooldown: vi.fn(), onTradeClosed: vi.fn(), listAvailable: vi.fn(),
    },
    accountRules: { list: vi.fn(), upsert: vi.fn() },
    propFirms: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    accountTemplates: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    paths: { pickFolder: vi.fn(), pickImages: vi.fn(), openFile: vi.fn() },
    backup: {
      getSettings: vi.fn(), setSettings: vi.fn(), pickFolder: vi.fn(),
      now: vi.fn(), nowToFolder: vi.fn(), getLog: vi.fn(),
      pickRestoreFile: vi.fn(), restore: vi.fn(), reschedule: vi.fn(),
    },
    insights: {
      list: () => ok(insights),
      dismiss: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    },
    settings: { get: vi.fn(), set: vi.fn() },
    events: {
      on: vi.fn().mockReturnValue(() => {}),
      off: vi.fn(),
    },
    ping: vi.fn(),
    dbStatus: vi.fn(),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  // Unmount all rendered components before removing window.api to prevent
  // stale useEffect callbacks (triggered by accountId state changes) from
  // firing after the mock is torn down — which causes flaky failures.
  cleanup()
  // @ts-expect-error — global augmentation not available in test env
  delete window.api
})

describe('ReviewPage — empty states', () => {
  it('shows "no closed trades" when API returns zero trades', async () => {
    // @ts-expect-error — global augmentation not available in test env
    window.api = buildMockApi()
    withProviders(<ReviewPage />)

    await waitFor(() => {
      expect(screen.getByText('No closed trades in this period.')).toBeDefined()
    })
  })

  it('shows reflection-queue empty state', async () => {
    // @ts-expect-error — global augmentation not available in test env
    window.api = buildMockApi()
    withProviders(<ReviewPage />)

    await waitFor(() => {
      expect(screen.getByText(/No trades awaiting reflection/)).toBeDefined()
    })
  })

  it('shows insights empty state with minimum-count message', async () => {
    // @ts-expect-error — global augmentation not available in test env
    window.api = buildMockApi()
    withProviders(<ReviewPage />)

    await waitFor(() => {
      expect(
        screen.getByText(/No insights yet.*20 closed trades/s),
      ).toBeDefined()
    })
  })

  it('shows "no reviews" empty state when reviews list is empty', async () => {
    // @ts-expect-error — global augmentation not available in test env
    window.api = buildMockApi()
    withProviders(<ReviewPage />)

    await waitFor(() => {
      expect(screen.getByText('No reviews yet for this period.')).toBeDefined()
    })
  })
})

describe('ReviewPage — period summary with seeded data', () => {
  beforeEach(() => {
    // @ts-expect-error — global augmentation not available in test env
    window.api = buildMockApi({
      perf: KNOWN_PERF,
      adherence: KNOWN_ADHERENCE,
      accounts: [MOCK_ACCOUNT],
      reviews: [MOCK_REVIEW],
    })
  })

  it('renders the period-summary stat grid when tradeCount > 0', async () => {
    withProviders(<ReviewPage />)
    await waitFor(() => {
      expect(screen.getByTestId('period-summary-grid')).toBeDefined()
    })
  })

  it('shows correct trade count', async () => {
    withProviders(<ReviewPage />)
    await waitFor(() => {
      // StatCard label "Closed trades" + value "10"
      expect(screen.getByText('10')).toBeDefined()
    })
  })

  it('shows win rate formatted as percent (60.00%)', async () => {
    withProviders(<ReviewPage />)
    await waitFor(() => {
      expect(screen.getByText('60.00%')).toBeDefined()
    })
  })

  it('shows expectancy as R multiple (+0.75R)', async () => {
    withProviders(<ReviewPage />)
    await waitFor(() => {
      expect(screen.getByText('+0.75R')).toBeDefined()
    })
  })

  it('shows gross P&L formatted as dollars ($500.00)', async () => {
    withProviders(<ReviewPage />)
    await waitFor(() => {
      expect(screen.getByText('$500.00')).toBeDefined()
    })
  })

  it('shows clean-trade % from adherence score (80.00%)', async () => {
    withProviders(<ReviewPage />)
    // 8000 bps → 80.00% — note win-rate is 60.00% so 80.00% is unique
    await waitFor(() => {
      expect(screen.getByText('80.00%')).toBeDefined()
    })
  })

  it('shows current win streak (+3W)', async () => {
    withProviders(<ReviewPage />)
    await waitFor(() => {
      expect(screen.getByText('+3W')).toBeDefined()
    })
  })

  it('renders reviews list when reviews exist', async () => {
    withProviders(<ReviewPage />)
    await waitFor(() => {
      expect(screen.getByText(/Entered before MSS confirmation/)).toBeDefined()
    })
  })
})

describe('ReviewPage — insights section', () => {
  beforeEach(() => {
    // @ts-expect-error — global augmentation not available in test env
    window.api = buildMockApi({
      accounts: [MOCK_ACCOUNT],
      insights: [MOCK_INSIGHT],
    })
  })

  it('renders insights list when insights exist', async () => {
    withProviders(<ReviewPage />)
    await waitFor(() => {
      expect(screen.getByTestId('insights-list')).toBeDefined()
    })
  })

  it('renders insight title and body', async () => {
    withProviders(<ReviewPage />)
    await waitFor(() => {
      expect(screen.getByText('High urgency hurts your win rate')).toBeDefined()
      expect(screen.getByText(/75% when urgency/)).toBeDefined()
    })
  })

  it('shows "Dismiss 7 d" button for each insight', async () => {
    withProviders(<ReviewPage />)
    await waitFor(() => {
      expect(screen.getByText('Dismiss 7 d')).toBeDefined()
    })
  })

  it('shows empty state when no insights', async () => {
    // @ts-expect-error — global augmentation not available in test env
    window.api = buildMockApi({ accounts: [MOCK_ACCOUNT], insights: [] })
    withProviders(<ReviewPage />)
    await waitFor(() => {
      expect(screen.getByText(/No insights yet/)).toBeDefined()
    })
  })
})

describe('buildFilter utility', () => {
  it('sets accountIds to "all" when accountId is null', async () => {
    const { buildFilter } = await import('../../../src/features/review/ReviewPage')
    const f = buildFilter(null, '30d')
    expect(f.accountIds).toBe('all')
  })

  it('wraps accountId in array when provided', async () => {
    const { buildFilter } = await import('../../../src/features/review/ReviewPage')
    const f = buildFilter('acc-123', '30d')
    expect(f.accountIds).toEqual(['acc-123'])
  })

  it('sets dateFrom/dateTo to null for "all" preset', async () => {
    const { buildFilter } = await import('../../../src/features/review/ReviewPage')
    const f = buildFilter(null, 'all')
    expect(f.dateFrom).toBeNull()
    expect(f.dateTo).toBeNull()
  })

  it('computes a non-null date range for "30d" preset', async () => {
    const { buildFilter } = await import('../../../src/features/review/ReviewPage')
    const f = buildFilter(null, '30d')
    expect(f.dateFrom).not.toBeNull()
    expect(f.dateTo).not.toBeNull()
    // 30d window: dateTo - dateFrom should be ~30 days
    const rangeDays = ((f.dateTo ?? 0) - (f.dateFrom ?? 0)) / 86_400_000
    expect(rangeDays).toBeCloseTo(30, 0)
  })
})
