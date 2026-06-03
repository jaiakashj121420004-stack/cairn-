// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTradingViewCsv } from '../../../electron/services/import-adapters/tradingview/parser'

const SIMPLE = readFileSync(
  join(__dirname, '../../fixtures/import/tradingview/tv-simple.csv'),
  'utf-8',
)
const PARTIALS = readFileSync(
  join(__dirname, '../../fixtures/import/tradingview/tv-partials.csv'),
  'utf-8',
)

// ─── tv-simple.csv ────────────────────────────────────────────────────────────

describe('parseTradingViewCsv — tv-simple.csv', () => {
  it('returns 6 rows (2 per trade × 3 trades)', () => {
    const { rows } = parseTradingViewCsv(SIMPLE)
    expect(rows).toHaveLength(6)
  })

  it('reports zero parse errors on the well-formed fixture', () => {
    const { errors } = parseTradingViewCsv(SIMPLE)
    expect(errors).toHaveLength(0)
  })

  it('EURUSD entry row: correct fields', () => {
    const { rows } = parseTradingViewCsv(SIMPLE)
    const entry = rows.find((r) => r.symbol === 'EURUSD' && r.type === 'entry long')
    expect(entry).toBeDefined()
    expect(entry?.tradeNum).toBe('1')
    expect(entry?.price).toBe('1.08523')
    expect(entry?.contracts).toBe('0.10')
    expect(entry?.profit).toBe('')
  })

  it('EURUSD exit row: correct fields', () => {
    const { rows } = parseTradingViewCsv(SIMPLE)
    const exit = rows.find((r) => r.symbol === 'EURUSD' && r.type === 'exit long')
    expect(exit).toBeDefined()
    expect(exit?.tradeNum).toBe('1')
    expect(exit?.price).toBe('1.08700')
    expect(exit?.profit).toBe('17.70')
  })

  it('EURUSD entry dateTimeMs is correct UTC ms for 2024-01-15 09:35', () => {
    const { rows } = parseTradingViewCsv(SIMPLE)
    const entry = rows.find((r) => r.symbol === 'EURUSD' && r.type === 'entry long')
    expect(entry?.dateTimeMs).toBe(Date.UTC(2024, 0, 15, 9, 35, 0))
  })

  it('GBPUSD short entry: type normalised to "entry short"', () => {
    const { rows } = parseTradingViewCsv(SIMPLE)
    const entry = rows.find((r) => r.symbol === 'GBPUSD' && r.type === 'entry short')
    expect(entry).toBeDefined()
    expect(entry?.tradeNum).toBe('2')
  })

  it('USDJPY losing exit: negative profit string preserved', () => {
    const { rows } = parseTradingViewCsv(SIMPLE)
    const exit = rows.find((r) => r.symbol === 'USDJPY' && r.type === 'exit long')
    expect(exit?.profit).toBe('-20.00')
  })

  it('all entry rows have tradeNums matching their exit rows', () => {
    const { rows } = parseTradingViewCsv(SIMPLE)
    const entries = rows.filter((r) => r.type.startsWith('entry'))
    const exits = rows.filter((r) => r.type.startsWith('exit'))
    const entryNums = new Set(entries.map((r) => r.tradeNum))
    const exitNums = new Set(exits.map((r) => r.tradeNum))
    expect(entryNums).toEqual(exitNums)
  })
})

// ─── tv-partials.csv ──────────────────────────────────────────────────────────

