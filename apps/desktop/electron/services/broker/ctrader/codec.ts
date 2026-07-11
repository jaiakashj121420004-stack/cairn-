/**
 * cTrader Open API protobuf codec (Wave 4 — `docs/broker-integration.md` §2.2 / §8).
 *
 * This is the one production seam the transport in `connection.ts` left open: the
 * concrete `CtraderCodec` that turns a `ProtoMessage` ⇄ bytes using the vendored
 * Spotware schema (`apps/desktop/resources/ctrader-proto/`, compiled at runtime
 * with protobufjs). The wire frame is a `ProtoMessage { payloadType, payload }`
 * whose `payload` is the serialised body of the message named by `payloadType`.
 *
 * READ-ONLY BOUNDARY (CLAUDE.md §14 #37) — enforced HERE, on the send path:
 *   - {@link DECODABLE} is the inbound surface Cairn *reads* (auth/account
 *     responses, the execution stream, symbols, errors, heartbeat).
 *   - {@link ENCODABLE} is the outbound surface Cairn *sends* — auth + read
 *     queries + heartbeat ONLY. It deliberately contains NO order-execution
 *     payload type. `encode()` looks up the message type in this allowlist and
 *     throws for anything absent, so an order-placing message (NewOrder, AmendOrder,
 *     ClosePosition, …) cannot be serialised or sent even though the vendored
 *     schema defines it. `ctrader-readonly.test.ts` asserts this; do not widen
 *     `ENCODABLE` with a write payload type.
 *
 * The vendored schema itself is provenance-tracked in
 * `apps/desktop/resources/ctrader-proto/SOURCE.md`; it is bundled, never fetched
 * at runtime.
 */

import { PAYLOAD } from './messages'
import type { CtraderCodec, CtraderMessage } from './connection'
// Type-only import: erased at compile time, so neither tsc nor the bundler hard-
// requires protobufjs here. The runtime module is injected by the caller, which
// lets `loadProtobufCodec` degrade to null when it (or the schema) is absent.
import type * as protobufjs from 'protobufjs'

/** The runtime protobufjs module shape this codec needs. */
export type ProtobufModule = typeof protobufjs

/**
 * The vendored `.proto` files, in load order. protobufjs resolves the `import`
 * statements between them relative to the same directory, so all four must sit
 * together (see `resources/ctrader-proto/SOURCE.md`).
 */
export const PROTO_FILES = [
  'OpenApiCommonMessages.proto',
  'OpenApiCommonModelMessages.proto',
  'OpenApiModelMessages.proto',
  'OpenApiMessages.proto',
] as const

/**
 * Inbound payload-type → protobuf message name. The READ surface only: every entry
 * is a response/event Cairn consumes. Anything not listed decodes to an empty body
 * (the adapter's switch ignores unknown types).
 */
const DECODABLE: Readonly<Record<number, string>> = {
  [PAYLOAD.ERROR_RES]: 'ProtoErrorRes',
  [PAYLOAD.HEARTBEAT_EVENT]: 'ProtoHeartbeatEvent',
  [PAYLOAD.OA_APPLICATION_AUTH_RES]: 'ProtoOAApplicationAuthRes',
  [PAYLOAD.OA_ACCOUNT_AUTH_RES]: 'ProtoOAAccountAuthRes',
  [PAYLOAD.OA_SYMBOLS_LIST_RES]: 'ProtoOASymbolsListRes',
  [PAYLOAD.OA_EXECUTION_EVENT]: 'ProtoOAExecutionEvent',
  [PAYLOAD.OA_ERROR_RES]: 'ProtoOAErrorRes',
  [PAYLOAD.OA_GET_ACCOUNTS_BY_TOKEN_RES]: 'ProtoOAGetAccountListByAccessTokenRes',
  [PAYLOAD.OA_DEAL_LIST_RES]: 'ProtoOADealListRes',
}

/**
 * Outbound payload-type → protobuf message name. The SEND allowlist — auth, read
 * queries, and the heartbeat ONLY. This is the read-only safety boundary: there is
 * deliberately no order-execution payload type here, so `encode()` cannot serialise
 * one. (CLAUDE.md §14 #37.)
 */
const ENCODABLE: Readonly<Record<number, string>> = {
  [PAYLOAD.HEARTBEAT_EVENT]: 'ProtoHeartbeatEvent',
  [PAYLOAD.OA_APPLICATION_AUTH_REQ]: 'ProtoOAApplicationAuthReq',
  [PAYLOAD.OA_ACCOUNT_AUTH_REQ]: 'ProtoOAAccountAuthReq',
  [PAYLOAD.OA_SYMBOLS_LIST_REQ]: 'ProtoOASymbolsListReq',
  [PAYLOAD.OA_GET_ACCOUNTS_BY_TOKEN_REQ]: 'ProtoOAGetAccountListByAccessTokenReq',
  // Read query for historical backfill (P0.3). NOT an order write — see readonly test.
  [PAYLOAD.OA_DEAL_LIST_REQ]: 'ProtoOADealListReq',
}

