/**
 * TradingView paper-trading / strategy-tester CSV parser.
 *
 * Parses the "List of Trades" CSV exported from TradingView's Strategy Tester
 * or the Paper Trading terminal history. Each trade produces TWO or more rows
 * with the same "Trade #": one entry row and one or more exit rows.
 *
 * Expected columns (in any order, case-insensitive header match):
 *   Trade #  |  Date/Time  |  Symbol  |  Type  |  Price  |  Contracts
 *   Profit   |  Profit %   |  Cum. Profit  |  Run-up  |  Run-up %
 *   Drawdown  |  Drawdown %
 *
 * Type values: "Entry Long" | "Exit Long" | "Entry Short" | "Exit Short"
 * Date/Time format: "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS" (UTC).
 *
 * Design rules (per spec):
 *   - Never silently drop a row. Anything unparseable goes into `errors`.
 *   - No float arithmetic — prices and lots stay as raw strings for the
 *     reconciler; only parseFloat is used for validation, never for storage.
 */

import Papa from 'papaparse'
import type { ImportParseError } from '../../../../shared/types/index'

// ─── Raw row type (pre-reconciliation) ───────────────────────────────────────

export interface RawTvRow {
  readonly tradeNum: string    // raw "Trade #" value, e.g. "1"
  readonly dateTimeMs: number  // UTC ms parsed from "Date/Time"
  readonly symbol: string
  readonly type: string        // normalized to lowercase, e.g. "entry long"
  readonly price: string       // raw decimal string
  readonly contracts: string   // raw decimal string (lots / contracts)
  readonly profit: string      // raw decimal string; "" on entry rows
}

export interface TvParseResult {
  readonly rows: RawTvRow[]
  readonly errors: ImportParseError[]
}

// ─── Public entry point ───────────────────────────────────────────────────────

/** Parse a TradingView CSV string into raw trade rows. */
export function parseTradingViewCsv(csv: string): TvParseResult {
  const errors: ImportParseError[] = []

  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    // Trim whitespace from headers so "Trade #" and " Trade #" both work.
    transformHeader: (h) => h.trim(),
  })

  // Catastrophic parse failure (empty or completely malformed file)
  if (result.data.length === 0) {
    const papaMsg = result.errors.map((e) => e.message).join('; ')
    errors.push({
      section: 'csv',
      rowIndex: 0,
      rawContent: csv.slice(0, 200),
      reason: papaMsg || 'empty or unreadable CSV',
    })
    return { rows: [], errors }
  }

  // Build a normalised-header → actual-header lookup so the parser is
  // resilient to capitalisation variants ("trade #" vs "Trade #").
  const fields = result.meta.fields ?? []
  const normMap = new Map<string, string>()
  for (const h of fields) {
    normMap.set(h.toLowerCase().replace(/\s+/g, ' '), h)
  }

  const col = (row: Record<string, string>, normalised: string): string => {
    const actual = normMap.get(normalised)
    if (!actual) return ''
    return (row[actual] ?? '').trim()
  }

  const rows: RawTvRow[] = []

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i]
    if (!row) continue
    const csvRowIndex = i + 2  // +1 for 0-index, +1 for header row

    const tradeNum  = col(row, 'trade #')
    const dtStr     = col(row, 'date/time')
    const symbol    = col(row, 'symbol')
    const rawType   = col(row, 'type')
    const type      = rawType.toLowerCase()
    const price     = col(row, 'price')
    const contracts = col(row, 'contracts')
    const profit    = col(row, 'profit')  // may be "" on entry rows

    const issues: string[] = []
    if (!tradeNum)                               issues.push('missing Trade #')
    if (!symbol)                                 issues.push('missing Symbol')
    if (!isKnownType(type))                      issues.push(`unrecognised Type "${rawType}"`)
    if (!price || !Number.isFinite(parseFloat(price)))
      issues.push(`invalid Price "${price}"`)
    if (!contracts || !Number.isFinite(parseFloat(contracts)))
      issues.push(`invalid Contracts "${contracts}"`)
    // profit is intentionally optional on entry rows — not an error if blank

    if (issues.length > 0) {
      errors.push({
        section: 'csv',
        rowIndex: csvRowIndex,
        rawContent: Object.values(row).join(' | '),
        reason: issues.join('; '),
      })
      continue
    }

    const dateTimeMs = parseTvDate(dtStr)
    if (dateTimeMs === null) {
      errors.push({
        section: 'csv',
        rowIndex: csvRowIndex,
        rawContent: Object.values(row).join(' | '),
        reason: `unparseable Date/Time "${dtStr}"`,
      })
      continue
    }

    rows.push({ tradeNum, dateTimeMs, symbol, type, price, contracts, profit })
  }

  return { rows, errors }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recognised type strings (already normalised to lowercase before calling).
 * Primary: "entry long" | "exit long" | "entry short" | "exit short"
 * Fallback: "buy" | "sell" (some TradingView export variants)
 */
function isKnownType(type: string): boolean {
  return (
    /^(entry|exit)\s+(long|short)$/.test(type) ||
    /^(buy|sell)$/.test(type)
  )
}

/**
 * Parse a TradingView date string to UTC milliseconds.
 * Handles:
 *   "YYYY-MM-DD HH:MM"     (no seconds — standard TV export)
 *   "YYYY-MM-DD HH:MM:SS"  (with seconds — some TV variants)
 */
function parseTvDate(s: string): number | null {
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/,
  )
  if (!m) return null
  const ms = Date.UTC(
    +(m[1] ?? '0'), +(m[2] ?? '1') - 1, +(m[3] ?? '1'),
    +(m[4] ?? '0'), +(m[5] ?? '0'), +(m[6] ?? '0'),
  )
  return Number.isFinite(ms) ? ms : null
}
