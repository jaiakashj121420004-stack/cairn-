// CloseTradeModal pre-tick test (jsdom).
//
// Verifies that when the rule engine detects a planned-vs-actual divergence for
// the trade being closed, the modal pre-ticks the matching checklist row and
// shows the "detected by Cairn" badge — while leaving undetected rows unticked.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { CloseTradeModal } from '../../../src/features/post-trade/CloseTradeModal'
import { ToastProvider } from '../../../src/components/ui/toast'
import type { TradeListItem } from '../../../shared/types/index'

function ok<T>(data: T) {
  return Promise.resolve({ ok: true as const, data })
}

const RULES = [
  {
    key: 'no_sl_widening',
    label: 'No SL Widening',
    description: '',
    category: 'process',
    severity: 'blocking',
    isHardLock: false,
  },
  {
    key: 'require_killzone',
    label: 'Require Killzone',
    description: '',
    category: 'timing',
    severity: 'blocking',
    isHardLock: false,
  },
  {
    key: 'min_rr_ratio',
    label: 'Min RR Ratio',
    description: '',
    category: 'risk',
    severity: 'blocking',
    isHardLock: false,
  },
]

const TRADE: TradeListItem = {
  id: 'trade-1',
  accountId: 'acc-1',
  sessionId: null,
  pairId: 'pair-1',
  pairSymbol: 'EURUSD',
  pairPipDecimal: 4,
  pairPipValuePerLotCents: 1000,
  setupId: 'setup-1',
  setupName: 'FVG',
  killzoneId: null,
  killzoneName: null,
  mode: 'live',
  direction: 'long',
  status: 'open',
  entryPrice: 1080000,
  stopLossPrice: 1079000,
  takeProfitPrice: 1082000,
  slPips: 100,
  rrRatio: 200,
  lotSize: 50,
  riskAmountCents: 10000,
  riskPctBps: 100,
  exitPrice: null,
  exitTime: null,
  exitReason: null,
  pnlCents: null,
  pnlR: null,
  pnlPctBps: null,
  durationMinutes: null,
  isClean: null,
  rulesBroken: null,
  tags: null,
  followedPlanExactly: null,
  slMoved: null,
  enteredBeforeMss: null,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
}

function buildMockApi(detected: Array<{ ruleKey: string; detail: string }>) {
  return {
    rules: {
      listAvailable: () => ok(RULES),
      detectCloseViolations: () => ok(detected),
      evaluatePreTrade: vi.fn(),
      evaluateModification: vi.fn(),
      getSessionState: vi.fn(),
      override: vi.fn(),
      clearCooldown: vi.fn(),
      onTradeClosed: vi.fn(),
    },
    trades: {
      get: () => ok({ ruleViolations: [] }),
      close: vi.fn(),
      partialClose: vi.fn(),
      pickScreenshots: vi.fn(),
      addScreenshot: vi.fn(),
      listScreenshots: vi.fn(),
      deleteScreenshot: vi.fn(),
      create: vi.fn(),
      setOpen: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    },
    settings: {
      // fast_path_enabled = false → the modal renders the full single-phase close
      // form, where the rules-broken pre-tick under test lives. (In fast-path mode
      // that pre-tick moves to the Review-screen reflection flow.)
      get: () => Promise.resolve({ ok: true as const, data: false }),
      set: vi.fn(),
    },
  }
}

function renderModal() {
  return render(
    <ToastProvider>
      <CloseTradeModal open trade={TRADE} onClose={() => {}} onClosed={() => {}} />
    </ToastProvider>,
  )
}

afterEach(() => {
  cleanup()
  // @ts-expect-error — global augmentation not available in test env
  delete window.api
})

describe('CloseTradeModal — pre-tick from detected violations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pre-ticks the detected rule and shows the detected badge', async () => {
    // @ts-expect-error — partial mock is sufficient for what the modal calls
    window.api = buildMockApi([
      {
        ruleKey: 'no_sl_widening',
        detail: 'Stop loss was moved from the plan (1079000) to 1078000.',
      },
    ])
    renderModal()

    await waitFor(() => {
      expect(screen.getByTestId('detected-badge-no_sl_widening')).toBeDefined()
    })

    const slCheckbox = screen.getByRole('checkbox', { name: /No SL Widening/i }) as HTMLInputElement
    expect(slCheckbox.checked).toBe(true)
  })

  it('leaves undetected rules unticked and unbadged', async () => {
    // @ts-expect-error — partial mock is sufficient for what the modal calls
    window.api = buildMockApi([{ ruleKey: 'no_sl_widening', detail: 'Stop loss widened.' }])
    renderModal()

    await waitFor(() => {
      expect(screen.getByTestId('detected-badge-no_sl_widening')).toBeDefined()
    })

    const kzCheckbox = screen.getByRole('checkbox', {
      name: /Require Killzone/i,
    }) as HTMLInputElement
    expect(kzCheckbox.checked).toBe(false)
    expect(screen.queryByTestId('detected-badge-require_killzone')).toBeNull()
  })

  it('shows no badges and no pre-ticks when nothing is detected', async () => {
    // @ts-expect-error — partial mock is sufficient for what the modal calls
    window.api = buildMockApi([])
    renderModal()

    // Wait for the rules list to render, then assert no detected badges exist.
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /No SL Widening/i })).toBeDefined()
    })
    expect(screen.queryByTestId('detected-badge-no_sl_widening')).toBeNull()
    const slCheckbox = screen.getByRole('checkbox', { name: /No SL Widening/i }) as HTMLInputElement
    expect(slCheckbox.checked).toBe(false)
  })
})
