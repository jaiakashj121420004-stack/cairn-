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

import { join } from 'path'
import { connect as tlsConnect } from 'tls'
import { err, ok } from '@cairn/shared-types'
import { FrameDecoder } from '../mt5/frame'
import { buildCtraderCodec, getLastCodecBuildError } from './codec'
import type { ProtobufModule } from './codec'
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
 * Locate the vendored cTrader `.proto` directory for the current runtime.
 *
 * Mirrors the DB-migrations resolution in `electron/db/index.ts`: in a packaged
 * build the schema is copied beside the asar as an `extraResource`
 * (`<resources>/ctrader-proto`); in dev/built-but-unpackaged runs `__dirname` is
 * `out/main/`, so the source tree's `resources/ctrader-proto` is two levels up.
 */
function resolveProtoDir(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (__dirname.includes('app.asar') && resourcesPath) {
    return join(resourcesPath, 'ctrader-proto')
  }
  return join(__dirname, '..', '..', 'resources', 'ctrader-proto')
}

/**
 * The most recent {@link loadProtobufCodec} failure reason, or null after a
 * successful load (or before any load has been attempted). Populates
 * `broker:diagnostics.ctrader.codecError` (`services/broker/index.ts`) so a
 * missing dependency or a broken vendored schema is always visible, never a
 * bare silent `null`.
 */
let lastCodecError: string | null = null

/** The reason the last {@link loadProtobufCodec} call returned `null`, or null. */
export function getLastCtraderCodecError(): string | null {
  return lastCodecError
}

/**
 * Construct the production protobuf codec from the vendored Open API schema
 * (`resources/ctrader-proto/`, compiled at runtime with protobufjs — see
 * `codec.ts`). The library and the bundled `.proto` files are both treated as
 * optional: this returns `null` when either is unavailable so the adapter reports
 * an `error` status with a clear code rather than crashing, exactly as the keychain
 * and MT5 bridge degrade. The failure reason (never swallowed) is recorded and
 * readable via {@link getLastCtraderCodecError}.
 */
export async function loadProtobufCodec(): Promise<CtraderCodec | null> {
  lastCodecError = null
  try {
    // Non-literal specifier so neither tsc nor the bundler hard-requires the
    // dependency; a missing module degrades to null instead of throwing on import.
    const moduleName = 'protobufjs'
    const mod = (await import(/* @vite-ignore */ moduleName).catch((e: unknown) => {
      lastCodecError = `protobufjs unavailable: ${e instanceof Error ? e.message : String(e)}`
      return null
    })) as ProtobufModule | { default: ProtobufModule } | null
    if (!mod) return null
    // protobufjs is CJS; under some interop it arrives under `.default`.
    const pb = 'loadSync' in mod ? mod : mod.default
    const codec = buildCtraderCodec(pb, resolveProtoDir())
    if (!codec) {
      lastCodecError =
        getLastCodecBuildError() ?? 'failed to build cTrader codec from vendored schema'
      return null
    }
    return codec
  } catch (e) {
    lastCodecError = e instanceof Error ? e.message : String(e)
    return null
  }
}
