/**
 * MT5 bridge wire protocol (Wave 4 — `docs/broker-integration.md` §2.1 / §8).
 *
 * The Cairn Bridge EA and the loopback listener speak length-prefixed JSON
 * frames over a raw TCP socket:
 *
 *   ┌──────────────┬─────────────────────────────┐
 *   │ 4-byte BE len │ UTF-8 JSON envelope (len B)  │
 *   └──────────────┴─────────────────────────────┘
 *
 * The envelope is `{ token, event }`: every frame carries the per-install
 * pairing token (§8 — so another local process can't inject fake fills), and an
 * `event` that normalises to the transport-agnostic {@link BrokerEvent}.
 *
 * This module is pure (no `net`, no `electron`) so it is unit-testable and the
 * test fixtures can build byte-identical frames with {@link encodeFrame}. All
 * inbound bytes are validated with Zod before they become a `BrokerEvent`
 * (CLAUDE.md §2.12 — every input validated at every boundary).
 */

import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import type { BrokerEvent, Result } from '@cairn/shared-types'

/** Bytes reserved for the big-endian frame-length prefix. */
export const LENGTH_PREFIX_BYTES = 4

/**
 * Hard cap on a single frame's JSON payload (§8 — "the listener rejects oversized
 * frames"). A real fill envelope is well under 1 KiB; 64 KiB is comfortable
 * headroom while still bounding a hostile/buggy peer's memory use.
 */
export const MAX_FRAME_BYTES = 64 * 1024

/** Error codes a frame can fail with. `BAD_TOKEN` is treated specially (drop the connection). */
export type FrameErrorCode = 'BAD_JSON' | 'BAD_ENVELOPE' | 'BAD_TOKEN' | 'BAD_EVENT'

const directionSchema = z.enum(['long', 'short'])

/** A trade-bearing event carries the full mechanical payload. */
const tradeEventSchema = z.object({
  type: z.enum(['position_opened', 'position_modified', 'partial_close', 'position_closed']),
  broker: z.literal('mt5'),
  brokerAccountId: z.string().min(1),
  brokerTradeId: z.string().min(1),
  symbol: z.string().min(1),
  direction: directionSchema,
  volumeLots: z.number().finite(),
  price: z.number().finite(),
  stopLoss: z.number().finite().nullable(),
  takeProfit: z.number().finite().nullable(),
  eventTimeMs: z.number().finite(),
  raw: z.unknown(),
})

/**
 * A heartbeat carries no trade data — only liveness. It is validated leniently
 * (no symbol/price/id required) and normalised to a full `BrokerEvent` with
 * neutral placeholders, which the ingest service ignores (it returns early on
 * `heartbeat`).
 */
const heartbeatEventSchema = z.object({
  type: z.literal('heartbeat'),
  broker: z.literal('mt5'),
  brokerAccountId: z.string(),
  eventTimeMs: z.number().finite(),
  raw: z.unknown().optional(),
})

/**
 * Pre-trade gate signals (P0.7) — EA → Cairn control messages, NOT trade fills.
 * `gate.intent` fires when the trader clicks Cairn Buy/Sell on the chart;
 * `gate.levels` streams the draggable SL/TP line prices for the live readout.
 * These are routed to the gate controller, never to the ingest service.
 */
const gateIntentSchema = z.object({
  type: z.literal('gate.intent'),
  broker: z.literal('mt5'),
  brokerAccountId: z.string().min(1),
  symbol: z.string().min(1),
  direction: directionSchema,
  price: z.number().finite(),
  eventTimeMs: z.number().finite(),
})

const gateLevelsSchema = z.object({
  type: z.literal('gate.levels'),
  broker: z.literal('mt5'),
  brokerAccountId: z.string().min(1),
  symbol: z.string().min(1),
  price: z.number().finite(),
  stopLoss: z.number().finite().nullable(),
  takeProfit: z.number().finite().nullable(),
  eventTimeMs: z.number().finite(),
})

export interface GateIntentSignal {
  readonly kind: 'gate.intent'
  readonly brokerAccountId: string
  readonly symbol: string
  readonly direction: 'long' | 'short'
  readonly price: number
  readonly eventTimeMs: number
}

export interface GateLevelsSignal {
  readonly kind: 'gate.levels'
  readonly brokerAccountId: string
  readonly symbol: string
  readonly price: number
  readonly stopLoss: number | null
  readonly takeProfit: number | null
  readonly eventTimeMs: number
}

export type GateSignal = GateIntentSignal | GateLevelsSignal

/** One decoded inbound frame — either a trade event or a gate control signal. */
export type Mt5Inbound =
  | { readonly kind: 'event'; readonly event: BrokerEvent }
  | { readonly kind: 'gate'; readonly signal: GateSignal }

/** Cairn → EA gate command shapes (P0.7). Sent token-authenticated over the same socket. */
export type GateCommand =
  | { readonly type: 'gate.show'; readonly show: boolean }
  | {
      readonly type: 'gate.drawLines'
      readonly stopLoss: number | null
      readonly takeProfit: number | null
      readonly label?: string
    }

const envelopeSchema = z.object({
  token: z.string(),
  event: z.unknown(),
})

function fail(
  code: FrameErrorCode,
  message: string,
): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message } }
}

/** Constant-time token comparison; never short-circuits on a length mismatch leak. */
function tokenMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Frame a JSON-serialisable object into a length-prefixed buffer. Used by the EA
 * conceptually and by tests to build byte-identical fixtures.
 */
export function encodeFrame(obj: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(obj), 'utf8')
  const prefix = Buffer.alloc(LENGTH_PREFIX_BYTES)
  prefix.writeUInt32BE(json.length, 0)
  return Buffer.concat([prefix, json])
}

