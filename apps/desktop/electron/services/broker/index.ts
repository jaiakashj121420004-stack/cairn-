/**
 * Main-process singleton for the live-broker ingest service (Wave 4).
 *
 * Holds the one {@link BrokerIngestService} the `broker:status` IPC reads and that
 * both live transports feed events into: the MT5 loopback bridge (§2.1) and the
 * cTrader Open API stream (§2.2). Both normalise to the same {@link BrokerEvent}
 * stream and write through the shared committer path. Account mapping
 * ({@link resolveAccount}) resolves each `(broker, brokerAccountId)` through the
 * per-device `broker_account_map` configured in Settings → Integrations; an
 * unmapped account surfaces UNKNOWN_ACCOUNT rather than guessing (CLAUDE.md §14 #39).
 */

import { randomBytes } from 'crypto'
import {
  BROKER_AUTO_LOG_MODE_SETTING_KEY,
  DEFAULT_BROKER_AUTO_LOG_MODE,
  parseAutoLogMode,
  err,
  ok,
} from '@cairn/shared-types'
import { eq } from 'drizzle-orm'
import { BrowserWindow, shell } from 'electron'
import log from 'electron-log'
import { getDb } from '../../db/index'
import * as schema from '../../db/schema'
import {
  deleteBrokerAccountMap,
  findBrokerAccountBinding,
  listBrokerAccountMap,
  setBrokerAccountMap,
} from './account-map'
import { createCtraderAdapter } from './ctrader/adapter'
import {
  getCtraderAccountId,
  getCtraderAppCredentials,
  getCtraderEnvironment,
  getCtraderStreamHost,
  isCtraderAppConfigured,
  setCtraderAccountId,
  setCtraderEnvironment,
  CTRADER_STREAM_PORT,
} from './ctrader/config'
import {
  getLastCtraderCodecError,
  loadProtobufCodec,
  openTlsConnection,
} from './ctrader/connection'
import { buildAuthUrl, exchangeCode, fetchTradingAccounts } from './ctrader/oauth'
import { captureAuthCode } from './ctrader/oauth-redirect'
import { createCtraderTokenProvider } from './ctrader/session'
import { clearCtraderTokens, readCtraderTokens, storeCtraderTokens } from './ctrader/tokens'
import { createBrokerIngestService } from './ingest'
import { createMt5Adapter } from './mt5/adapter'
import { getMt5Port, getOrCreatePairingToken } from './mt5/config'
import { resolveDefaultSetupId } from './setup-resolver'
import type { FetchLike } from './ctrader/oauth'
import type { BrokerIngestService, BrokerEmitName, ResolvedAccount } from './ingest'
import type {
  BrokerAccountMapEntry,
  BrokerAutoLogMode,
  BrokerConnectionStatus,
  BrokerDiagnostics,
  BrokerKind,
  BrokerWarning,
  CtraderEnvironment,
  CtraderRuntimeConfig,
  LiveBrokerAdapter,
  Result,
  UnmappedBrokerAccount,
} from '@cairn/shared-types'

export type { BrokerIngestService } from './ingest'

let _service: BrokerIngestService | null = null
let _mt5Adapter: LiveBrokerAdapter | null = null
let _ctraderAdapter: LiveBrokerAdapter | null = null

// ── Diagnostics state (broker:diagnostics) ───────────────────────────────────
// Extends the existing per-transport state with the handful of fields nothing
// else already tracks. Populated only where the real event flows through this
// module (adapter `onEvent` callbacks, `startCtraderStream`) — never guessed.
let _mt5LastEventAt: number | null = null
let _ctraderLastEventAt: number | null = null
let _ctraderCodecLoaded = false
let _ctraderCodecError: string | null = null

/** The main-process `fetch` adapted to the injectable {@link FetchLike} shape. */
const nodeFetch: FetchLike = (input, init) =>
  fetch(input, init as RequestInit) as unknown as ReturnType<FetchLike>

/** Forward a `cairn:event` to every open window (same channel sync/trades use). */
function broadcast(name: BrokerEmitName, payload: unknown): void {
  // Live-detection breaches are also written to the app log so the mentor-voice
  // warning survives even if no window is open to toast it (spec §5).
  if (name === 'broker.warning') {
    const w = payload as BrokerWarning
    log.warn(`[broker:detection] ${w.message}`)
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send('cairn:event', { name, payload })
    }
  }
}

