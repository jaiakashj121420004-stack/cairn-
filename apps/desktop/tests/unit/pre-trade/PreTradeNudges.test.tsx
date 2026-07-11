// PreTradeNudges render tests — jsdom (default environment).
//
// The component is pure/presentational: it decides visibility from `signals` +
// the live `urgencyScore` and renders nothing when neither nudge applies.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { PreTradeNudges } from '../../../src/features/pre-trade/PreTradeNudges'
import type { PreTradeSignals } from '../../../shared/types/index'

function signals(overrides: Partial<PreTradeSignals> = {}): PreTradeSignals {
  return {
    tilt: { enabled: true, lossRun: 3, currentLossStreak: 0 },
    urgency: {
      enabled: true,
      level: 7,
      lowWinRatePct: 60,
      highWinRatePct: 30,
      lowSample: 20,
      highSample: 15,
      sufficient: false,
    },
    ...overrides,
  }
}

afterEach(() => cleanup())

describe('PreTradeNudges', () => {
  it('renders nothing when signals are null', () => {
    const { container } = render(<PreTradeNudges signals={null} urgencyScore={9} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when neither nudge applies', () => {
    render(<PreTradeNudges signals={signals()} urgencyScore={3} />)
    expect(screen.queryByTestId('pre-trade-nudges')).toBeNull()
  })

  it('shows the tilt nudge when the loss streak reaches the threshold', () => {
    render(
      <PreTradeNudges
        signals={signals({ tilt: { enabled: true, lossRun: 3, currentLossStreak: 3 } })}
        urgencyScore={3}
      />,
    )
    expect(screen.getByTestId('nudge-tilt')).toBeDefined()
    expect(screen.getByText(/3 down in a row/)).toBeDefined()
  })

  it('does not show the tilt nudge below the threshold, or when disabled', () => {
    render(
      <PreTradeNudges
        signals={signals({ tilt: { enabled: true, lossRun: 3, currentLossStreak: 2 } })}
        urgencyScore={3}
      />,
    )
    expect(screen.queryByTestId('nudge-tilt')).toBeNull()

    cleanup()
    render(
      <PreTradeNudges
        signals={signals({ tilt: { enabled: false, lossRun: 3, currentLossStreak: 5 } })}
        urgencyScore={3}
      />,
    )
    expect(screen.queryByTestId('nudge-tilt')).toBeNull()
  })

  it('shows the urgency nudge only when sufficient AND urgency ≥ level', () => {
    const s = signals({
      urgency: {
        enabled: true,
        level: 7,
        lowWinRatePct: 60,
        highWinRatePct: 30,
        lowSample: 20,
        highSample: 15,
        sufficient: true,
      },
    })
    render(<PreTradeNudges signals={s} urgencyScore={8} />)
    expect(screen.getByTestId('nudge-urgency')).toBeDefined()
    expect(screen.getByText(/60% to 30%/)).toBeDefined()
  })

  it('hides the urgency nudge when urgency is below the level, even if sufficient', () => {
    const s = signals({
      urgency: {
        enabled: true,
        level: 7,
        lowWinRatePct: 60,
        highWinRatePct: 30,
        lowSample: 20,
        highSample: 15,
        sufficient: true,
      },
    })
    render(<PreTradeNudges signals={s} urgencyScore={6} />)
    expect(screen.queryByTestId('nudge-urgency')).toBeNull()
  })

  it('hides the urgency nudge when the split is not statistically sufficient', () => {
    render(<PreTradeNudges signals={signals()} urgencyScore={9} />)
    expect(screen.queryByTestId('nudge-urgency')).toBeNull()
  })
})