/**
 * Validate one frame payload (the JSON bytes, prefix already stripped) into a
 * {@link BrokerEvent}, checking the pairing token first.
 *
 * Returns a typed error rather than throwing so the caller can log (no PII) and
 * drop a malformed frame without crashing the listener.
 */
export function decodeMt5Inbound(payload: Buffer, expectedToken: string): Result<Mt5Inbound> {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload.toString('utf8'))
  } catch {
    return fail('BAD_JSON', 'frame is not valid JSON')
  }

  const env = envelopeSchema.safeParse(parsed)
  if (!env.success) return fail('BAD_ENVELOPE', 'frame is missing token/event')

  if (!tokenMatches(env.data.token, expectedToken)) {
    return fail('BAD_TOKEN', 'pairing token mismatch')
  }

  const ev = env.data.event
  const maybeType = (ev as { type?: unknown } | null)?.type

  // ── Gate control signals (P0.7) — routed to the gate controller, not ingest ──
  if (maybeType === 'gate.intent') {
    const gi = gateIntentSchema.safeParse(ev)
    if (!gi.success) return fail('BAD_EVENT', 'invalid gate.intent')
    return {
      ok: true,
      data: {
        kind: 'gate',
        signal: {
          kind: 'gate.intent',
          brokerAccountId: gi.data.brokerAccountId,
          symbol: gi.data.symbol,
          direction: gi.data.direction,
          price: gi.data.price,
          eventTimeMs: gi.data.eventTimeMs,
        },
      },
    }
  }
  if (maybeType === 'gate.levels') {
    const gl = gateLevelsSchema.safeParse(ev)
    if (!gl.success) return fail('BAD_EVENT', 'invalid gate.levels')
    return {
      ok: true,
      data: {
        kind: 'gate',
        signal: {
          kind: 'gate.levels',
          brokerAccountId: gl.data.brokerAccountId,
          symbol: gl.data.symbol,
          price: gl.data.price,
          stopLoss: gl.data.stopLoss,
          takeProfit: gl.data.takeProfit,
          eventTimeMs: gl.data.eventTimeMs,
        },
      },
    }
  }

  if (maybeType === 'heartbeat') {
    const hb = heartbeatEventSchema.safeParse(ev)
    if (!hb.success) return fail('BAD_EVENT', 'invalid heartbeat')
    // Normalise to a full BrokerEvent; trade fields are inert for a heartbeat.
    return {
      ok: true,
      data: {
        kind: 'event',
        event: {
          type: 'heartbeat',
          broker: 'mt5',
          brokerAccountId: hb.data.brokerAccountId,
          brokerTradeId: '',
          symbol: '',
          direction: 'long',
          volumeLots: 0,
          price: 0,
          stopLoss: null,
          takeProfit: null,
          eventTimeMs: hb.data.eventTimeMs,
          raw: hb.data.raw ?? null,
        },
      },
    }
  }

  const trade = tradeEventSchema.safeParse(ev)
  if (!trade.success) return fail('BAD_EVENT', 'invalid trade event')
  const t = trade.data
  return {
    ok: true,
    data: {
      kind: 'event',
      event: {
        type: t.type,
        broker: t.broker,
        brokerAccountId: t.brokerAccountId,
        brokerTradeId: t.brokerTradeId,
        symbol: t.symbol,
        direction: t.direction,
        volumeLots: t.volumeLots,
        price: t.price,
        stopLoss: t.stopLoss,
        takeProfit: t.takeProfit,
        eventTimeMs: t.eventTimeMs,
        raw: t.raw ?? null,
      },
    },
  }
}

/**
 * Back-compat decode limited to trade events (the ingest path). A gate control
 * signal on this path is rejected as `BAD_EVENT`; use {@link decodeMt5Inbound} to
 * receive gate signals.
 */
export function decodeMt5Frame(payload: Buffer, expectedToken: string): Result<BrokerEvent> {
  const res = decodeMt5Inbound(payload, expectedToken)
  if (!res.ok) return res
  if (res.data.kind === 'event') return { ok: true, data: res.data.event }
  return fail('BAD_EVENT', 'gate signal received on the trade-event path')
}

/**
 * Frame a Cairn → EA gate command with the pairing token, so the EA (which
 * token-checks inbound frames the same way the listener does) trusts it.
 */
export function encodeGateCommand(token: string, command: GateCommand): Buffer {
  return encodeFrame({ token, event: command })
}

/**
 * Stateful decoder for the length-prefixed stream. Accumulates socket chunks and
 * yields complete frame payloads as they arrive. Flags an oversized frame so the
 * caller can drop the connection (an over-cap length prefix means the stream can
 * no longer be trusted to re-sync).
 */
export class FrameDecoder {
  private buf: Buffer = Buffer.alloc(0)

  constructor(private readonly maxFrameBytes: number = MAX_FRAME_BYTES) {}

  /**
   * Append a chunk and extract any complete frames. If `oversized` is true the
   * connection should be closed; `frames` returned before the breach are still
   * valid and worth processing.
   */
  push(chunk: Buffer): { frames: Buffer[]; oversized: boolean } {
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk])
    const frames: Buffer[] = []

    while (this.buf.length >= LENGTH_PREFIX_BYTES) {
      const len = this.buf.readUInt32BE(0)
      if (len === 0 || len > this.maxFrameBytes) {
        return { frames, oversized: true }
      }
      if (this.buf.length < LENGTH_PREFIX_BYTES + len) break // wait for the rest
      frames.push(this.buf.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + len))
      this.buf = this.buf.subarray(LENGTH_PREFIX_BYTES + len)
    }

    return { frames, oversized: false }
  }
}
