/**
 * Live-broker contract (Wave 4 — `docs/broker-integration.md` §4).
 *
 * One typed `BrokerEvent` stream normalises both transports (MT5 loopback EA
 * bridge, cTrader Open API) so the rest of Cairn is transport-agnostic. This is
 * the *contract only* — no transport, no ingest logic lives here; both are
 * desktop-main-process concerns (the server is untouched by this wave).
 *
 * Money/pip rule (CLAUDE.md §2.5 / §19.5): a `BrokerEvent` carries broker-native
 * decimal *numbers*. They are NEVER stored as floats — the desktop ingest service
 * encodes them to integer ticks/lots/cents before any DB write. The `number`
 * fields here are the wire shape, not the storage shape.
 */

import type { Result } from './result'

/** The two platforms Cairn reads from. Read-only, forever (no order execution). */
export type BrokerKind = 'mt5' | 'ctrader'

/**
 * The kinds of position lifecycle events a transport normalises to.
 * `heartbeat` carries no trade data — it only refreshes connection liveness.
 */
export type BrokerEventType =
  | 'position_opened'
  | 'position_modified' // SL/TP changed, or size added/reduced
  | 'partial_close'
  | 'position_closed'
  | 'heartbeat'

/**
 * One normalised broker event. Both transports produce this exact shape.
 *
 * Numeric fields are broker-native decimals (e.g. `1.08512`, `0.25` lots) — the
 * downstream ingest service decimal-encodes them to integers; they are never
 * written to SQLite as floats.
 */
export interface BrokerEvent {
  readonly type: BrokerEventType
  readonly broker: BrokerKind
  /** Broker-side account id; mapped to a Cairn account by the ingest service. */
  readonly brokerAccountId: string
  /** Broker position/order id — the single dedupe key (stored as `external_ref`). */
  readonly brokerTradeId: string
  /** Raw broker symbol (e.g. "EURUSD"); mapped to a Cairn pair downstream. */
  readonly symbol: string
  readonly direction: 'long' | 'short'
  /** Lots for this event (entry total on open; closed lots on a partial). */
  readonly volumeLots: number
  /** Entry / modify / partial-exit / exit price for this event. */
  readonly price: number
  readonly stopLoss: number | null
  readonly takeProfit: number | null
  /** Broker-reported event time, UTC milliseconds. */
  readonly eventTimeMs: number
  /** Original payload, retained for audit / reparse. */
  readonly raw: unknown
}

/** Connection status reported by a {@link LiveBrokerAdapter}. */
export type BrokerConnectionStatus = 'connected' | 'disconnected' | 'error'

/**
 * Connection config handed to {@link LiveBrokerAdapter.connect}. Transport-specific
 * details ride in `options` (MT5: loopback port + pairing token; cTrader: OAuth
 * token handle in the OS keychain) so the interface stays stable as transports land.
 */
export interface BrokerConnConfig {
  readonly broker: BrokerKind
  readonly brokerAccountId: string
  readonly options?: Readonly<Record<string, unknown>>
}

/** Releases a subscription/handler. Mirrors the VS Code `Disposable` shape. */
export interface Disposable {
  dispose(): void
}

/**
 * Base broker-adapter surface (the stable part shared by import + live).
 * Kept intentionally lean; Wave 3 statement import uses its own candidate types,
 * so this interface only carries what the live half extends.
 */
export interface BrokerAdapter {
  readonly name: string
  readonly supportsLiveStream: boolean
}

/**
 * A broker that streams live execution events (Wave 4). The adapter is the
 * *transport*; it only produces {@link BrokerEvent}s and never touches the DB.
 *
 * Read-only boundary (CLAUDE.md §14 #37): there is deliberately no
 * place/modify/close method on this interface — an adapter cannot express an
 * order write.
 */
export interface LiveBrokerAdapter extends BrokerAdapter {
  readonly supportsLiveStream: true
  connect(config: BrokerConnConfig): Promise<Result<void>>
  onEvent(handler: (e: BrokerEvent) => void): Disposable
  status(): BrokerConnectionStatus
  disconnect(): Promise<void>
}

/**
 * How the ingest service records a broker fill (docs/broker-integration.md §3).
 *
 * - `draft_awaiting_context` (default): mechanical fields are prefilled and the
 *   closed trade enters the deferred-reflection queue (`phase_2_complete = 0`).
 *   The honesty fields stay `null`/unreviewed — the trader supplies them later.
 * - `fully_auto`: the trade is written complete and never enters the queue
 *   (`phase_2_complete = 1`). Honesty fields still stay `null`/unreviewed.
 *
 * Neither mode invents honesty data: a trade Cairn never asked the trader about
 * must not silently claim the plan was followed (CLAUDE.md §2.3). Auto-log is
 * capture (job #2), not pre-trade prevention (job #1).
 */
export type BrokerAutoLogMode = 'draft_awaiting_context' | 'fully_auto'

/** The default auto-log mode — keeps the discipline layer intact. */
export const DEFAULT_BROKER_AUTO_LOG_MODE: BrokerAutoLogMode = 'draft_awaiting_context'

/** Settings key the renderer writes and the ingest service reads. */
export const BROKER_AUTO_LOG_MODE_SETTING_KEY = 'broker.auto_log_mode'