/**
 * Map a `(broker, brokerAccountId)` to a Cairn account via the per-device
 * `broker_account_map` (docs/broker-integration.md §6). On a hit, resolve the
 * default setup — {@link resolveDefaultSetupId} falls back to the system
 * "Unclassified" setup when the catalogue has none active — and return the
 * {@link ResolvedAccount}. Returns null ONLY when the account itself is
 * unbound, so the ingest service surfaces UNKNOWN_ACCOUNT and creates no
 * trade. A mapped fill is never dropped for want of a setup (Cairn never
 * guesses an ACCOUNT, CLAUDE.md §14 #39, but a bound account's fill must
 * still land somewhere).
 */
function resolveAccount(broker: BrokerKind, brokerAccountId: string): ResolvedAccount | null {
  try {
    const db = getDb()
    const binding = findBrokerAccountBinding(db, broker, brokerAccountId)
    if (!binding) return null
    const defaultSetupId = resolveDefaultSetupId(db, (m) => log.warn(m))
    return { accountId: binding.cairnAccountId, defaultSetupId }
  } catch (e) {
    log.warn('[broker] resolveAccount lookup failed:', e)
    return null
  }
}

/**
 * Read the configured auto-log mode from the settings table. The renderer writes
 * it JSON-encoded (via `ipc.settings.set`), so a stored value is the quoted
 * string `"fully_auto"`. Any unreadable / unrecognised value falls back to the
 * discipline-preserving default (docs/broker-integration.md §3).
 */
function getAutoLogMode(): BrokerAutoLogMode {
  try {
    const row = getDb()
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, BROKER_AUTO_LOG_MODE_SETTING_KEY))
      .get()
    return parseAutoLogMode(row?.value ?? null)
  } catch {
    return DEFAULT_BROKER_AUTO_LOG_MODE
  }
}

export function getBrokerIngestService(): BrokerIngestService {
  if (_service) return _service
  _service = createBrokerIngestService({
    db: getDb(),
    now: () => Date.now(),
    emit: broadcast,
    resolveAccount,
    getAutoLogMode,
    log: (m) => log.warn(m),
  })
  return _service
}

// ── Account mapping (docs/broker-integration.md §6) ─────────────────────────────
//
// The Settings → Integrations account-map panel reaches these. Bindings are
// per-device config in `broker_account_map` (NOT synced); the in-memory
// seen/buffered unmapped accounts live on the ingest singleton.

/** Every active `(broker, brokerAccountId) → cairnAccountId` binding. */
export function listBrokerAccountBindings(): BrokerAccountMapEntry[] {
  return listBrokerAccountMap(getDb())
}

/** Broker accounts observed on the live stream but not yet bound. */
export function listUnmappedBrokerAccounts(): UnmappedBrokerAccount[] {
  return getBrokerIngestService().listUnmapped()
}

/**
 * Bind a broker account to a Cairn account, then replay any events that streamed in
 * while it was unmapped so they converge into trades. Returns the saved binding.
 */
export function setBrokerAccountBinding(
  broker: BrokerKind,
  brokerAccountId: string,
  cairnAccountId: string,
): BrokerAccountMapEntry {
  const entry = setBrokerAccountMap(getDb(), broker, brokerAccountId, cairnAccountId)
  // Re-resolve buffered fills now that the account is bound (a no-op when nothing was
  // buffered — e.g. no adapter has streamed events this session).
  getBrokerIngestService().flushUnmapped(broker, brokerAccountId)
  return entry
}

/** Remove a binding (soft-delete). Future fills on that account become unmapped again. */
export function deleteBrokerAccountBinding(broker: BrokerKind, brokerAccountId: string): void {
  deleteBrokerAccountMap(getDb(), broker, brokerAccountId)
}

/**
 * Start the MT5 loopback bridge (docs/broker-integration.md §2.1). Binds the
 * read-only listener on `127.0.0.1:<port>` with the per-install pairing token and
 * forwards every {@link BrokerEvent} into the ingest service. Idempotent and
 * non-fatal: a bind failure is logged and the app continues (the bridge is an
 * optional Wave 4 surface). Called once from the main process on startup.
 */
