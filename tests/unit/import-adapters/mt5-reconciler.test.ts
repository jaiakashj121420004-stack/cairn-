// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseMt5Html } from '../../../electron/services/import-adapters/mt5/parser'
import { reconcileDeals } from '../../../electron/services/import-adapters/mt5/reconciler'

const FIXTURE = readFileSync(join(__dirname, '../../fixtures/mt5-statement.html'), 'utf-8')

function parse() {
  const { deals, orders } = parseMt5Html(FIXTURE)
  return reconcileDeals(deals, orders)
}

describe('reconcileDeals — fixture', () => {
  it('returns 4 trade candidates (one per unique orderId)', () => {
    const candidates = parse()
    expect(candidates).toHaveLength(4)
  })

  it('all candidates have unique externalRefs of format mt5_order_{id}', () => {
    const candidates = parse()
    const refs = candidates.map((c) => c.externalRef)
    expect(new Set(refs).size).toBe(4)
    for (const ref of refs) {
      expect(ref).toMatch(/^mt5_order_\d+$/)
    }
  })

  it('all candidates have pairId null (resolution is the IPC handler\'s job)', () => {
    const candidates = parse()
    for (const c of candidates) {
      expect(c.pairId).toBeNull()
    }
  })

  it('EURUSD candidate: direction long, status closed, correct prices', () => {
    const candidates = parse()
    const eurusd = candidates.find((c) => c.symbol === 'EURUSD')
    expect(eurusd).toBeDefined()
    expect(eurusd?.direction).toBe('long')
    expect(eurusd?.status).toBe('closed')
    expect(eurusd?.entryPrice).toBe('1.08523')
    expect(eurusd?.exitPrice).toBe('1.08700')
    expect(eurusd?.stopLoss).toBe('1.08423')
    expect(eurusd?.takeProfit).toBe('1.08723')
    expect(eurusd?.volumeLots).toBe('0.10')
    expect(eurusd?.partialExits).toHaveLength(0)
  })

  it('EURUSD candidate: pnlAmount is sum of exit deal profits', () => {
    const candidates = parse()
    const eurusd = candidates.find((c) => c.symbol === 'EURUSD')
    // Only one exit deal with profit 17.70
    expect(parseFloat(eurusd?.pnlAmount ?? '0')).toBeCloseTo(17.70, 2)
  })

  it('GBPUSD candidate: direction short, one partial exit, status closed', () => {
    const candidates = parse()
    const gbpusd = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(gbpusd).toBeDefined()
    expect(gbpusd?.direction).toBe('short')
    expect(gbpusd?.status).toBe('closed')
    expect(gbpusd?.partialExits).toHaveLength(1)
  })

  it('GBPUSD partial exit has correct externalRef and price', () => {
    const candidates = parse()
    const gbpusd = candidates.find((c) => c.symbol === 'GBPUSD')
    const partial = gbpusd?.partialExits[0]
    expect(partial?.externalRef).toBe('mt5_deal_10000004')
    expect(partial?.exitPrice).toBe('1.26850')
    expect(partial?.volumeLots).toBe('0.10')
  })

  it('GBPUSD full-close exit price is the last exit deal (1.26900)', () => {
    const candidates = parse()
    const gbpusd = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(gbpusd?.exitPrice).toBe('1.26900')
  })

  it('GBPUSD pnlAmount is sum of both exit deal profits (25.00 + 20.00 = 45.00)', () => {
    const candidates = parse()
    const gbpusd = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(parseFloat(gbpusd?.pnlAmount ?? '0')).toBeCloseTo(45.00, 2)
  })

  it('USDJPY candidate: status open, no exitPrice, no partials', () => {
    const candidates = parse()
    const usdjpy = candidates.find((c) => c.symbol === 'USDJPY')
    expect(usdjpy).toBeDefined()
    expect(usdjpy?.status).toBe('open')
    expect(usdjpy?.exitTime).toBeNull()
    expect(usdjpy?.exitPrice).toBeNull()
    expect(usdjpy?.partialExits).toHaveLength(0)
  })

  it('USDJPY candidate has SL/TP from the orders table', () => {
    const candidates = parse()
    const usdjpy = candidates.find((c) => c.symbol === 'USDJPY')
    expect(usdjpy?.stopLoss).toBe('145.000')
    expect(usdjpy?.takeProfit).toBe('146.000')
  })

  it('XYZABC candidate: symbol preserved, status closed', () => {
    const candidates = parse()
    const xyz = candidates.find((c) => c.symbol === 'XYZABC')
    expect(xyz).toBeDefined()
    expect(xyz?.symbol).toBe('XYZABC')
    expect(xyz?.status).toBe('closed')
  })
})

describe('reconcileDeals — edge cases', () => {
  it('returns empty array for empty input', () => {
    expect(reconcileDeals([], [])).toHaveLength(0)
  })

  it('skips a group that has only exit deals (orphan exit)', () => {
    // An "out" deal with no corresponding "in" deal is silently dropped
    const { deals: fixtureDeals, orders } = parseMt5Html(FIXTURE)
    // Use only the EURUSD exit deal (no entry)
    const orphan = fixtureDeals.filter((d) => d.dealId === '10000002')
    const result = reconcileDeals(orphan, orders)
    expect(result).toHaveLength(0)
  })

  it('externalRef uses the orderId from the entry deal', () => {
    const candidates = parse()
    const eurusd = candidates.find((c) => c.symbol === 'EURUSD')
    expect(eurusd?.externalRef).toBe('mt5_order_11111111')
  })

  it('SL/TP set to null when order has 0 SL or 0 TP', () => {
    // Synthesise a deal whose order has 0/0 SL/TP
    const deal = {
      dealId: '99', orderId: '88', symbol: 'AUDUSD',
      timeMs: Date.UTC(2024, 5, 1, 10, 0, 0),
      dealType: 'buy', dealDirection: 'in',
      volumeLots: '0.05', price: '0.65000',
      commission: '0.00', swap: '0.00', profit: '0.00',
      balance: '10000.00', comment: '',
    }
    const order = {
      orderId: '88', symbol: 'AUDUSD',
      openTimeMs: Date.UTC(2024, 5, 1, 10, 0, 0),
      orderType: 'buy', volumeLots: '0.05',
      openPrice: '0.65000',
      stopLoss: '0.00000',
      takeProfit: '0',
      closeTimeMs: null, closePrice: null,
      profit: '0.00', comment: '',
    }
    const result = reconcileDeals([deal], [order])
    expect(result).toHaveLength(1)
    expect(result[0]?.stopLoss).toBeNull()
    expect(result[0]?.takeProfit).toBeNull()
  })

  it('commission totals both entry and exit commissions', () => {
    const candidates = parse()
    // EURUSD: entry comm -0.80 + exit comm -0.80 = -1.60
    const eurusd = candidates.find((c) => c.symbol === 'EURUSD')
    expect(parseFloat(eurusd?.commission ?? '0')).toBeCloseTo(-1.60, 2)
  })

  it('partial exit externalRefs follow mt5_deal_{dealId} format', () => {
    const candidates = parse()
    const gbpusd = candidates.find((c) => c.symbol === 'GBPUSD')
    const partial = gbpusd?.partialExits[0]
    expect(partial?.externalRef).toMatch(/^mt5_deal_\d+$/)
  })
})