describe('parseTradingViewCsv — tv-partials.csv', () => {
  it('returns 5 rows (3 for trade 1, 2 for trade 2)', () => {
    const { rows } = parseTradingViewCsv(PARTIALS)
    expect(rows).toHaveLength(5)
  })

  it('reports zero parse errors', () => {
    const { errors } = parseTradingViewCsv(PARTIALS)
    expect(errors).toHaveLength(0)
  })

  it('trade 1 has 1 entry row and 2 exit rows', () => {
    const { rows } = parseTradingViewCsv(PARTIALS)
    const trade1 = rows.filter((r) => r.tradeNum === '1')
    expect(trade1.filter((r) => r.type === 'entry long')).toHaveLength(1)
    expect(trade1.filter((r) => r.type === 'exit long')).toHaveLength(2)
  })

  it('trade 1 first exit: 0.05 lots at 1.08700, profit 10.00', () => {
    const { rows } = parseTradingViewCsv(PARTIALS)
    const exits = rows
      .filter((r) => r.tradeNum === '1' && r.type === 'exit long')
      .sort((a, b) => a.dateTimeMs - b.dateTimeMs)
    expect(exits[0]?.contracts).toBe('0.05')
    expect(exits[0]?.price).toBe('1.08700')
    expect(exits[0]?.profit).toBe('10.00')
  })

  it('trade 1 second exit: 0.05 lots at 1.08900, profit 20.00', () => {
    const { rows } = parseTradingViewCsv(PARTIALS)
    const exits = rows
      .filter((r) => r.tradeNum === '1' && r.type === 'exit long')
      .sort((a, b) => a.dateTimeMs - b.dateTimeMs)
    expect(exits[1]?.contracts).toBe('0.05')
    expect(exits[1]?.price).toBe('1.08900')
    expect(exits[1]?.profit).toBe('20.00')
  })

  it('trade 2 GBPJPY short: entry + exit rows present', () => {
    const { rows } = parseTradingViewCsv(PARTIALS)
    const trade2 = rows.filter((r) => r.tradeNum === '2')
    expect(trade2).toHaveLength(2)
    expect(trade2.find((r) => r.type === 'entry short')).toBeDefined()
    expect(trade2.find((r) => r.type === 'exit short')).toBeDefined()
  })
})

// ─── Error handling ───────────────────────────────────────────────────────────

describe('parseTradingViewCsv — error handling', () => {
  it('reports an error for a completely empty string', () => {
    const { rows, errors } = parseTradingViewCsv('')
    expect(rows).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('skips a row with an unrecognised Type and reports it in errors', () => {
    const csv = [
      '"Trade #","Date/Time","Symbol","Type","Price","Contracts","Profit","Profit %","Cum. Profit","Run-up","Run-up %","Drawdown","Drawdown %"',
      '"1","2024-01-15 09:35","EURUSD","Entry Long","1.08523","0.10","","","","","","",""',
      '"2","2024-01-15 10:00","EURUSD","MYSTERY","1.08600","0.10","","","","","","",""',
      '"1","2024-01-15 12:00","EURUSD","Exit Long","1.08700","0.10","17.70","1.63%","17.70","","","",""',
    ].join('\n')

    const { rows, errors } = parseTradingViewCsv(csv)
    expect(rows).toHaveLength(2) // the bad row is excluded
    expect(errors).toHaveLength(1)
    expect(errors[0]?.reason).toContain('MYSTERY')
  })

  it('skips a row with an unparseable date and reports it in errors', () => {
    const csv = [
      '"Trade #","Date/Time","Symbol","Type","Price","Contracts","Profit","Profit %","Cum. Profit","Run-up","Run-up %","Drawdown","Drawdown %"',
      '"1","NOT-A-DATE","EURUSD","Entry Long","1.08523","0.10","","","","","","",""',
    ].join('\n')

    const { rows, errors } = parseTradingViewCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors[0]?.reason).toContain('NOT-A-DATE')
  })

  it('accepts optional seconds in date string (YYYY-MM-DD HH:MM:SS)', () => {
    const csv = [
      '"Trade #","Date/Time","Symbol","Type","Price","Contracts","Profit","Profit %","Cum. Profit","Run-up","Run-up %","Drawdown","Drawdown %"',
      '"1","2024-01-15 09:35:00","EURUSD","Entry Long","1.08523","0.10","","","","","","",""',
    ].join('\n')

    const { rows, errors } = parseTradingViewCsv(csv)
    expect(errors).toHaveLength(0)
    expect(rows[0]?.dateTimeMs).toBe(Date.UTC(2024, 0, 15, 9, 35, 0))
  })

  it('skips a row with an invalid Price and reports it in errors', () => {
    const csv = [
      '"Trade #","Date/Time","Symbol","Type","Price","Contracts","Profit","Profit %","Cum. Profit","Run-up","Run-up %","Drawdown","Drawdown %"',
      '"1","2024-01-15 09:35","EURUSD","Entry Long","N/A","0.10","","","","","","",""',
    ].join('\n')

    const { rows, errors } = parseTradingViewCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors[0]?.reason).toContain('Price')
  })
})
