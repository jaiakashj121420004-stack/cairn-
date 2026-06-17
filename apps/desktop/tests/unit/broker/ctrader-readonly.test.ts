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
import * as protobuf from 'protobufjs'
import { buildCtraderCodec } from '../../../electron/services/broker/ctrader/codec'
import { PAYLOAD } from '../../../electron/services/broker/ctrader/messages'

const CTRADER_DIR = join(__dirname, '../../../electron/services/broker/ctrader')
const PROTO_DIR = join(__dirname, '../../../resources/ctrader-proto')

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

describe('cTrader codec — read-only send path', () => {
  const codec = buildCtraderCodec(protobuf, PROTO_DIR)

  it('builds from the vendored schema (sanity)', () => {
    expect(codec).not.toBeNull()
  })

  it('refuses to encode every order-execution payload type', () => {
    // The Open API order-write surface (ProtoOAPayloadType numbers). The vendored
    // schema DEFINES these, but the codec's send allowlist must exclude them, so
    // encode() throws and no order can ever leave Cairn (CLAUDE.md §14 #37).
    const ORDER_WRITE_PAYLOAD_TYPES = [
      2106, // PROTO_OA_NEW_ORDER_REQ
      2108, // PROTO_OA_CANCEL_ORDER_REQ
      2109, // PROTO_OA_AMEND_ORDER_REQ
      2110, // PROTO_OA_AMEND_POSITION_SLTP_REQ
      2111, // PROTO_OA_CLOSE_POSITION_REQ
    ]
    if (!codec) throw new Error('codec unavailable')
    for (const payloadType of ORDER_WRITE_PAYLOAD_TYPES) {
      expect(() => codec.encode({ payloadType, payload: {} })).toThrow(/read-only send allowlist/)
    }
  })

  it('encodes exactly the auth / read / heartbeat allowlist and rejects everything else', () => {
    if (!codec) throw new Error('codec unavailable')
    // The complete send allowlist with a VALID body for each. Every entry is auth,
    // a read query, or the heartbeat — never an order operation.
    const ALLOWED_SEND: Record<number, Record<string, unknown>> = {
      [PAYLOAD.HEARTBEAT_EVENT]: {},
      [PAYLOAD.OA_APPLICATION_AUTH_REQ]: { clientId: 'cid', clientSecret: 'secret' },
      [PAYLOAD.OA_ACCOUNT_AUTH_REQ]: { ctidTraderAccountId: 1, accessToken: 'token' },
      [PAYLOAD.OA_SYMBOLS_LIST_REQ]: { ctidTraderAccountId: 1, includeArchivedSymbols: false },
      [PAYLOAD.OA_GET_ACCOUNTS_BY_TOKEN_REQ]: { accessToken: 'token' },
    }
    for (const [payloadType, body] of Object.entries(ALLOWED_SEND)) {
      expect(() => codec.encode({ payloadType: Number(payloadType), payload: body })).not.toThrow()
    }
    // Sweep the whole OA payload-type band: anything outside the allowlist must be
    // rejected by the read-only boundary (this band includes every order-write type).
    for (let payloadType = 2100; payloadType <= 2200; payloadType++) {
      if (payloadType in ALLOWED_SEND) continue
      expect(() => codec.encode({ payloadType, payload: {} })).toThrow(/read-only send allowlist/)
    }
  })
})
