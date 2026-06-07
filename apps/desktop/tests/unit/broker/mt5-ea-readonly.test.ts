// @vitest-environment node
//
// Unit test: the MT5 bridge EA is read-only (Wave 4 — docs/broker-integration.md
// §8, CLAUDE.md §14 #37). This is the non-negotiable safety boundary: the bundled
// `.mq5` must contain NO order-execution code path. We grep the source and fail
// if any broker write call appears. Do not weaken this test.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const EA_PATH = join(__dirname, '../../../resources/mt5-bridge/CairnBridge.mq5')

/**
 * Order-execution surface for MQL5. Matches the bare function/method names with a
 * trailing `(` so prose in comments ("never calls OrderSend") does not trip it —
 * we look for call sites, not mentions.
 *
 * Covers raw MQL5 (`OrderSend`, `OrderModify`, `OrderClose`, `OrderSendAsync`,
 * `PositionClose*`, `OrderDelete`) and the CTrade wrapper methods
 * (`trade.Buy(`, `.Sell(`, `.PositionModify(`, etc.).
 */
const FORBIDDEN_CALL = new RegExp(
  [
    'OrderSend(Async)?\\s*\\(',
    'OrderModify\\s*\\(',
    'OrderClose(By)?\\s*\\(',
    'OrderDelete\\s*\\(',
    'PositionClose(By)?\\s*\\(',
    '\\.\\s*Buy\\s*\\(',
    '\\.\\s*Sell\\s*\\(',
    '\\.\\s*PositionModify\\s*\\(',
    '\\.\\s*PositionClose(By)?\\s*\\(',
    '\\.\\s*PositionOpen\\s*\\(',
  ].join('|'),
)

describe('CairnBridge.mq5 — read-only boundary', () => {
  const source = readFileSync(EA_PATH, 'utf-8')

  it('contains no order-execution call', () => {
    const lines = source.split(/\r?\n/)
    const offenders = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => FORBIDDEN_CALL.test(line))
    expect(
      offenders,
      `order-execution call(s) found:\n${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([])
  })

  it('does not pull in the CTrade execution library', () => {
    expect(source).not.toMatch(/#include\s*<\s*Trade\s*\/\s*Trade\.mqh\s*>/i)
  })

  it('does still observe trades (sanity: it is actually a bridge)', () => {
    // Guards against the grep passing simply because the file was gutted.
    expect(source).toMatch(/OnTradeTransaction\s*\(/)
    expect(source).toMatch(/SocketSend\s*\(/)
  })
})
