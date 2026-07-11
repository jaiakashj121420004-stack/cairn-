// TradingViewChart render tests — jsdom (default environment).
//
// Verifies the embed is not loaded until the trader opts in, that the interval
// buttons re-point the iframe, and that the external link opens the full site.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { TradingViewChart } from '../../../src/features/trade-log/TradingViewChart'

afterEach(() => cleanup())

describe('TradingViewChart', () => {
  it('does not render the iframe until "Show chart" is clicked', () => {
    render(<TradingViewChart symbol="EURUSD" />)
    expect(screen.queryByTestId('tradingview-chart')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /show chart/i }))
    const frame = screen.getByTitle(/TradingView chart for EURUSD/i)
    expect(frame.getAttribute('src')).toContain('tradingview.com/widgetembed/')
    expect(frame.getAttribute('src')).toContain('symbol=EURUSD')
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts')
  })

  it('re-points the iframe when a timeframe is picked', () => {
    render(<TradingViewChart symbol="EURUSD" />)
    fireEvent.click(screen.getByRole('button', { name: /show chart/i }))
    fireEvent.click(screen.getByRole('button', { name: '4H' }))
    expect(screen.getByTitle(/TradingView chart for EURUSD/i).getAttribute('src')).toContain(
      'interval=240',
    )
  })

  it('offers an external link to the full TradingView site', () => {
    render(<TradingViewChart symbol="EURUSD" />)
    fireEvent.click(screen.getByRole('button', { name: /show chart/i }))
    const link = screen.getByRole('link', { name: /open on tradingview/i })
    expect(link.getAttribute('href')).toContain('tradingview.com/chart')
    expect(link.getAttribute('target')).toBe('_blank')
  })
})
