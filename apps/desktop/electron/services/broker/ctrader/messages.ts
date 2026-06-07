/**
 * cTrader Open API message contracts (Wave 4 — `docs/broker-integration.md` §2.2).
 *
 * The wire format is Protobuf-over-TLS: every frame is a `ProtoMessage`
 * `{ payloadType, payload, clientMsgId }` whose `payload` is a specific message
 * decoded by the codec in `connection.ts`. This module owns:
 *   - the payload-type numbers Cairn *reads* (auth responses, execution events,
 *     symbol list, account list, heartbeat/error),
 *   - Zod schemas that validate each decoded payload at the boundary (CLAUDE.md
 *     §2.12 — every input validated), and
 *   - builders for the request payloads Cairn *sends*.
 *
 * READ-ONLY BOUNDARY (CLAUDE.md §14 #37): this file deliberately contains NO
 * order-execution payload types (`PROTO_OA_NEW_ORDER_REQ`,
 * `…_AMEND_ORDER_REQ`, `…_CLOSE_POSITION_REQ`, `…_CANCEL_ORDER_REQ`,
 * `…_AMEND_POSITION_SLTP_REQ`) and no builders for them. An adapter cannot express
 * an order write because the vocabulary to do so is not present. A test enforces
 * this; do not add the missing types.
 */

import { z } from 'zod'

// ── Payload type numbers (read surface only) ────────────────────────────────────

/** Base-protocol payload types shared by all Open API apps. */
export const PAYLOAD = {
  ERROR_RES: 50,
  HEARTBEAT_EVENT: 51,
  /** OAuth application authentication (client id + secret). */
  OA_APPLICATION_AUTH_REQ: 2100,
  OA_APPLICATION_AUTH_RES: 2101,
  /** Per-account authentication with the OAuth access token. */
  OA_ACCOUNT_AUTH_REQ: 2102,
  OA_ACCOUNT_AUTH_RES: 2103,
  /** Read: enumerate the symbols on an account (id → name + lot size). */
  OA_SYMBOLS_LIST_REQ: 2114,
  OA_SYMBOLS_LIST_RES: 2115,
  /** Read: position/order execution stream — the core of this adapter. */
  OA_EXECUTION_EVENT: 2126,
  /** Application-level error response. */
  OA_ERROR_RES: 2142,
  /** Read: accounts authorised by the current access token. */
  OA_GET_ACCOUNTS_BY_TOKEN_REQ: 2149,
  OA_GET_ACCOUNTS_BY_TOKEN_RES: 2150,
} as const

// ── Enums we branch on ──────────────────────────────────────────────────────────

/** ProtoOAExecutionType — only the position-lifecycle members matter here. */
export const EXECUTION_TYPE = {
  ORDER_ACCEPTED: 2,
  ORDER_FILLED: 3,
  ORDER_REPLACED: 4,
  ORDER_CANCELLED: 5,
  ORDER_EXPIRED: 6,
  ORDER_REJECTED: 7,
  ORDER_PARTIAL_FILL: 11,
} as const

/** ProtoOAPositionStatus. */
export const POSITION_STATUS = {
  OPEN: 1,
  CLOSED: 2,
  CREATED: 3,
  ERROR: 4,
} as const

/** ProtoOATradeSide. */
export const TRADE_SIDE = {
  BUY: 1,
  SELL: 2,
} as const

// ── Inbound payload schemas (validated at the boundary) ──────────────────────────
//
// int64 fields may arrive as a number or a string depending on the codec's `longs`
// option; z.coerce.number() accepts both. Prices are protobuf doubles.

const tradeDataSchema = z.object({
  symbolId: z.coerce.number(),
  volume: z.coerce.number(),
  tradeSide: z.coerce.number(),
  openTimestamp: z.coerce.number().optional(),
})

const positionSchema = z.object({
  positionId: z.coerce.number(),
  positionStatus: z.coerce.number(),
  tradeData: tradeDataSchema,
  price: z.coerce.number().optional(),
  stopLoss: z.coerce.number().optional(),
  takeProfit: z.coerce.number().optional(),
  utcLastUpdateTimestamp: z.coerce.number().optional(),
})

const closePositionDetailSchema = z
  .object({
    entryPrice: z.coerce.number().optional(),
    profit: z.coerce.number().optional(),
    closedVolume: z.coerce.number().optional(),
  })
  .optional()

const dealSchema = z.object({
  dealId: z.coerce.number(),
  positionId: z.coerce.number(),
  symbolId: z.coerce.number(),
  tradeSide: z.coerce.number(),
  volume: z.coerce.number(),
  filledVolume: z.coerce.number().optional(),
  executionPrice: z.coerce.number().optional(),
  executionTimestamp: z.coerce.number().optional(),
  closePositionDetail: closePositionDetailSchema,
})

/** ProtoOAExecutionEvent — the position/order lifecycle event we map. */
export const executionEventSchema = z.object({
  ctidTraderAccountId: z.coerce.number(),
  executionType: z.coerce.number(),
  position: positionSchema.optional(),
  deal: dealSchema.optional(),
})

export type CtraderExecutionEvent = z.infer<typeof executionEventSchema>
export type CtraderPosition = z.infer<typeof positionSchema>
export type CtraderDeal = z.infer<typeof dealSchema>

/** ProtoOAApplicationAuthRes — empty body on success; presence == authorised. */
export const applicationAuthResSchema = z.object({}).passthrough()

/** ProtoOAAccountAuthRes — echoes the authorised account id. */
export const accountAuthResSchema = z.object({
  ctidTraderAccountId: z.coerce.number(),
})

/** One light symbol entry (id → name + lot size in cTrader volume units). */
export const lightSymbolSchema = z.object({
  symbolId: z.coerce.number(),
  symbolName: z.string(),
  /** cTrader volume units per 1.0 lot (int64). Optional on some feeds. */
  lotSize: z.coerce.number().optional(),
})

export const symbolsListResSchema = z.object({
  symbol: z.array(lightSymbolSchema).optional(),
})

/** One account authorised by the access token. */
export const ctidAccountSchema = z.object({
  ctidTraderAccountId: z.coerce.number(),
  isLive: z.boolean().optional(),
})

export const getAccountsResSchema = z.object({
  ctidTraderAccount: z.array(ctidAccountSchema).optional(),
})

/** ProtoOAErrorRes / ProtoErrorRes. */
export const errorResSchema = z.object({
  errorCode: z.string().optional(),
  description: z.string().optional(),
})

// ── Outbound request payload builders (read-only operations only) ────────────────

/** ProtoOAApplicationAuthReq. */
export function buildApplicationAuthReq(
  clientId: string,
  clientSecret: string,
): {
  clientId: string
  clientSecret: string
} {
  return { clientId, clientSecret }
}

/** ProtoOAAccountAuthReq. */
export function buildAccountAuthReq(
  ctidTraderAccountId: number,
  accessToken: string,
): {
  ctidTraderAccountId: number
  accessToken: string
} {
  return { ctidTraderAccountId, accessToken }
}

/** ProtoOASymbolsListReq (read). */
export function buildSymbolsListReq(ctidTraderAccountId: number): {
  ctidTraderAccountId: number
  includeArchivedSymbols: boolean
} {
  return { ctidTraderAccountId, includeArchivedSymbols: false }
}

/** ProtoOAGetAccountListByAccessTokenReq (read). */
export function buildGetAccountsReq(accessToken: string): { accessToken: string } {
  return { accessToken }
}

/** ProtoHeartbeatEvent (no body). */
export function buildHeartbeat(): Record<string, never> {
  return {}
}
