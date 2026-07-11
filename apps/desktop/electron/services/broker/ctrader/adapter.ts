/**
 * cTrader live-broker adapter (Wave 4 — `docs/broker-integration.md` §2.2 / §4).
 *
 * Wraps the Open API transport as a {@link LiveBrokerAdapter} so the rest of Cairn
 * is transport-agnostic. The adapter drives the handshake and stream:
 *   1. open the (TLS) connection,
 *   2. `ProtoOAApplicationAuthReq` (client id + secret),
 *   3. `ProtoOAAccountAuthReq` (ctidTraderAccountId + access token),
 *   4. `ProtoOASymbolsListReq` to learn symbolId → name + lot size,
 *   5. consume `ProtoOAExecutionEvent`s, map each to a {@link BrokerEvent}, fan out.
 * A periodic heartbeat keeps the link alive; an unexpected close triggers
 * reconnect with capped backoff.
 *
 * Read-only forever (CLAUDE.md §14 #37): the only payloads this adapter sends are
 * auth + read queries + heartbeats (see `messages.ts`). There is deliberately no
 * place/modify/close method and no order-execution payload anywhere in this file.
 *
 * Every dependency that touches the network/clock/timers is injected, so the whole
 * adapter is driven by a fake connection in tests — no live Spotware calls in CI.
 */

import { err, ok } from '@cairn/shared-types'
import { DEAL_LIST_MAX_SPAN_MS, dealsToBrokerEvents, planDealListWindows } from './backfill'
import { mapExecutionEvent } from './mapper'
import {
  PAYLOAD,
  accountAuthResSchema,
  buildAccountAuthReq,
  buildApplicationAuthReq,
  buildDealListReq,
  buildHeartbeat,
  buildSymbolsListReq,
  dealListResSchema,
  errorResSchema,
  symbolsListResSchema,
} from './messages'
import type { CtraderConnection, CtraderMessage } from './connection'
import type { CtraderSymbolInfo } from './mapper'
import type { CtraderDeal } from './messages'
import type {
  BrokerConnConfig,
  BrokerConnectionStatus,
  BrokerEvent,
  Disposable,
  LiveBrokerAdapter,
  Result,
} from '@cairn/shared-types'

/** Default cTrader volume units per 1.0 lot when a symbol omits its lot size. */
const DEFAULT_LOT_SIZE_CENTI_UNITS = 10_000_000

export interface CtraderAdapterDeps {
  /** OAuth application credentials (from env, never source). */
  clientId: string
  clientSecret: string
  /** The authorised ctidTraderAccountId. */
  accountId: number
  /** Supplies a fresh access token (refreshing if expired). Injected. */
  getAccessToken: () => Promise<Result<string>>
  /** Opens a transport. Production passes a TLS opener; tests pass a fake. */
  openConnection: () => Promise<Result<CtraderConnection>>
  /** Wall-clock provider (UTC ms). */
  now: () => number
  /** Structured, PII-free log line. Defaults to a no-op. */
  log?: (message: string) => void
  /** Reconnect backoff schedule (ms); the last value is reused for further attempts. */
  backoffMs?: number[]
  /** Timer seam for reconnect (injected so tests don't wait). Defaults to setTimeout. */
  schedule?: (fn: () => void, ms: number) => void
  /** Heartbeat cadence (ms). 0 disables it (used in tests). Defaults to 10s. */
  heartbeatMs?: number
  /**
   * On-connect historical backfill lookback (ms). 0 (default) disables backfill;
   * production passes a positive value so pre-existing trades populate read-only.
   */
  backfillLookbackMs?: number
  /** Max span per deal-list request (ms). Defaults to the Spotware ~1-week cap. */
  dealListMaxSpanMs?: number
}

const DEFAULT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

