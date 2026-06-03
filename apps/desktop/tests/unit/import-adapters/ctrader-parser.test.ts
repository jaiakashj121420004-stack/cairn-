// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseCTraderHtml } from '../../../electron/services/import-adapters/ctrader/parser'

const FIXTURE_DIR = join(__dirname, '../../fixtures/import/ctrader')
const SIMPLE = readFileSync(join(FIXTURE_DIR, 'ctrader-simple.html'), 'utf-8')
const PARTIALS = readFileSync(join(FIXTURE_DIR, 'ctrader-partials.html'), 'utf-8')

// ─── Simple fixture ───────────────────────────────────────────────────────────

describe('parseCTraderHtml — simple fixture', () => {
  it('parses 3 closed positions', () => {
    const { closedPositions } = parseCTraderHtml(SIMPLE)
    expect(closedPositions).toHaveLength(3)
  })

  it('parses 1 open position', () => {
    const { openPositions } = parseCTraderHtml(SIMPLE)
    expect(openPositions).toHaveLength(1)
  })

  it('reports zero parse errors on the well-formed simple fixture', () => {
    const { errors } = parseCTraderHtml(SIMPLE)
    expect(errors).toHaveLength(0)
  })

  it('correctly maps EURUSD closed position fields', () => {
    const { closedPositions } = parseCTraderHtml(SIMPLE)
    const row = closedPositions.find((r) => r.symbol === 'EURUSD')
    expect(row).toBeDefined()
    expect(row?.positionId).toBe('11111111')
    expect(row?.direction).toBe('Buy')
    expect(row?.volumeLots).toBe('0.10')
    expect(row?.openPrice).toBe('1.08523')
    expect(row?.closePrice).toBe('1.08700')
    expect(row?.stopLoss).toBe('1.08423')
    expect(row?.takeProfit).toBe('1.08723')
    expect(row?.commission).toBe('-1.60')
    expect(row?.grossProfit).toBe('17.70')
  })

  it('parses EURUSD open time as correct UTC ms (DD/MM/YYYY format)', () => {
    const { closedPositions } = parseCTraderHtml(SIMPLE)
    const row = closedPositions.find((r) => r.symbol === 'EURUSD')
    // 15/01/2024 09:35:00 UTC
    expect(row?.openTimeMs).toBe(Date.UTC(2024, 0, 15, 9, 35, 0))
  })

  it('parses EURUSD close time as correct UTC ms', () => {
    const { closedPositions } = parseCTraderHtml(SIMPLE)
    const row = closedPositions.find((r) => r.symbol === 'EURUSD')
    // 15/01/2024 10:45:00 UTC
    expect(row?.closeTimeMs).toBe(Date.UTC(2024, 0, 15, 10, 45, 0))
  })

  it('correctly maps USDJPY open position fields', () => {
    const { openPositions } = parseCTraderHtml(SIMPLE)
    const row = openPositions.find((r) => r.symbol === 'USDJPY')
    expect(row).toBeDefined()
    expect(row?.positionId).toBe('33333333')
    expect(row?.direction).toBe('Buy')
    expect(row?.openPrice).toBe('145.500')
    expect(row?.stopLoss).toBe('145.000')
    expect(row?.takeProfit).toBe('146.000')
  })

  it("includes XYZABC row (symbol resolution is not the parser's job)", () => {
    const { closedPositions } = parseCTraderHtml(SIMPLE)
    const row = closedPositions.find((r) => r.symbol === 'XYZABC')
    expect(row).toBeDefined()
  })
})

// ─── Partials fixture ─────────────────────────────────────────────────────────

