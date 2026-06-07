// @vitest-environment node
//
// Unit test: MT5 frame protocol (Wave 4 — docs/broker-integration.md §2.1 / §8).
//
// Covers the length-prefixed decoder's resilience: it reassembles split frames,
// flags an oversized frame so the connection can be dropped, and decodeMt5Frame
// returns a typed error (never throws) on malformed input.

import { describe, it, expect } from 'vitest'
import {
  decodeMt5Frame,
  encodeFrame,
  FrameDecoder,
  MAX_FRAME_BYTES,
} from '../../../electron/services/broker/mt5/frame'
import type { BrokerEvent } from '@cairn/shared-types'

const TOKEN = 'frame-token'

const sampleEvent: BrokerEvent = {
  type: 'position_opened',
  broker: 'mt5',
  brokerAccountId: 'A1',
  brokerTradeId: 'T1',
  symbol: 'EURUSD',
  direction: 'long',
  volumeLots: 0.1,
  price: 1.085,
  stopLoss: 1.084,
  takeProfit: 1.087,
  eventTimeMs: 1,
  raw: null,
}

describe('FrameDecoder', () => {
  it('reassembles a frame delivered across multiple chunks', () => {
    const frame = encodeFrame({ token: TOKEN, event: sampleEvent })
    const dec = new FrameDecoder()

    const a = dec.push(frame.subarray(0, 3))
    expect(a.frames).toHaveLength(0)
    const b = dec.push(frame.subarray(3, 10))
    expect(b.frames).toHaveLength(0)
    const c = dec.push(frame.subarray(10))
    expect(c.frames).toHaveLength(1)
    expect(c.oversized).toBe(false)
  })

  it('yields multiple frames from one chunk', () => {
    const f1 = encodeFrame({ token: TOKEN, event: sampleEvent })
    const f2 = encodeFrame({ token: TOKEN, event: { ...sampleEvent, brokerTradeId: 'T2' } })
    const dec = new FrameDecoder()
    const { frames } = dec.push(Buffer.concat([f1, f2]))
    expect(frames).toHaveLength(2)
  })

  it('flags an oversized length prefix', () => {
    const dec = new FrameDecoder(128)
    const prefix = Buffer.alloc(4)
    prefix.writeUInt32BE(MAX_FRAME_BYTES, 0) // far over the 128-byte cap
    const { oversized } = dec.push(prefix)
    expect(oversized).toBe(true)
  })
})

describe('decodeMt5Frame', () => {
  it('decodes a valid token envelope into a BrokerEvent', () => {
    const frame = encodeFrame({ token: TOKEN, event: sampleEvent })
    const payload = frame.subarray(4)
    const res = decodeMt5Frame(payload, TOKEN)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data).toEqual(sampleEvent)
  })

  it('returns BAD_JSON (not throw) on malformed bytes', () => {
    const res = decodeMt5Frame(Buffer.from('{not json', 'utf8'), TOKEN)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_JSON')
  })

  it('returns BAD_TOKEN on a token mismatch', () => {
    const frame = encodeFrame({ token: 'nope', event: sampleEvent })
    const res = decodeMt5Frame(frame.subarray(4), TOKEN)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_TOKEN')
  })

  it('returns BAD_EVENT on a malformed event payload', () => {
    const frame = encodeFrame({ token: TOKEN, event: { type: 'position_opened', broker: 'mt5' } })
    const res = decodeMt5Frame(frame.subarray(4), TOKEN)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('BAD_EVENT')
  })

  it('normalises a heartbeat (no trade fields) into a full BrokerEvent', () => {
    const frame = encodeFrame({
      token: TOKEN,
      event: { type: 'heartbeat', broker: 'mt5', brokerAccountId: 'A1', eventTimeMs: 42 },
    })
    const res = decodeMt5Frame(frame.subarray(4), TOKEN)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.type).toBe('heartbeat')
      expect(res.data.brokerAccountId).toBe('A1')
      expect(res.data.eventTimeMs).toBe(42)
    }
  })
})
