// @vitest-environment node
//
// Pure tests for the TradingView embed URL builders.
import { describe, it, expect } from 'vitest'
import {
  buildTradingViewEmbedUrl,
  toTradingViewSymbol,
  tradingViewChartUrl,
} from '../../../src/lib/tradingview'

describe('toTradingViewSymbol', () => {
  it('uppercases and strips spaces and slashes', () => {
    expect(toTradingViewSymbol('eurusd')).toBe('EURUSD')
    expect(toTradingViewSymbol('EUR/USD')).toBe('EURUSD')
    expect(toTradingViewSymbol(' xau usd ')).toBe('XAUUSD')
  })

  it('leaves an explicit EXCHANGE:TICKER untouched (aside from casing)', () => {
    expect(toTradingViewSymbol('oanda:eurusd')).toBe('OANDA:EURUSD')
  })
})

describe('buildTradingViewEmbedUrl', () => {
  it('targets the widgetembed endpoint with symbol, interval, and theme', () => {
    const url = buildTradingViewEmbedUrl({ symbol: 'EURUSD', interval: '240', theme: 'dark' })
    expect(url).toContain('https://www.tradingview.com/widgetembed/')
    expect(url).toContain('symbol=EURUSD')
    expect(url).toContain('interval=240')
    expect(url).toContain('theme=dark')
  })
})

describe('tradingViewChartUrl', () => {
  it('builds a full-site chart link for the mapped symbol', () => {
    expect(tradingViewChartUrl('eurusd')).toBe('https://www.tradingview.com/chart/?symbol=EURUSD')
  })
})