export async function startMt5Bridge(): Promise<void> {
  if (_mt5Adapter) return

  try {
    const service = getBrokerIngestService()
    const adapter = createMt5Adapter({ log: (m) => log.info(`[broker:mt5] ${m}`) })

    adapter.onEvent((event) => {
      _mt5LastEventAt = Date.now()
      const res = service.apply(event)
      if (!res.ok) {
        // UNKNOWN_ACCOUNT / UNRESOLVED_SYMBOL are expected until the account map is
        // configured; surfaced (no PII) rather than thrown so the listener survives.
        log.warn(`[broker:mt5] ingest rejected event: ${res.error.code}`)
      }
    })

    const token = getOrCreatePairingToken()
    const port = getMt5Port()
    const result = await adapter.connect({
      broker: 'mt5',
      brokerAccountId: '',
      options: { port, token },
    })
    if (!result.ok) {
      log.warn(`[broker:mt5] failed to start listener: ${result.error.code}`)
      return
    }
    _mt5Adapter = adapter
    log.info(`[broker:mt5] listening on 127.0.0.1:${port}`)
  } catch (err) {
    log.warn('[broker:mt5] bridge startup failed (non-fatal):', err)
  }
}

/** Stop the MT5 bridge (app shutdown / teardown). */
export async function stopMt5Bridge(): Promise<void> {
  if (!_mt5Adapter) return
  await _mt5Adapter.disconnect()
  _mt5Adapter = null
}

// ── cTrader Open API (docs/broker-integration.md §2.2) ──────────────────────────

/** Current cTrader transport status (independent of the MT5 bridge). */
function ctraderStatus(): BrokerConnectionStatus {
  return _ctraderAdapter?.status() ?? 'disconnected'
}

/**
 * Start (or restart) the cTrader execution stream against the linked account.
 * Loads the protobuf codec once up front: if it is unavailable the stream is not
 * started (no reconnect storm) and a clear code is returned — the OAuth link
 * itself is unaffected. Feeds every mapped {@link BrokerEvent} into the same
 * ingest service the MT5 bridge uses.
 */
async function startCtraderStream(): Promise<Result<void>> {
  const creds = getCtraderAppCredentials()
  if (!creds) return err('CTRADER_NOT_CONFIGURED', 'cTrader OAuth credentials are not configured')

  const accountId = getCtraderAccountId()
  if (accountId === null) return err('CTRADER_NOT_LINKED', 'no cTrader account linked yet')

  const codec = await loadProtobufCodec()
  if (!codec) {
    // Never silently inert (§14 hardening): capture the underlying reason into
    // service state so `broker:diagnostics` surfaces it verbatim, and log it.
    _ctraderCodecLoaded = false
    _ctraderCodecError = getLastCtraderCodecError()
    log.error(`[broker:ctrader] codec unavailable: ${_ctraderCodecError ?? 'unknown error'}`)
    return err(
      'CTRADER_CODEC_UNAVAILABLE',
      'cTrader protobuf schema is not available in this build; account is linked but streaming is off',
    )
  }
  _ctraderCodecLoaded = true
  _ctraderCodecError = null

  if (_ctraderAdapter) await _ctraderAdapter.disconnect()

  const env = getCtraderEnvironment()
  const host = getCtraderStreamHost(env)
  const provider = createCtraderTokenProvider({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    fetchImpl: nodeFetch,
    now: () => Date.now(),
  })

  const adapter = createCtraderAdapter({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    accountId,
    getAccessToken: provider.getAccessToken,
    openConnection: () =>
      openTlsConnection({
        host,
        port: CTRADER_STREAM_PORT,
        codec,
        log: (m) => log.info(`[broker:ctrader] ${m}`),
      }),
    now: () => Date.now(),
    log: (m) => log.info(`[broker:ctrader] ${m}`),
  })

  adapter.onEvent((event) => {
    _ctraderLastEventAt = Date.now()
    const res = getBrokerIngestService().apply(event)
    if (!res.ok) log.warn(`[broker:ctrader] ingest rejected event: ${res.error.code}`)
  })

  const connected = await adapter.connect({ broker: 'ctrader', brokerAccountId: String(accountId) })
  if (!connected.ok) return connected
  _ctraderAdapter = adapter
  return ok(undefined)
}

/**
 * Run the full cTrader OAuth link: open the consent page, capture the redirect on
 * loopback, exchange the code, persist the tokens (keychain) + the chosen account,
 * then start the stream. Read-only scope throughout (docs/broker-integration.md §8).
 */
