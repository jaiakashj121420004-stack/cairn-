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
  decodeMt5Inbound,
  encodeFrame,
  encodeGateCommand,
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

function firstFrame(obj: unknown): Buffer {
  const { frames } = new FrameDecoder().push(encodeFrame(obj))
  const payload = frames[0]
  if (!payload) throw new Error('expected exactly one frame')
  return payload
}

describe('gate signals (P0.7)', () => {
  const intentEvent = {
    type: 'gate.intent',
    broker: 'mt5',
    brokerAccountId: 'A1',
    symbol: 'EURUSD',
    direction: 'long',
    price: 1.085,
    eventTimeMs: 5,
  }

  it('routes a gate.intent to a gate signal via decodeMt5Inbound', () => {
    const res = decodeMt5Inbound(firstFrame({ token: TOKEN, event: intentEvent }), TOKEN)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.kind).toBe('gate')
    if (res.data.kind !== 'gate') return
    expect(res.data.signal.kind).toBe('gate.intent')
  })

  it('routes a gate.levels signal carrying SL/TP', () => {
    const res = decodeMt5Inbound(
      firstFrame({
        token: TOKEN,
        event: {
          type: 'gate.levels',
          broker: 'mt5',
          brokerAccountId: 'A1',
          symbol: 'EURUSD',
          price: 1.085,
          stopLoss: 1.084,
          takeProfit: 1.09,
          eventTimeMs: 6,
        },
      }),
      TOKEN,
    )
    expect(res.ok).toBe(true)
    if (!res.ok || res.data.kind !== 'gate' || res.data.signal.kind !== 'gate.levels') {
      throw new Error('expected a gate.levels signal')
    }
    expect(res.data.signal.stopLoss).toBe(1.084)
    expect(res.data.signal.takeProfit).toBe(1.09)
  })

  it('still decodes a normal trade event via decodeMt5Inbound', () => {
    const res = decodeMt5Inbound(firstFrame({ token: TOKEN, event: sampleEvent }), TOKEN)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.kind).toBe('event')
  })

  it('decodeMt5Frame rejects a gate signal on the trade-event path', () => {
    const res = decodeMt5Frame(firstFrame({ token: TOKEN, event: intentEvent }), TOKEN)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('BAD_EVENT')
  })

  it('rejects a gate signal with a bad token', () => {
    const res = decodeMt5Inbound(firstFrame({ token: 'wrong', event: intentEvent }), TOKEN)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('BAD_TOKEN')
  })

  it('encodeGateCommand frames a token-authenticated Cairn→EA command', () => {
    const buf = encodeGateCommand(TOKEN, {
      type: 'gate.drawLines',
      stopLoss: 1.084,
      takeProfit: 1.09,
    })
    const { frames } = new FrameDecoder().push(buf)
    const payload = frames[0]
    if (!payload) throw new Error('expected a frame')
    const parsed = JSON.parse(payload.toString('utf8')) as {
      token: string
      event: { type: string }
    }
    expect(parsed.token).toBe(TOKEN)
    expect(parsed.event.type).toBe('gate.drawLines')
  })
})

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
