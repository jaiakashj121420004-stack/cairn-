// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseCTraderHtml } from '../../../electron/services/import-adapters/ctrader/parser'
import { reconcilePositions } from '../../../electron/services/import-adapters/ctrader/reconciler'

const FIXTURE_DIR = join(__dirname, '../../fixtures/import/ctrader')
const SIMPLE   = readFileSync(join(FIXTURE_DIR, 'ctrader-simple.html'), 'utf-8')
const PARTIALS = readFileSync(join(FIXTURE_DIR, 'ctrader-partials.html'), 'utf-8')

function parseAndReconcile(html: string) {
  const { closedPositions, openPositions } = parseCTraderHtml(html)
  return reconcilePositions(closedPositions, openPositions)
}

// ─── Simple fixture ───────────────────────────────────────────────────────────

describe('reconcilePositions — simple fixture', () => {
  it('returns 4 candidates (3 closed + 1 open)', () => {
    const candidates = parseAndReconcile(SIMPLE)
    expect(candidates).toHaveLength(4)
  })

  it('all candidates have unique externalRefs of format ctrader_pos_{id}', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const refs = candidates.map((c) => c.externalRef)
    expect(new Set(refs).size).toBe(4)
    for (const ref of refs) {
      expect(ref).toMatch(/^ctrader_pos_\d+$/)
    }
  })

  it('all candidates have pairId null (IPC handler resolves it)', () => {
    const candidates = parseAndReconcile(SIMPLE)
    for (const c of candidates) expect(c.pairId).toBeNull()
  })

  it('EURUSD candidate: direction long, status closed, correct prices', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const eu = candidates.find((c) => c.symbol === 'EURUSD')
    expect(eu?.direction).toBe('long')
    expect(eu?.status).toBe('closed')
    expect(eu?.entryPrice).toBe('1.08523')
    expect(eu?.exitPrice).toBe('1.08700')
    expect(eu?.stopLoss).toBe('1.08423')
    expect(eu?.takeProfit).toBe('1.08723')
    expect(eu?.volumeLots).toBe('0.10')
    expect(eu?.partialExits).toHaveLength(0)
  })

  it('EURUSD brokerTradeId is the raw position ID without prefix', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const eu = candidates.find((c) => c.symbol === 'EURUSD')
    expect(eu?.brokerTradeId).toBe('11111111')
  })

  it('GBPUSD candidate: direction short, no partials', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const gb = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(gb?.direction).toBe('short')
    expect(gb?.partialExits).toHaveLength(0)
  })

  it('USDJPY candidate: status open, exitTime null, exitPrice null', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const uj = candidates.find((c) => c.symbol === 'USDJPY')
    expect(uj?.status).toBe('open')
    expect(uj?.exitTime).toBeNull()
    expect(uj?.exitPrice).toBeNull()
  })

  it('XYZABC candidate: symbol preserved, status closed', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const xyz = candidates.find((c) => c.symbol === 'XYZABC')
    expect(xyz?.symbol).toBe('XYZABC')
    expect(xyz?.status).toBe('closed')
  })
})

// ─── Partials fixture ─────────────────────────────────────────────────────────

describe('reconcilePositions — partials fixture', () => {
  it('returns 3 candidates (GBPUSD partial + AUDUSD + USDJPY open)', () => {
    const candidates = parseAndReconcile(PARTIALS)
    expect(candidates).toHaveLength(3)
  })

  it('GBPUSD (pos 55555555): 1 partial exit, status closed', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const gb = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(gb?.status).toBe('closed')
    expect(gb?.partialExits).toHaveLength(1)
  })

  it('GBPUSD total volumeLots = 0.20 (sum of two 0.10 rows)', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const gb = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(parseFloat(gb?.volumeLots ?? '0')).toBeCloseTo(0.20, 2)
  })

  it('GBPUSD partial externalRef follows ctrader_pos_{id}_p0 format', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const gb = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(gb?.partialExits[0]?.externalRef).toBe('ctrader_pos_55555555_p0')
  })

  it('GBPUSD partial exit price is 1.26850 (the earlier close)', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const gb = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(gb?.partialExits[0]?.exitPrice).toBe('1.26850')
  })

  it('GBPUSD final exit price is 1.26900 (the later close)', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const gb = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(gb?.exitPrice).toBe('1.26900')
  })

  it('GBPUSD total pnlAmount is 45.00 (25.00 + 20.00)', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const gb = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(parseFloat(gb?.pnlAmount ?? '0')).toBeCloseTo(45.0, 2)
  })

  it('AUDUSD: SL and TP are null (zero values treated as not set)', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const au = candidates.find((c) => c.symbol === 'AUDUSD')
    expect(au?.stopLoss).toBeNull()
    expect(au?.takeProfit).toBeNull()
  })

  it('USDJPY open position from partials fixture is also present', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const uj = candidates.find((c) => c.symbol === 'USDJPY')
    expect(uj?.status).toBe('open')
  })

  it('GBPUSD externalRef is ctrader_pos_55555555 (single canonical key)', () => {
    const candidates = parseAndReconcile(PARTIALS)
    const gb = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(gb?.externalRef).toBe('ctrader_pos_55555555')
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('reconcilePositions — edge cases', () => {
  it('returns empty array for empty input', () => {
    expect(reconcilePositions([], [])).toHaveLength(0)
  })

  it('skips a row with an unrecognised direction', () => {
    const row = {
      positionId: '99',
      symbol: 'EURUSD',
      direction: 'UNKNOWN',
      volumeLots: '0.10',
      openTimeMs: Date.UTC(2024, 0, 1, 9, 0, 0),
      openPrice: '1.09000',
      closeTimeMs: Date.UTC(2024, 0, 1, 10, 0, 0),
      closePrice: '1.09200',
      stopLoss: '1.08800',
      takeProfit: '1.09500',
      commission: '-0.80',
      swap: '0.00',
      grossProfit: '20.00',
      netProfit: '19.20',
      label: '',
    }
    const result = reconcilePositions([row], [])
    expect(result).toHaveLength(0)
  })

  it('handles "Sell" direction as short', () => {
    const candidates = parseAndReconcile(SIMPLE)
    const gb = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(gb?.direction).toBe('short')
  })

  it('commission total spans all partial rows', () => {
    // GBPUSD has -1.60 per row × 2 = -3.20 total
    const candidates = parseAndReconcile(PARTIALS)
    const gb = candidates.find((c) => c.symbol === 'GBPUSD')
    expect(parseFloat(gb?.commission ?? '0')).toBeCloseTo(-3.2, 2)
  })
})
