// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTradingViewCsv } from '../../../electron/services/import-adapters/tradingview/parser'
import { reconcileTvTrades } from '../../../electron/services/import-adapters/tradingview/reconciler'

const SIMPLE   = readFileSync(join(__dirname, '../../fixtures/import/tradingview/tv-simple.csv'), 'utf-8')
const PARTIALS = readFileSync(join(__dirname, '../../fixtures/import/tradingview/tv-partials.csv'), 'utf-8')

function parseAndReconcile(csv: string) {
  const { rows } = parseTradingViewCsv(csv)
  return reconcileTvTrades(rows)
}

// ─── tv-simple.csv ────────────────────────────────────────────────────────────

describe('reconcileTvTrades — tv-simple.csv', () => {
  it('returns 3 candidates (one per Trade #)', () => {
    const candidates = parseAndReconcile(SIMPLE)
    expect(candidates).toHaveLength(3)
  })

  it('all externalRefs are unique and match the tv_trade_{n} pattern', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const refs = candidates.map((c) => c.externalRef)
    expect(new Set(refs).size).toBe(3)
    for (const ref of refs) {
      expect(ref).toMatch(/^tv_trade_\d+$/)
    }
  })

  it('all candidates have pairId null (resolution is IPC handler job)', () => {
    const candidates = parseAndReconcile(SIMPLE)
    for (const c of candidates) expect(c.pairId).toBeNull()
  })

  it('EURUSD candidate: direction long, closed, correct prices, no partials', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const c = candidates.find((x) => x.symbol === 'EURUSD')
    expect(c).toBeDefined()
    expect(c?.direction).toBe('long')
    expect(c?.status).toBe('closed')
    expect(c?.entryPrice).toBe('1.08523')
    expect(c?.exitPrice).toBe('1.08700')
    expect(c?.volumeLots).toBe('0.10')
    expect(c?.partialExits).toHaveLength(0)
  })

  it('EURUSD candidate: pnlAmount is the exit row profit', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const c = candidates.find((x) => x.symbol === 'EURUSD')
    expect(parseFloat(c?.pnlAmount ?? '0')).toBeCloseTo(17.70, 2)
  })

  it('GBPUSD candidate: direction short, closed', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const c = candidates.find((x) => x.symbol === 'GBPUSD')
    expect(c?.direction).toBe('short')
    expect(c?.status).toBe('closed')
    expect(c?.entryPrice).toBe('1.27300')
    expect(c?.exitPrice).toBe('1.27100')
  })

  it('USDJPY candidate: negative pnlAmount for a losing trade', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const c = candidates.find((x) => x.symbol === 'USDJPY')
    expect(parseFloat(c?.pnlAmount ?? '0')).toBeCloseTo(-20.00, 2)
  })

  it('all candidates: SL and TP are null (TV CSV has none)', () => {
    const candidates = parseAndReconcile(SIMPLE)
    for (const c of candidates) {
      expect(c.stopLoss).toBeNull()
      expect(c.takeProfit).toBeNull()
    }
  })

  it('all candidates: commission and swap are "0.00"', () => {
    const candidates = parseAndReconcile(SIMPLE)
    for (const c of candidates) {
      expect(c.commission).toBe('0.00')
      expect(c.swap).toBe('0.00')
    }
  })

  it('brokerTradeId matches the raw Trade # string', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const eurusd = candidates.find((c) => c.symbol === 'EURUSD')
    expect(eurusd?.brokerTradeId).toBe('1')
  })
})

// ─── tv-partials.csv ──────────────────────────────────────────────────────────

describe('reconcileTvTrades — tv-partials.csv', () => {
  it('returns 2 candidates', () => {
    const candidates = parseAndReconcile(PARTIALS)
    expect(candidates).toHaveLength(2)
  })

  it('EURUSD candidate: 1 partial exit + final close', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const c = candidates.find((x) => x.symbol === 'EURUSD')
    expect(c).toBeDefined()
    expect(c?.partialExits).toHaveLength(1)
    expect(c?.status).toBe('closed')
  })

  it('EURUSD partial exit: first exit becomes the partial (earlier timestamp)', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const c = candidates.find((x) => x.symbol === 'EURUSD')
    expect(c).toBeDefined()
    const partial = c?.partialExits[0]
    expect(partial?.exitPrice).toBe('1.08700')
    expect(partial?.volumeLots).toBe('0.05')
    expect(parseFloat(partial?.pnlAmount ?? '0')).toBeCloseTo(10.00, 2)
    expect(partial?.externalRef).toBe('tv_trade_1_exit_0')
  })

  it('EURUSD final exit: last exit row price and lots', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const c = candidates.find((x) => x.symbol === 'EURUSD')
    expect(c?.exitPrice).toBe('1.08900')
  })

  it('EURUSD pnlAmount sums both exit profits (10 + 20 = 30)', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const c = candidates.find((x) => x.symbol === 'EURUSD')
    expect(parseFloat(c?.pnlAmount ?? '0')).toBeCloseTo(30.00, 2)
  })

  it('EURUSD externalRef is tv_trade_1', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const c = candidates.find((x) => x.symbol === 'EURUSD')
    expect(c?.externalRef).toBe('tv_trade_1')
  })

  it('GBPJPY candidate: direction short, closed, no partials', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const c = candidates.find((x) => x.symbol === 'GBPJPY')
    expect(c).toBeDefined()
    expect(c?.direction).toBe('short')
    expect(c?.status).toBe('closed')
    expect(c?.partialExits).toHaveLength(0)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('reconcileTvTrades — edge cases', () => {
  it('orphan exit rows with no entry produce no candidate', () => {
    const csv = [
      '"Trade #","Date/Time","Symbol","Type","Price","Contracts","Profit","Profit %","Cum. Profit","Run-up","Run-up %","Drawdown","Drawdown %"',
      '"99","2024-01-15 12:00","EURUSD","Exit Long","1.08700","0.10","17.70","","","","","",""',
    ].join('\n')
    const { rows } = parseTradingViewCsv(csv)
    const candidates = reconcileTvTrades(rows)
    expect(candidates).toHaveLength(0)
  })

  it('entry-only row produces an open candidate with no exit', () => {
    const csv = [
      '"Trade #","Date/Time","Symbol","Type","Price","Contracts","Profit","Profit %","Cum. Profit","Run-up","Run-up %","Drawdown","Drawdown %"',
      '"1","2024-01-15 09:35","EURUSD","Entry Long","1.08523","0.10","","","","","","",""',
    ].join('\n')
    const { rows } = parseTradingViewCsv(csv)
    const candidates = reconcileTvTrades(rows)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.status).toBe('open')
    expect(candidates[0]?.exitPrice).toBeNull()
    expect(candidates[0]?.exitTime).toBeNull()
    expect(candidates[0]?.partialExits).toHaveLength(0)
  })

  it('open trade pnlAmount is "0.00" (no exits to sum)', () => {
    const csv = [
      '"Trade #","Date/Time","Symbol","Type","Price","Contracts","Profit","Profit %","Cum. Profit","Run-up","Run-up %","Drawdown","Drawdown %"',
      '"1","2024-01-15 09:35","EURUSD","Entry Long","1.08523","0.10","","","","","","",""',
    ].join('\n')
    const { rows } = parseTradingViewCsv(csv)
    const candidates = reconcileTvTrades(rows)
    expect(candidates[0]?.pnlAmount).toBe('0.00')
  })

  it('empty row list produces no candidates', () => {
    const candidates = reconcileTvTrades([])
    expect(candidates).toHaveLength(0)
  })
})
