/**
 * MT5 loopback listener (Wave 4 — `docs/broker-integration.md` §2.1 / §8).
 *
 * A read-only TCP server that accepts length-prefixed JSON frames from the Cairn
 * Bridge EA and hands each validated {@link BrokerEvent} to a caller-supplied
 * sink (the Prompt-1 ingest service, via the {@link createMt5Adapter} wrapper).
 *
 * Security posture (§8, binding):
 *   - **Loopback-only.** Binds `127.0.0.1` (never `0.0.0.0`); additionally,
 *     every accepted connection's remote address is re-checked and a non-local
 *     peer is destroyed immediately (defence in depth).
 *   - **Per-install token.** Every frame must carry the pairing token; a frame
 *     with a wrong/absent token is rejected and the connection dropped.
 *   - **Frame size cap.** An oversized length prefix drops the connection.
 *   - Malformed frames are logged (no PII) and dropped without crashing.
 *
 * This module touches `net` but NOT `electron`, so it runs under the node test
 * environment. The connection handler is exported so the loopback/token guards
 * can be unit-tested with a fake socket.
 */

import { createServer } from 'net'
import { decodeMt5Inbound, FrameDecoder, MAX_FRAME_BYTES } from './frame'
import type { GateSignal } from './frame'
import type { BrokerEvent, Result } from '@cairn/shared-types'
import type { Server, Socket } from 'net'

/** The loopback host the listener binds to. Never `0.0.0.0`. */
export const LOOPBACK_HOST = '127.0.0.1'

/** Reasons a connection or frame can be refused (surfaced to tests / logs, no PII). */
export type Mt5RejectReason =
  | 'non_loopback'
  | 'oversized'
  | 'BAD_JSON'
  | 'BAD_ENVELOPE'
  | 'BAD_TOKEN'
  | 'BAD_EVENT'

export interface Mt5ListenerOptions {
  /** TCP port to bind on the loopback interface. `0` = ephemeral (tests). */
  port: number
  /** Per-install pairing token every frame must present. */
  token: string
  /** Sink for each validated event (the ingest service in production). */
  onEvent: (event: BrokerEvent) => void
  /** Sink for pre-trade gate control signals (P0.7). Defaults to a no-op. */
  onGateSignal?: (signal: GateSignal) => void
  /** Max single-frame payload bytes. Defaults to {@link MAX_FRAME_BYTES}. */
  maxFrameBytes?: number
  /** Structured, PII-free log line. Defaults to a no-op. */
  log?: (message: string) => void
  /** Observability hook for refused connections/frames (drives tests + status). */
  onReject?: (reason: Mt5RejectReason) => void
}

export interface Mt5Listener {
  /** Bind and start accepting connections. Resolves with the bound port. */
  start(): Promise<Result<{ port: number }>>
  /** Stop accepting connections and close the server. */
  stop(): Promise<void>
  /** The bound port once listening, else null. */
  port(): number | null
  /** Write a Cairn→EA frame on the active connection; false if none is live (P0.7). */
  send(frame: Buffer): boolean
}

/**
 * True only for loopback peers — IPv4 127.0.0.0/8, IPv6 `::1`, and the
 * IPv4-mapped `::ffff:127.x.x.x`. Everything else (LAN, public, unknown) is false.
 */
export function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false
  if (addr === '::1') return true
  const v4 = addr.startsWith('::ffff:') ? addr.slice('::ffff:'.length) : addr
  const m = /^(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.exec(v4)
  return m !== null && m[1] === '127'
}

interface ConnectionDeps {
  token: string
  maxFrameBytes: number
  onEvent: (event: BrokerEvent) => void
  onGateSignal: (signal: GateSignal) => void
  log: (message: string) => void
  onReject: (reason: Mt5RejectReason) => void
}

/**
 * Wire one accepted socket: enforce loopback, then decode/validate frames and
 * forward events. Exported for unit testing the refusal paths with a fake socket.
 */
export function handleMt5Connection(socket: Socket, deps: ConnectionDeps): void {
  if (!isLoopbackAddress(socket.remoteAddress)) {
    deps.log('refused connection from non-loopback peer')
    deps.onReject('non_loopback')
    socket.destroy()
    return
  }

  const decoder = new FrameDecoder(deps.maxFrameBytes)

  socket.on('data', (chunk: Buffer) => {
    const { frames, oversized } = decoder.push(chunk)
    for (const payload of frames) {
      const res = decodeMt5Inbound(payload, deps.token)
      if (!res.ok) {
        const code = res.error.code as Mt5RejectReason
        deps.log(`dropped frame: ${code}`)
        deps.onReject(code)
        // A bad token means the peer is not the paired EA — sever the connection.
        if (code === 'BAD_TOKEN') {
          socket.destroy()
          return
        }
        continue
      }
      try {
        if (res.data.kind === 'gate') deps.onGateSignal(res.data.signal)
        else deps.onEvent(res.data.event)
      } catch {
        // The sink (ingest / gate) must never take the listener down.
        deps.log('event sink threw; frame dropped')
      }
    }
    if (oversized) {
      deps.log('oversized frame; closing connection')
      deps.onReject('oversized')
      socket.destroy()
    }
  })

  socket.on('error', () => {
    deps.log('socket error')
  })
}

export function createMt5Listener(options: Mt5ListenerOptions): Mt5Listener {
  const deps: ConnectionDeps = {
    token: options.token,
    maxFrameBytes: options.maxFrameBytes ?? MAX_FRAME_BYTES,
    onEvent: options.onEvent,
    onGateSignal: options.onGateSignal ?? ((): void => {}),
    log: options.log ?? (() => {}),
    onReject: options.onReject ?? (() => {}),
  }

  let server: Server | null = null
  let activeSocket: Socket | null = null

  function start(): Promise<Result<{ port: number }>> {
    return new Promise((resolve) => {
      if (server) {
        resolve({ ok: true, data: { port: port() ?? options.port } })
        return
      }
      const srv = createServer((socket) => {
        // Track the live EA connection so Cairn can send gate commands back to it.
        activeSocket = socket
        socket.on('close', () => {
          if (activeSocket === socket) activeSocket = null
        })
        handleMt5Connection(socket, deps)
      })
      srv.on('error', (err) => {
        deps.log('listener bind error')
        server = null
        resolve({ ok: false, error: { code: 'LISTEN_ERROR', message: String(err) } })
      })
      // Explicit loopback host — the bind itself is never exposed beyond 127.0.0.1.
      srv.listen(options.port, LOOPBACK_HOST, () => {
        server = srv
        const addr = srv.address()
        const bound = typeof addr === 'object' && addr ? addr.port : options.port
        resolve({ ok: true, data: { port: bound } })
      })
    })
  }

  function stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!server) {
        resolve()
        return
      }
      server.close(() => {
        server = null
        resolve()
      })
    })
  }

  function port(): number | null {
    const addr = server?.address()
    return typeof addr === 'object' && addr ? addr.port : null
  }

  /** Write a Cairn→EA frame on the active connection. False if none is live. */
  function send(frame: Buffer): boolean {
    if (!activeSocket || activeSocket.destroyed) return false
    return activeSocket.write(frame)
  }

  return { start, stop, port, send }
}
