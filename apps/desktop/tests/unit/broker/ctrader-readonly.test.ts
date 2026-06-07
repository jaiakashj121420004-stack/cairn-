// @vitest-environment node
//
// Unit test: the cTrader adapter is read-only (Wave 4 — docs/broker-integration.md
// §8, CLAUDE.md §14 #37). The non-negotiable safety boundary: NO order-execution
// payload type, request builder, or call may exist anywhere in the cTrader adapter
// surface. We strip comments (so documentation that *names* the forbidden surface
// doesn't trip the grep) and fail if any order-write identifier appears in code.
// Do not weaken this test.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const CTRADER_DIR = join(__dirname, '../../../electron/services/broker/ctrader')

/**
 * cTrader Open API order-execution surface. These are the only ways to *write* an
 * order through the API; their absence in code is the boundary. The `_REQ` / `Req`
 * suffix keeps read fields like `closePositionDetail` (a deal's close info) clear.
 */
const FORBIDDEN = new RegExp(
  [
    'NEW_ORDER_REQ',
    'AMEND_ORDER_REQ',
    'CLOSE_POSITION_REQ',
    'CANCEL_ORDER_REQ',
    'AMEND_POSITION_SLTP_REQ',
    'NewOrderReq',
    'ClosePositionReq',
    'AmendOrderReq',
    'CancelOrderReq',
    'AmendPositionSLTPReq',
  ].join('|'),
)

/** Remove block + line comments so prose naming the surface is not matched. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('cTrader adapter — read-only boundary', () => {
  const files = readdirSync(CTRADER_DIR).filter((f) => f.endsWith('.ts'))

  it('ships at least the expected adapter modules (sanity)', () => {
    expect(files).toContain('adapter.ts')
    expect(files).toContain('messages.ts')
    expect(files.length).toBeGreaterThanOrEqual(5)
  })

  it('contains no order-execution payload, builder, or call in any module', () => {
    const offenders: Array<{ file: string; line: number; text: string }> = []
    for (const file of files) {
      const code = stripComments(readFileSync(join(CTRADER_DIR, file), 'utf-8'))
      code.split(/\r?\n/).forEach((text, i) => {
        if (FORBIDDEN.test(text)) offenders.push({ file, line: i + 1, text: text.trim() })
      })
    }
    expect(
      offenders,
      `order-execution surface found:\n${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([])
  })

  it('the LiveBrokerAdapter exposes no place/modify/close method', () => {
    // The adapter object literal must only carry the read-only LiveBrokerAdapter
    // surface. Guard against a future method that could express an order write.
    const adapter = stripComments(readFileSync(join(CTRADER_DIR, 'adapter.ts'), 'utf-8'))
    expect(adapter).not.toMatch(/\b(placeOrder|modifyOrder|closeOrder|sendOrder|cancelOrder)\b/i)
  })
})