export async function connectCtrader(): Promise<Result<void>> {
  const creds = getCtraderAppCredentials()
  if (!creds) return err('CTRADER_NOT_CONFIGURED', 'cTrader OAuth credentials are not configured')

  const state = randomBytes(16).toString('hex')
  // Start the loopback capture BEFORE opening the browser so no redirect is missed.
  const capture = captureAuthCode({ state })
  await shell.openExternal(buildAuthUrl(creds.clientId, state))

  const code = await capture
  if (!code.ok) return code

  const tokens = await exchangeCode(nodeFetch, {
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    code: code.data,
    nowMs: Date.now(),
  })
  if (!tokens.ok) return tokens

  const stored = await storeCtraderTokens(tokens.data)
  if (!stored.ok) return stored

  // Pick the account matching the selected environment (else the first one).
  const accounts = await fetchTradingAccounts(nodeFetch, tokens.data.accessToken)
  if (!accounts.ok) return accounts
  if (accounts.data.length === 0)
    return err('CTRADER_NO_ACCOUNTS', 'no trading accounts on this login')
  const wantLive = getCtraderEnvironment() === 'live'
  const chosen = accounts.data.find((a) => a.isLive === wantLive) ?? accounts.data[0]
  if (!chosen) return err('CTRADER_NO_ACCOUNTS', 'no trading accounts on this login')
  setCtraderAccountId(chosen.ctidTraderAccountId)

  return startCtraderStream()
}

/** Disconnect the cTrader stream and clear stored tokens + linked account. */
export async function disconnectCtrader(): Promise<Result<void>> {
  if (_ctraderAdapter) {
    await _ctraderAdapter.disconnect()
    _ctraderAdapter = null
  }
  const cleared = await clearCtraderTokens()
  if (!cleared.ok) return cleared
  return ok(undefined)
}

/** Change the cTrader environment (demo/live). Persisted; takes effect on next connect. */
export function setCtraderEnvironmentSetting(env: CtraderEnvironment): void {
  setCtraderEnvironment(env)
}

/** The cTrader panel state for Settings → Integrations → cTrader. Carries no secret. */
export async function getCtraderRuntimeConfig(): Promise<CtraderRuntimeConfig> {
  const tokens = await readCtraderTokens()
  return {
    appConfigured: isCtraderAppConfigured(),
    environment: getCtraderEnvironment(),
    hasTokens: tokens.ok && tokens.data !== null,
    accountId: getCtraderAccountId(),
    connection: ctraderStatus(),
  }
}

/**
 * Connection-health snapshot for Settings → Integrations (`broker:diagnostics`).
 * Every field is sourced from state this module (or its transports) already
 * tracks — honestly, not guessed: `mt5.listening` mirrors whether the loopback
 * adapter is currently held (`_mt5Adapter`); `ctrader.codecLoaded`/`codecError`
 * are set at every {@link startCtraderStream} attempt (never a bare silent
 * `null`, CLAUDE.md hardening); `lastEventAt` on both transports is stamped in
 * their `onEvent` callbacks above, including heartbeats, so it is the most
 * honest "is anything still arriving" signal available.
 */
export function getBrokerDiagnostics(): BrokerDiagnostics {
  return {
    mt5: {
      listening: _mt5Adapter !== null,
      port: getMt5Port(),
      lastEventAt: _mt5LastEventAt,
    },
    ctrader: {
      linked: getCtraderAccountId() !== null,
      streaming: ctraderStatus() === 'connected',
      codecLoaded: _ctraderCodecLoaded,
      codecError: _ctraderCodecError,
      lastEventAt: _ctraderLastEventAt,
    },
    accountMap: {
      mappedCount: listBrokerAccountMap(getDb()).length,
      unmappedCount: getBrokerIngestService().listUnmapped().length,
    },
  }
}

/**
 * Resume the cTrader stream on app start if an account is already linked. Non-fatal:
 * a missing codec / expired login is logged and the app continues (optional surface).
 */
export async function startCtraderBridge(): Promise<void> {
  try {
    if (getCtraderAccountId() === null || !isCtraderAppConfigured()) return
    const res = await startCtraderStream()
    if (!res.ok) log.warn(`[broker:ctrader] stream not started: ${res.error.code}`)
  } catch (e) {
    log.warn('[broker:ctrader] startup failed (non-fatal):', e)
  }
}

/** Stop the cTrader stream (app shutdown / teardown). Leaves stored tokens intact. */
export async function stopCtraderBridge(): Promise<void> {
  if (!_ctraderAdapter) return
  await _ctraderAdapter.disconnect()
  _ctraderAdapter = null
}
