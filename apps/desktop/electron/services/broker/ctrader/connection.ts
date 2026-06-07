/**
 * cTrader Open API transport (Wave 4 — `docs/broker-integration.md` §2.2).
 *
 * The wire is Protobuf-over-TLS: each frame is a 4-byte big-endian length prefix
 * followed by a serialised `ProtoMessage`. This module separates the *transport*
 * (a TLS socket + length framing) from the *codec* (ProtoMessage ⇄ bytes), so:
 *   - the adapter logic is tested against a fake {@link CtraderConnection} with no
 *     network at all (CLAUDE.md §19.10 — no live Spotware calls in CI), and
 *   - the protobuf schema is a single, swappable seam (`CtraderCodec`).
 *
 * Read-only forever: this transport only ships the request payloads built in
 * `messages.ts` (auth + read queries) — there is no order-execution path here or
 * anywhere downstream of it (CLAUDE.md §14 #37).
 */

import { connect as tlsConnect } from 'tls'
import { err, ok } from '@cairn/shared-types'
import { FrameDecoder } from '../mt5/frame'
import type { Result } from '@cairn/shared-types'
import type { TLSSocket } from 'tls'

/** A decoded Open API message: the payload-type tag + its specific body. */
export interface CtraderMessage {
  readonly payloadType: number
  readonly payload: unknown
}

/**
 * ProtoMessage ⇄ bytes codec. The production codec wraps protobufjs + the cTrader
 * `.proto` schema; tests inject a trivial JSON codec. Decode throws on a frame it
 * cannot parse — the connection catches and logs (no PII) without crashing.
 */
export interface CtraderCodec {
  encode(msg: CtraderMessage): Buffer
  decode(frame: Buffer): CtraderMessage
}

/** A live (or faked) connection to the Open API. */
export interface CtraderConnection {
  /** Serialise + frame + send one message. */
  send(msg: CtraderMessage): void
  /** Subscribe to inbound decoded messages. */
  onMessage(handler: (msg: CtraderMessage) => void): void
  /** Subscribe to the connection closing (clean or errored). */
  onClose(handler: (reason: string) => void): void
  /** Close the socket. */
  close(): void
}

export interface TlsConnectionDeps {
  host: string
  port: number
  codec: CtraderCodec
  /** Structured, PII-free log line. Defaults to a no-op. */
  log?: (message: string) => void
}

/** Prefix a serialised message with its 4-byte big-endian length. */
function frame(payload: Buffer): Buffer {
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(payload.length, 0)
  return Buffer.concat([prefix, payload])
}

/**
 * Open a TLS connection to the Open API endpoint and adapt it to a
 * {@link CtraderConnection}. Resolves once the TLS handshake completes; rejects
 * (as a `Result` error) if the socket errors before connecting.
 */
export function openTlsConnection(deps: TlsConnectionDeps): Promise<Result<CtraderConnection>> {
  const log = deps.log ?? ((): void => {})
  return new Promise((resolve) => {
    let settled = false
    const messageHandlers = new Set<(m: CtraderMessage) => void>()
    const closeHandlers = new Set<(reason: string) => void>()
    const decoder = new FrameDecoder()

    const socket: TLSSocket = tlsConnect(
      { host: deps.host, port: deps.port, servername: deps.host },
      () => {
        settled = true
        resolve(ok(connection))
      },
    )

    socket.on('data', (chunk: Buffer) => {
      const { frames, oversized } = decoder.push(chunk)
      for (const payload of frames) {
        let msg: CtraderMessage
        try {
          msg = deps.codec.decode(payload)
        } catch {
          log('dropped undecodable frame')
          continue
        }
        for (const handler of messageHandlers) {
          try {
            handler(msg)
          } catch {
            log('message handler threw')
          }
        }
      }
      if (oversized) {
        log('oversized frame; closing connection')
        socket.destroy()
      }
    })

    socket.on('error', (e) => {
      log('socket error')
      if (!settled) {
        settled = true
        resolve(err('CTRADER_CONNECT_FAILED', String(e)))
        return
      }
      for (const handler of closeHandlers) handler(`error: ${String(e)}`)
    })

    socket.on('close', () => {
      if (!settled) return
      for (const handler of closeHandlers) handler('closed')
    })

    const connection: CtraderConnection = {
      send(msg) {
        try {
          socket.write(frame(deps.codec.encode(msg)))
        } catch {
          log('send failed')
        }
      },
      onMessage(handler) {
        messageHandlers.add(handler)
      },
      onClose(handler) {
        closeHandlers.add(handler)
      },
      close() {
        socket.destroy()
      },
    }
  })
}

/**
 * Lazily construct the production protobuf codec.
 *
 * The Open API schema (`OpenApiCommonMessages.proto` + `OpenApiMessages.proto`)
 * is compiled at runtime with protobufjs. Both the library and the bundled `.proto`
 * files are optional at build time, so this returns `null` when they are
 * unavailable — the adapter then reports an `error` status with a clear code
 * rather than crashing, exactly as the keychain and MT5 bridge degrade. Wiring a
 * concrete `.proto` set is the one remaining production step for this transport;
 * all of the adapter logic above is schema-agnostic and fully exercised in tests.
 */
export async function loadProtobufCodec(): Promise<CtraderCodec | null> {
  try {
    // Non-literal specifier so neither tsc nor the bundler hard-requires this
    // optional dependency (it is absent until the proto schema ships).
    const moduleName = 'protobufjs'
    const mod: unknown = await import(/* @vite-ignore */ moduleName).catch(() => null)
    if (!mod) return null
    // The proto wiring (root.loadSync of the bundled schema, ProtoMessage lookup,
    // payloadType → message-type table) is assembled here when the schema ships.
    return null
  } catch {
    return null
  }
}