/**
 * Conversion to plain objects for the boundary Zod schemas in `messages.ts`:
 *   - `longs: String` — int64 fields (ids, volumes, timestamps) arrive as decimal
 *     strings instead of `Long` instances; the schemas use `z.coerce.number()`.
 *   - enums are left as their numeric id (protobufjs default), which the schemas
 *     also `z.coerce.number()`.
 *   - `defaults: false` — absent optional fields stay `undefined` rather than being
 *     filled with zero/empty, so `optional()` schema fields behave as written.
 */
const TO_OBJECT: protobufjs.IConversionOptions = { longs: String, defaults: false }

/**
 * Build a {@link CtraderCodec} from an already-loaded protobuf {@link protobufjs.Root}.
 * Pure (no I/O), so tests construct it directly from a root loaded off the vendored
 * schema. Throws if a required message type is missing from the root (a schema/load
 * problem the caller treats as "codec unavailable").
 */
export function createCtraderCodec(root: protobufjs.Root): CtraderCodec {
  const ProtoMessage = root.lookupType('ProtoMessage')

  const decodeTypes = new Map<number, protobufjs.Type>()
  for (const [payloadType, name] of Object.entries(DECODABLE)) {
    decodeTypes.set(Number(payloadType), root.lookupType(name))
  }
  const encodeTypes = new Map<number, protobufjs.Type>()
  for (const [payloadType, name] of Object.entries(ENCODABLE)) {
    encodeTypes.set(Number(payloadType), root.lookupType(name))
  }

  function encode(msg: CtraderMessage): Buffer {
    const inner = encodeTypes.get(msg.payloadType)
    if (!inner) {
      // The read-only boundary: a payload type outside the auth/read/heartbeat
      // allowlist (e.g. any order-execution request) cannot be serialised.
      throw new Error(
        `cTrader codec: payloadType ${msg.payloadType} is not in the read-only send allowlist`,
      )
    }
    const body = (msg.payload ?? {}) as Record<string, unknown>
    const invalid = inner.verify(body)
    if (invalid) throw new Error(`cTrader codec: invalid ${inner.name} payload: ${invalid}`)

    const innerBytes = inner.encode(inner.fromObject(body)).finish()
    const envelope = ProtoMessage.create({ payloadType: msg.payloadType, payload: innerBytes })
    return Buffer.from(ProtoMessage.encode(envelope).finish())
  }

  function decode(frame: Buffer): CtraderMessage {
    // Throws on a frame that is not a valid ProtoMessage — the connection catches
    // and logs (no PII) without crashing, per the CtraderCodec contract.
    const envelope = ProtoMessage.decode(frame) as protobufjs.Message & {
      payloadType: number
      payload?: Uint8Array
    }
    const payloadType = envelope.payloadType
    const inner = decodeTypes.get(payloadType)
    if (!inner) {
      // An inbound type Cairn does not consume — surface the tag with an empty
      // body; the adapter's switch falls through to its default no-op.
      return { payloadType, payload: {} }
    }
    const decoded = inner.decode(envelope.payload ?? new Uint8Array(0))
    return { payloadType, payload: inner.toObject(decoded, TO_OBJECT) }
  }

  return { encode, decode }
}

/**
 * The most recent {@link buildCtraderCodec} failure reason, or null after a
 * successful build (or before any build has been attempted). A bare `catch {}`
 * here used to make a broken/missing vendored schema silently indistinguishable
 * from "not configured yet" — `services/broker/index.ts` reads this to populate
 * `broker:diagnostics.ctrader.codecError` so a build failure is always visible,
 * never silent. Module-level (not a return value) so this stays a drop-in
 * addition: `buildCtraderCodec`'s signature and success-path behavior are
 * unchanged for existing callers/tests.
 */
let lastBuildError: string | null = null

/** The reason the last {@link buildCtraderCodec} call returned `null`, or null. */
export function getLastCodecBuildError(): string | null {
  return lastBuildError
}

/**
 * Load the vendored `.proto` schema from `protoDir` with the supplied protobufjs
 * module and build a codec. Returns `null` on any failure (missing files, parse
 * error, missing message type) so the caller degrades gracefully — the adapter
 * reports an `error` status rather than crashing. The failure reason (never
 * swallowed) is recorded and readable via {@link getLastCodecBuildError}.
 */
export function buildCtraderCodec(pb: ProtobufModule, protoDir: string): CtraderCodec | null {
  try {
    const root = pb.loadSync(PROTO_FILES.map((f) => joinProto(protoDir, f)))
    const codec = createCtraderCodec(root)
    lastBuildError = null
    return codec
  } catch (err) {
    lastBuildError = err instanceof Error ? err.message : String(err)
    return null
  }
}

/** Join a proto directory and filename with a forward slash (protobufjs path style). */
function joinProto(dir: string, file: string): string {
  const trimmed = dir.endsWith('/') || dir.endsWith('\\') ? dir.slice(0, -1) : dir
  return `${trimmed}/${file}`
}