/**
 * Decode a stored auto-log-mode setting into a {@link BrokerAutoLogMode}.
 *
 * The renderer persists the value JSON-encoded (via `ipc.settings.set`), so a
 * stored value is the quoted string `"fully_auto"`. Anything missing,
 * unparseable, or unrecognised falls back to the discipline-preserving default —
 * the dangerous direction (silently turning prevention off) is never the
 * fallback. Pure, so both the desktop main process and the web client can reuse
 * it.
 */
export function parseAutoLogMode(raw: string | null | undefined): BrokerAutoLogMode {
  if (raw == null || raw === '') return DEFAULT_BROKER_AUTO_LOG_MODE
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed === 'fully_auto' ? 'fully_auto' : DEFAULT_BROKER_AUTO_LOG_MODE
  } catch {
    return DEFAULT_BROKER_AUTO_LOG_MODE
  }
}

/**
 * MT5 bridge config surfaced over the `broker:getMt5Config` IPC. Drives the
 * Settings → Integrations → MT5 panel: the pairing token to paste into the EA,
 * the loopback port, and where to drop the `.mq5` (docs/broker-integration.md §2.1).
 */
export interface Mt5BridgeConfig {
  /** Per-install pairing token the EA must present on every frame. */
  readonly token: string
  /** Loopback port the listener binds (`127.0.0.1:<port>`). */
  readonly port: number
  /** Discovered `MQL5/Experts` folders for installed terminals (may be empty). */
  readonly expertsPaths: readonly string[]
  /** Human-readable hint for locating the Experts folder when none were found. */
  readonly expertsHint: string
}

// ── cTrader Open API (docs/broker-integration.md §2.2) ──────────────────────────
//
// Unlike the on-device MT5 bridge, cTrader is a cloud transport: execution events
// transit Spotware's servers (read-only inbound). OAuth tokens live in the OS
// keychain (never plaintext on disk); the client id/secret come from env, never
// source. Read-only scope only — the adapter has no order-execution surface.

/** Which Spotware environment a cTrader connection targets. */
export type CtraderEnvironment = 'demo' | 'live'

/** Default environment for a fresh connection. Demo is the safe default. */
export const DEFAULT_CTRADER_ENVIRONMENT: CtraderEnvironment = 'demo'

/** Settings key: the authorised ctidTraderAccountId (JSON-encoded number). */
export const CTRADER_ACCOUNT_ID_SETTING_KEY = 'broker.ctrader.account_id'

/** Settings key: the selected environment (JSON-encoded `"demo"`/`"live"`). */
export const CTRADER_ENVIRONMENT_SETTING_KEY = 'broker.ctrader.environment'

/**
 * Decode a stored environment setting. Anything missing/unrecognised falls back to
 * the safe default (demo). Pure, reused by desktop main + renderer.
 */
export function parseCtraderEnvironment(raw: string | null | undefined): CtraderEnvironment {
  if (raw == null || raw === '') return DEFAULT_CTRADER_ENVIRONMENT
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed === 'live' ? 'live' : 'demo'
  } catch {
    return DEFAULT_CTRADER_ENVIRONMENT
  }
}

/**
 * cTrader panel state for Settings → Integrations → cTrader. Carries no secret:
 * `appConfigured` only reports whether the env-sourced client id/secret are
 * present, never their values.
 */
export interface CtraderRuntimeConfig {
  /** True when CTRADER_CLIENT_ID + CTRADER_CLIENT_SECRET are present in env. */
  readonly appConfigured: boolean
  /** The selected environment. */
  readonly environment: CtraderEnvironment
  /** True when an OAuth token pair is cached in the OS keychain. */
  readonly hasTokens: boolean
  /** The authorised account id, or null if none has been linked yet. */
  readonly accountId: number | null
  /** Current transport status (mirrors the live-stream connection). */
  readonly connection: BrokerConnectionStatus
}

/**
 * A non-blocking, real-time rule breach observed on a live broker position
 * (docs/broker-integration.md §5). Surfaced to the renderer as a calm,
 * mentor-voice toast and recorded as a `rule_violations` row. These are
 * DETECTIONS, not blocks — Cairn cannot stop an order already live at the broker.
 */
export interface BrokerWarning {
  /** Cairn trade the breach is recorded against. */
  readonly tradeId: string
  readonly accountId: string
  /** Engine rule key the breach maps to (e.g. `no_sl_widening`). */
  readonly ruleKey: string
  /** Broker symbol the warning concerns (for the toast copy). */
  readonly symbol: string
  /** Calm, mentor-voice line for the toast/log (CLAUDE.md §1 voice, no emoji). */
  readonly message: string
  /** Machine-readable explanation of what diverged. */
  readonly detail: string
}

/** Status surfaced over the `broker:status` IPC (renderer connection indicator). */
export interface BrokerStatus {
  readonly connection: BrokerConnectionStatus
  /** The connected broker, or null when no transport is attached. */
  readonly broker: BrokerKind | null
  /** Wall-clock ms of the last applied (non-heartbeat) event, or null. */
  readonly lastEventMs: number | null
  /** Wall-clock ms of the last heartbeat, or null. */
  readonly lastHeartbeatMs: number | null
}