export function createCtraderAdapter(deps: CtraderAdapterDeps): LiveBrokerAdapter {
  const log = deps.log ?? ((): void => {})
  const backoff = deps.backoffMs ?? DEFAULT_BACKOFF_MS
  const schedule = deps.schedule ?? ((fn, ms): void => void setTimeout(fn, ms))
  const heartbeatMs = deps.heartbeatMs ?? 10_000
  const backfillLookbackMs = deps.backfillLookbackMs ?? 0
  const dealListMaxSpanMs = deps.dealListMaxSpanMs ?? DEAL_LIST_MAX_SPAN_MS

  const handlers = new Set<(e: BrokerEvent) => void>()
  const symbols = new Map<number, CtraderSymbolInfo>()

  let connection: CtraderConnection | null = null
  let status: BrokerConnectionStatus = 'disconnected'
  let attempt = 0
  let stopped = false
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  // Historical-backfill state (P0.3). Runs once per adapter instance, after the
  // symbol list is known, by paging read-only deal-list windows.
  let backfillStarted = false
  let backfillWindows: ReturnType<typeof planDealListWindows> = []
  let backfillIndex = 0
  let backfillCurrentFrom = 0
  let backfillDeals: CtraderDeal[] = []

  function fanout(event: BrokerEvent): void {
    for (const handler of handlers) {
      try {
        handler(event)
      } catch {
        log('event handler threw')
      }
    }
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function startHeartbeat(): void {
    if (heartbeatMs <= 0) return
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      connection?.send({ payloadType: PAYLOAD.HEARTBEAT_EVENT, payload: buildHeartbeat() })
    }, heartbeatMs)
  }

  /** Kick off the read-only historical backfill (once) after symbols are known. */
  function startBackfill(): void {
    if (backfillStarted || backfillLookbackMs <= 0) return
    backfillStarted = true
    backfillWindows = planDealListWindows(deps.now(), backfillLookbackMs, dealListMaxSpanMs)
    backfillIndex = 0
    backfillDeals = []
    sendDealListWindow()
  }

  /** Send the deal-list request for the current window, or finish if none remain. */
  function sendDealListWindow(): void {
    const dealWindow = backfillWindows[backfillIndex]
    if (!dealWindow) {
      finishBackfill()
      return
    }
    backfillCurrentFrom = dealWindow.fromTimestamp
    connection?.send({
      payloadType: PAYLOAD.OA_DEAL_LIST_REQ,
      payload: buildDealListReq(deps.accountId, backfillCurrentFrom, dealWindow.toTimestamp),
    })
  }

  /** Reconstruct trades from every collected deal and fan them into the ingest path. */
  function finishBackfill(): void {
    const events = dealsToBrokerEvents(backfillDeals, {
      resolveSymbol: (id) => symbols.get(id) ?? null,
      brokerAccountId: String(deps.accountId),
    })
    backfillDeals = []
    log(`backfill: reconstructed ${events.length} event(s) from history`)
    for (const event of events) fanout(event)
  }

  function handleMessage(msg: CtraderMessage): void {
    switch (msg.payloadType) {
      case PAYLOAD.OA_APPLICATION_AUTH_RES:
        // App is authed → authenticate the specific account.
        void authenticateAccount()
        break

      case PAYLOAD.OA_ACCOUNT_AUTH_RES: {
        const parsed = accountAuthResSchema.safeParse(msg.payload)
        if (!parsed.success) {
          log('malformed account auth res')
          return
        }
        // The stream is live now; refine symbol mapping in the background.
        status = 'connected'
        attempt = 0
        connection?.send({
          payloadType: PAYLOAD.OA_SYMBOLS_LIST_REQ,
          payload: buildSymbolsListReq(deps.accountId),
        })
        startHeartbeat()
        break
      }

      case PAYLOAD.OA_SYMBOLS_LIST_RES: {
        const parsed = symbolsListResSchema.safeParse(msg.payload)
        if (!parsed.success) {
          log('malformed symbols list')
          return
        }
        for (const s of parsed.data.symbol ?? []) {
          symbols.set(s.symbolId, {
            name: s.symbolName,
            lotSizeCentiUnits:
              s.lotSize && s.lotSize > 0 ? s.lotSize : DEFAULT_LOT_SIZE_CENTI_UNITS,
          })
        }
        // Symbols are known — safe to reconstruct backfilled deals by symbol name.
        startBackfill()
        break
      }

      case PAYLOAD.OA_DEAL_LIST_RES: {
        const parsed = dealListResSchema.safeParse(msg.payload)
        if (!parsed.success) {
          log('malformed deal list')
          // Don't stall the whole backfill on one bad page — advance to the next window.
          backfillIndex += 1
          sendDealListWindow()
          return
        }
        const deals = parsed.data.deal ?? []
        for (const d of deals) backfillDeals.push(d)
        const dealWindow = backfillWindows[backfillIndex]
        if (parsed.data.hasMore && deals.length > 0 && dealWindow) {
          // More rows in this window than one page — advance past the newest deal.
          const maxTs = deals.reduce(
            (m, d) => Math.max(m, d.executionTimestamp ?? 0),
            backfillCurrentFrom,
          )
          backfillCurrentFrom = maxTs + 1
          connection?.send({
            payloadType: PAYLOAD.OA_DEAL_LIST_REQ,
            payload: buildDealListReq(deps.accountId, backfillCurrentFrom, dealWindow.toTimestamp),
          })
        } else {
          backfillIndex += 1
          sendDealListWindow()
        }
        break
      }

      case PAYLOAD.OA_EXECUTION_EVENT: {
        const event = mapExecutionEvent(msg.payload, {
          resolveSymbol: (id) => symbols.get(id) ?? null,
          nowMs: deps.now(),
        })
        if (event) fanout(event)
        break
      }

      case PAYLOAD.OA_ERROR_RES:
      case PAYLOAD.ERROR_RES: {
        const parsed = errorResSchema.safeParse(msg.payload)
        // Error codes are not PII; surface for diagnostics without trade data.
        log(`broker error: ${parsed.success ? (parsed.data.errorCode ?? 'unknown') : 'unknown'}`)
        break
      }

      case PAYLOAD.HEARTBEAT_EVENT:
        break

      default:
        break
    }
  }

  async function authenticateAccount(): Promise<void> {
    const token = await deps.getAccessToken()
    if (!token.ok) {
      log(`access token unavailable: ${token.error.code}`)
      status = 'error'
      return
    }
    connection?.send({
      payloadType: PAYLOAD.OA_ACCOUNT_AUTH_REQ,
      payload: buildAccountAuthReq(deps.accountId, token.data),
    })
  }

  function scheduleReconnect(): void {
    if (stopped) return
    const delay = backoff[Math.min(attempt, backoff.length - 1)] ?? DEFAULT_BACKOFF_MS[0] ?? 1_000
    attempt += 1
    log(`reconnect in ${delay}ms (attempt ${attempt})`)
    schedule(() => void establish(), delay)
  }

  async function establish(): Promise<Result<void>> {
    if (stopped) return ok(undefined)
    const opened = await deps.openConnection()
    if (!opened.ok) {
      status = 'error'
      scheduleReconnect()
      return opened
    }
    connection = opened.data
    connection.onMessage(handleMessage)
    connection.onClose((reason) => {
      log(`connection closed: ${reason}`)
      stopHeartbeat()
      connection = null
      if (!stopped) {
        status = 'error'
        scheduleReconnect()
      }
    })
    // Kick off the handshake: authenticate the application first.
    connection.send({
      payloadType: PAYLOAD.OA_APPLICATION_AUTH_REQ,
      payload: buildApplicationAuthReq(deps.clientId, deps.clientSecret),
    })
    return ok(undefined)
  }

  async function connect(_config: BrokerConnConfig): Promise<Result<void>> {
    stopped = false
    attempt = 0
    if (connection) return ok(undefined)
    const res = await establish()
    if (!res.ok) return err('CTRADER_CONNECT_FAILED', res.error.message)
    return ok(undefined)
  }

  function onEvent(handler: (e: BrokerEvent) => void): Disposable {
    handlers.add(handler)
    return { dispose: () => void handlers.delete(handler) }
  }

  async function disconnect(): Promise<void> {
    stopped = true
    stopHeartbeat()
    if (connection) {
      connection.close()
      connection = null
    }
    status = 'disconnected'
    return Promise.resolve()
  }

  return {
    name: 'ctrader',
    supportsLiveStream: true,
    connect,
    onEvent,
    status: () => status,
    disconnect,
  }
}