describe('parseCTraderHtml — partials fixture', () => {
  it('parses 3 closed position rows (2 for GBPUSD pos 55555555 + 1 AUDUSD)', () => {
    // The balance row must be silently skipped
    const { closedPositions } = parseCTraderHtml(PARTIALS)
    expect(closedPositions).toHaveLength(3)
  })

  it('both GBPUSD rows share positionId 55555555', () => {
    const { closedPositions } = parseCTraderHtml(PARTIALS)
    const gbp = closedPositions.filter((r) => r.positionId === '55555555')
    expect(gbp).toHaveLength(2)
  })

  it('the two GBPUSD rows have different close times', () => {
    const { closedPositions } = parseCTraderHtml(PARTIALS)
    const gbp = closedPositions.filter((r) => r.positionId === '55555555')
    const times = new Set(gbp.map((r) => r.closeTimeMs))
    expect(times.size).toBe(2)
  })

  it('AUDUSD has SL "0" and TP "0" (not set)', () => {
    const { closedPositions } = parseCTraderHtml(PARTIALS)
    const au = closedPositions.find((r) => r.symbol === 'AUDUSD')
    expect(au?.stopLoss).toBe('0')
    expect(au?.takeProfit).toBe('0')
  })

  it('silently skips the balance row without recording an error', () => {
    const { closedPositions, errors } = parseCTraderHtml(PARTIALS)
    // Balance row has positionId 99999999 and no symbol/direction
    expect(closedPositions.find((r) => r.positionId === '99999999')).toBeUndefined()
    expect(errors).toHaveLength(0)
  })

  it('parses 1 open position from the separate Open Positions table', () => {
    const { openPositions } = parseCTraderHtml(PARTIALS)
    expect(openPositions).toHaveLength(1)
    expect(openPositions[0]?.positionId).toBe('33333333')
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('parseCTraderHtml — edge cases', () => {
  it('returns empty results for an empty string', () => {
    const { closedPositions, openPositions, errors } = parseCTraderHtml('')
    expect(closedPositions).toHaveLength(0)
    expect(openPositions).toHaveLength(0)
    expect(errors).toHaveLength(0)
  })

  it('reports a parse error for a closed-position row with unparseable open time', () => {
    const html = `<table>
      <tr><td>Closed Positions</td></tr>
      <tr>
        <td>Position ID</td><td>Symbol</td><td>Direction</td><td>Volume</td>
        <td>Open Time</td><td>Open Price</td><td>Close Time</td><td>Close Price</td>
        <td>S / L</td><td>T / P</td><td>Commission</td><td>Swap</td>
        <td>Gross Profit</td><td>Net Profit</td><td>Label</td>
      </tr>
      <tr>
        <td>88</td><td>EURUSD</td><td>Buy</td><td>0.10</td>
        <td>NOT A DATE</td><td>1.09000</td>
        <td>15/01/2024 10:00:00</td><td>1.09200</td>
        <td>1.08800</td><td>1.09500</td>
        <td>-0.80</td><td>0.00</td><td>20.00</td><td>19.20</td><td></td>
      </tr>
    </table>`
    const { closedPositions, errors } = parseCTraderHtml(html)
    expect(closedPositions).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.section).toBe('closed positions')
    expect(errors[0]?.reason).toContain('unparseable open time')
  })

  it('handles ISO date format YYYY-MM-DD HH:MM:SS', () => {
    const html = `<table>
      <tr><td>Closed Positions</td></tr>
      <tr>
        <td>Position ID</td><td>Symbol</td><td>Direction</td><td>Volume</td>
        <td>Open Time</td><td>Open Price</td><td>Close Time</td><td>Close Price</td>
        <td>S / L</td><td>T / P</td><td>Commission</td><td>Swap</td>
        <td>Gross Profit</td><td>Net Profit</td><td>Label</td>
      </tr>
      <tr>
        <td>77</td><td>GBPUSD</td><td>Sell</td><td>0.05</td>
        <td>2024-03-15 14:00:00</td><td>1.27500</td>
        <td>2024-03-15 15:30:00</td><td>1.27200</td>
        <td>1.27700</td><td>1.27000</td>
        <td>-0.40</td><td>0.00</td><td>15.00</td><td>14.60</td><td></td>
      </tr>
    </table>`
    const { closedPositions, errors } = parseCTraderHtml(html)
    expect(closedPositions).toHaveLength(1)
    expect(errors).toHaveLength(0)
    expect(closedPositions[0]?.openTimeMs).toBe(Date.UTC(2024, 2, 15, 14, 0, 0))
  })

  it('handles &amp; in HTML (e.g. Unrealized P&L column header)', () => {
    // The simple fixture uses &amp;L — it must not prevent parsing
    const { openPositions } = parseCTraderHtml(SIMPLE)
    expect(openPositions).toHaveLength(1)
  })

  it('handles a Spanish-language section label (Closed Positions → Posiciones Cerradas)', () => {
    const html = `<table>
      <tr><td>Posiciones Cerradas</td></tr>
      <tr>
        <td>Position ID</td><td>Symbol</td><td>Direction</td><td>Volume</td>
        <td>Open Time</td><td>Open Price</td><td>Close Time</td><td>Close Price</td>
        <td>S / L</td><td>T / P</td><td>Commission</td><td>Swap</td>
        <td>Gross Profit</td><td>Net Profit</td><td>Label</td>
      </tr>
      <tr>
        <td>55</td><td>EURUSD</td><td>Buy</td><td>0.10</td>
        <td>01/02/2024 09:00:00</td><td>1.08000</td>
        <td>01/02/2024 10:00:00</td><td>1.08200</td>
        <td>1.07800</td><td>1.08500</td>
        <td>-0.80</td><td>0.00</td><td>20.00</td><td>19.20</td><td></td>
      </tr>
    </table>`
    const { closedPositions } = parseCTraderHtml(html)
    expect(closedPositions).toHaveLength(1)
    expect(closedPositions[0]?.symbol).toBe('EURUSD')
  })
})
