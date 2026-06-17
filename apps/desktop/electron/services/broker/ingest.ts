/**
 * Live-broker ingest service (Wave 4 — `docs/broker-integration.md` §4/§6).
 *
 * Runs in the desktop main process. Consumes a transport-agnostic
 * {@link BrokerEvent} stream (no transport in this slice — a fake source drives
 * it in tests), folds each position via {@link foldEvent}, and upserts a single
 * `trades` row (+ `trade_partials`) keyed by `external_ref = brokerTradeId` using
 * `ON CONFLICT DO UPDATE` — never a second insert, so replays and the same trade
 * later arriving in a Wave 3 statement import collapse to one row.
 *
 * Encoding goes through the shared `_shared/committer.ts` builder, the very write
 * path the importers use (no fork). On each applied event it emits the existing
 * `cairn:event` (`trade.placed` / `trade.partial-closed` / `trade.closed`) so the
 * dashboard refreshes through the Wave 2 event bus.
 *
 * Live detection (spec §5): after each `position_opened` / `position_modified` is
 * persisted, the event is handed to {@link createLiveDetectionService}, which
 * feeds the live position to the SAME rule engine and raises non-blocking,
 * mentor-voice warnings (SL-widen / TP-cut / size-up / over-trade / past-breaker /
 * outside-killzone). Each breach is recorded as a `rule_violations` row and
 * surfaced over the `broker.warning` channel. Cairn cannot block a live order —
 * these warn, they do not block.
 *
 * Sync (spec §7): after each applied event the persisted trade (+ its partials) is
 * handed to {@link enqueueSyncOp}, so a streamed fill converges to the web app like
 * any manually-logged trade. The server still only ever sees ciphertext. A no-op
 * until the device is enrolled.
 *
 * Reconciliation with statement imports (spec §6): a live row leaves `imported_at`
 * null. When a Wave 3 statement later settles the same `external_ref` it stamps
 * `imported_at` and overwrites the monetary fields ({@link STATEMENT_MONETARY_FIELDS}).
 * From then on a replayed live event must NOT clobber that settled money back to its
 * own price-derived numbers — so the conflict update drops the monetary columns once
 * the row is settled. Statement wins money; live wins timing/modification history.
 */

import { eq, isNotNull } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../db/schema'
import { buildCandidateRows, STATEMENT_MONETARY_FIELDS } from '../import-adapters/_shared/committer'
import { buildSymbolMap } from '../import-adapters/_shared/symbol-resolver'
import { createLiveDetectionService } from '../rules-engine/live-detection'
import { enqueueSyncOp } from '../sync'
import { foldEvent, requiresOpenPosition, toCandidate } from './accumulator'
import type { AccumulatedTrade } from './accumulator'
import type { CairnDb } from '../../db/index'
import type { PairDetail, AccountDetail } from '../import-adapters/_shared/committer'
import type { LiveDetectionService } from '../rules-engine/live-detection'
import type {
  BrokerEvent,
  BrokerKind,
  BrokerStatus,
  BrokerConnectionStatus,
  BrokerAutoLogMode,
  BrokerWarning,
  Result,
  UnmappedBrokerAccount,
} from '@cairn/shared-types'
import type { SyncOpType } from '@cairn/sync-protocol'

/** The Cairn account a broker fill is attributed to. */
export interface ResolvedAccount {
  accountId: string
  defaultSetupId: string
}

/** Names this service may push over the `cairn:event` channel. */
export type BrokerEmitName =
  | 'trade.placed'
  | 'trade.partial-closed'
  | 'trade.closed'
  /** A non-blocking live-detection breach (docs/broker-integration.md §5). */
  | 'broker.warning'

/** Dependencies — injected so the service is testable with a fake event source. */
export interface BrokerIngestDeps {
  db: CairnDb
  /** Wall-clock provider (injected so tests are deterministic). */
  now: () => number
  /** Forwards a `cairn:event` to renderer windows. No-op acceptable. */
  emit: (name: BrokerEmitName, payload: unknown) => void
  /**
   * Maps a `(broker, brokerAccountId)` to a Cairn account; null = not bound.
   * Keyed by broker too, because the same numeric account id can exist on both
   * platforms. A null result is never fabricated into an account (CLAUDE.md §14 #39).
   */
  resolveAccount: (broker: BrokerKind, brokerAccountId: string) => ResolvedAccount | null
  /**
   * Current auto-log mode (docs/broker-integration.md §3). Read fresh per event
   * so a Settings change takes effect without restarting the service. Injected
   * so tests can pin the mode without touching the settings table.
   */
  getAutoLogMode: () => BrokerAutoLogMode
  /**
   * Sync enqueue hook (docs/broker-integration.md §7). Defaults to the real
   * {@link enqueueSyncOp} — a no-op until the device is enrolled. Injected so tests
   * can assert a streamed fill is queued without standing up the sync engine.
   */
  enqueue?: (
    tableName: string,
    recordId: string,
    opType: SyncOpType,
    row: Record<string, unknown> | null,
  ) => void
  /**
   * Optional diagnostic logger (no PII). Used only for the rare unmapped-buffer
   * overflow so a dropped event is never silent (CLAUDE.md §19 "no silent caps").
   */
  log?: (message: string) => void
}

/** Outcome of applying one trade-bearing event. `null` data = heartbeat. */
export interface AppliedEvent {
  tradeId: string
  status: 'open' | 'closed'
  partials: number
  /**
   * True when this closed trade was left owing a deferred reflection (draft
   * mode). False while open, or in fully-auto mode where it never queues.
   */
  awaitingReflection: boolean
}

function fail(
  code: string,
  message: string,
): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message } }
}

export interface BrokerIngestService {
  /** Fold + persist one event. Returns `ok(null)` for heartbeats. */
  apply(event: BrokerEvent): Result<AppliedEvent | null>
  status(): BrokerStatus
  /**
   * Broker accounts seen on the live stream but not yet bound to a Cairn account
   * (docs/broker-integration.md §6). Drives the Settings → Integrations account-map
   * table. Empty once everything observed is bound.
   */
  listUnmapped(): UnmappedBrokerAccount[]
  /**
   * Re-apply the events buffered for a now-bound broker account. Called after a
   * binding is saved so fills that arrived before the mapping existed converge into
   * trades. Returns the number of buffered events that applied. Drops the buffered +
   * seen entry for the account whether or not anything was pending (idempotent).
   */
  flushUnmapped(broker: BrokerKind, brokerAccountId: string): number
}

/**
 * Cap on events buffered for a SINGLE unmapped broker account. A trader who never
 * binds an account could otherwise stream unboundedly; past the cap the oldest
 * buffered event is dropped (and logged — never silently). Generous: a normal
 * session is dozens of events, and binding clears the buffer.
 */
const MAX_BUFFERED_EVENTS_PER_ACCOUNT = 2000

/** Stable map key for an unmapped `(broker, brokerAccountId)` pair. */
function unmappedKey(broker: BrokerKind, brokerAccountId: string): string {
  return `${broker}::${brokerAccountId}`
}

export function createBrokerIngestService(
  deps: BrokerIngestDeps,
  detector?: LiveDetectionService,
): BrokerIngestService {
  const { db, now, emit, resolveAccount, getAutoLogMode } = deps
  const enqueue = deps.enqueue ?? enqueueSyncOp
  const logDiag = deps.log ?? (() => {})

  // Live detection (spec §5). Built from the same db/clock so it shares the
  // ingest's deterministic time in tests; can be injected for isolation.
  const detect = detector ?? createLiveDetectionService({ db, now })

  /** Per-position fold state, keyed by brokerTradeId. */
  const accum = new Map<string, AccumulatedTrade>()

  // Unmapped-account tracking (docs/broker-integration.md §6). When a fill names a
  // broker account with no Cairn binding, we record it (for the Settings table) and
  // buffer its events (so binding it later can replay them into a real trade). Both
  // are keyed by `${broker}::${brokerAccountId}` and live only in memory — they are
  // a session convenience, not durable state.
  const seenUnmapped = new Map<string, UnmappedBrokerAccount>()
  const bufferedUnmapped = new Map<string, BrokerEvent[]>()

  /** Note an unmapped fill: bump the seen record and buffer the event for replay. */
  function recordUnmapped(event: BrokerEvent): void {
    const key = unmappedKey(event.broker, event.brokerAccountId)
    const ts = now()

    const buf = bufferedUnmapped.get(key) ?? []
    buf.push(event)
    if (buf.length > MAX_BUFFERED_EVENTS_PER_ACCOUNT) {
      buf.shift() // drop oldest
      logDiag(
        `[broker] unmapped buffer for ${key} exceeded ${MAX_BUFFERED_EVENTS_PER_ACCOUNT}; dropped oldest event`,
      )
    }
    bufferedUnmapped.set(key, buf)

    const prev = seenUnmapped.get(key)
    seenUnmapped.set(key, {
      broker: event.broker,
      brokerAccountId: event.brokerAccountId,
      firstSeenMs: prev?.firstSeenMs ?? ts,
      lastSeenMs: ts,
      eventCount: buf.length,
    })
  }

  let connection: BrokerConnectionStatus = 'disconnected'
  let broker: BrokerEvent['broker'] | null = null
  let lastEventMs: number | null = null
  let lastHeartbeatMs: number | null = null

  /** Load pip detail + resolve a broker symbol to a Cairn pair id. */
  function resolvePair(symbol: string): PairDetail | null {
    const pairs = db
      .select({
        id: schema.pairs.id,
        symbol: schema.pairs.symbol,
        pipDecimal: schema.pairs.pipDecimal,
        pipValuePerStandardLotCents: schema.pairs.pipValuePerStandardLotCents,
      })
      .from(schema.pairs)
      .all()

    const autoMap = buildSymbolMap(pairs)
    const pairId = autoMap.get(symbol.toUpperCase()) ?? null
    if (!pairId) return null
    const pair = pairs.find((p) => p.id === pairId)
    return pair
      ? {
          id: pair.id,
          pipDecimal: pair.pipDecimal,
          pipValuePerStandardLotCents: pair.pipValuePerStandardLotCents,
        }
      : null
  }

  function loadAccount(accountId: string): AccountDetail | null {
    const row = db
      .select({ id: schema.accounts.id, accountSizeCents: schema.accounts.accountSizeCents })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .get()
    return row ? { id: row.id, accountSizeCents: row.accountSizeCents } : null
  }

  function emitFor(
    type: BrokerEvent['type'],
    tradeId: string,
    accountId: string,
    pnlCents: number | null,
  ): void {
    switch (type) {
      case 'position_opened':
        emit('trade.placed', { tradeId, accountId })
        break
      case 'partial_close':
        emit('trade.partial-closed', { tradeId, accountId })
        break
      case 'position_closed':
        emit('trade.closed', { tradeId, accountId, pnlCents: pnlCents ?? 0 })
        break
      case 'position_modified':
      case 'heartbeat':
        break
    }
  }

  function apply(event: BrokerEvent): Result<AppliedEvent | null> {
    connection = 'connected'
    broker = event.broker

    if (event.type === 'heartbeat') {
      lastHeartbeatMs = now()
      return { ok: true, data: null }
    }

    const prev = accum.get(event.brokerTradeId)
    if (!prev && requiresOpenPosition(event.type)) {
      return fail(
        'NO_OPEN_POSITION',
        `Received ${event.type} for unknown position ${event.brokerTradeId}`,
      )
    }

    const next = foldEvent(prev, event)
    if (!next) {
      return fail('NO_OPEN_POSITION', `Could not fold ${event.type} for ${event.brokerTradeId}`)
    }
    accum.set(event.brokerTradeId, next)

    const account = resolveAccount(event.broker, event.brokerAccountId)
    if (!account) {
      // Not bound yet: surface it for the account-map UI and buffer the event so a
      // later binding can replay it into a trade. Never fabricated (CLAUDE.md §14 #39).
      recordUnmapped(event)
      return fail(
        'UNKNOWN_ACCOUNT',
        `No Cairn account mapped to ${event.broker} account ${event.brokerAccountId}`,
      )
    }

    const pair = resolvePair(next.symbol)
    if (!pair) {
      // Never silently dropped — surfaced for symbol resolution (spec §6).
      return fail('UNRESOLVED_SYMBOL', `No Cairn pair for broker symbol ${next.symbol}`)
    }

    const accountDetail = loadAccount(account.accountId)
    if (!accountDetail) {
      return fail('UNKNOWN_ACCOUNT', `Cairn account not found: ${account.accountId}`)
    }

    const nowMs = now()
    const candidate = toCandidate(next)

    // Auto-log mode (docs/broker-integration.md §3). Draft → the closed trade is
    // owed a reflection and lands in the Wave 3 queue; fully-auto → complete, no
    // follow-up. NEITHER mode fills the honesty fields — buildCandidateRows
    // leaves them null/unreviewed, never "clean" (CLAUDE.md §2.3).
    const autoLogMode = getAutoLogMode()
    const phase2Complete: 0 | 1 = autoLogMode === 'fully_auto' ? 1 : 0

    try {
      let tradeId = ''
      let pnlCents: number | null = null

      db.transaction(() => {
        // Resolve the canonical row id for this external_ref so partials and the
        // upsert reference the original trade, never a fresh one. `importedAt`
        // non-null ⟺ a statement already settled this row (spec §6) — captured here
        // so the conflict update can leave the settled monetary fields alone.
        const existing = db
          .select({ id: schema.trades.id, importedAt: schema.trades.importedAt })
          .from(schema.trades)
          .where(eq(schema.trades.externalRef, candidate.externalRef))
          .get()
        tradeId = existing?.id ?? uuidv7()
        const settled = existing != null && existing.importedAt != null

        const { trade, partials } = buildCandidateRows(candidate, tradeId, pair, accountDetail, {
          accountId: account.accountId,
          defaultSetupId: account.defaultSetupId,
          brokerSource: next.broker,
          nowMs,
          phase2Complete,
          // Live capture carries no settled P&L → leave imported_at null (spec §6).
          settledImport: false,
        })
        pnlCents = trade.pnlCents ?? null

        // Trade: insert, or update in place on external_ref conflict.
        //
        // The conflict SET updates only MECHANICAL fields (prices, lots, exit,
        // P&L, status…). id/createdAt are preserved, and so are the honesty +
        // deferred-reflection columns: once the trader reflects on a draft, a
        // later modification or a replay of the same fill must never overwrite
        // that self-assessment with nulls (CLAUDE.md §2.3 honesty boundary).
        // The disposition (phase_2_complete) is fixed at first capture, so it is
        // likewise not re-stamped here. imported_at is never re-stamped either, so
        // a live replay can't erase a statement's settled marker (spec §6).
        const {
          id: _id,
          createdAt: _createdAt,
          importedAt: _importedAt,
          followedPlanExactly: _followedPlanExactly,
          planChangesDescription: _planChangesDescription,
          slMoved: _slMoved,
          slMovedReason: _slMovedReason,
          tpMoved: _tpMoved,
          enteredBeforeMss: _enteredBeforeMss,
          revengeTradeFlag: _revengeTradeFlag,
          rulesBroken: _rulesBroken,
          isClean: _isClean,
          postCalmScore: _postCalmScore,
          whatIDidRight: _whatIDidRight,
          whatIDidWrong: _whatIDidWrong,
          tags: _tags,
          maePips: _maePips,
          mfePips: _mfePips,
          phase2Complete: _phase2Complete,
          ...tradeSet
        } = trade

        // Statement wins money (spec §6): once a statement has settled this row, a
        // replayed live event must NOT overwrite the realised P&L with its own
        // price-derived numbers. Drop the monetary columns (STATEMENT_MONETARY_FIELDS)
        // from the conflict update; on an unsettled row the full mechanical set applies.
        const monetary: readonly string[] = STATEMENT_MONETARY_FIELDS
        const conflictSet = settled
          ? (Object.fromEntries(
              Object.entries(tradeSet).filter(([k]) => !monetary.includes(k)),
            ) as typeof tradeSet)
          : tradeSet

        db.insert(schema.trades)
          .values(trade)
          .onConflictDoUpdate({
            target: schema.trades.externalRef,
            targetWhere: isNotNull(schema.trades.externalRef),
            set: conflictSet,
          })
          .run()

        // Partials: each carries its own external_ref, so a replayed partial
        // updates its row rather than inserting a duplicate.
        for (const partial of partials) {
          const { id: _pid, createdAt: _pcreatedAt, ...partialSet } = partial
          db.insert(schema.tradePartials)
            .values(partial)
            .onConflictDoUpdate({
              target: schema.tradePartials.externalRef,
              targetWhere: isNotNull(schema.tradePartials.externalRef),
              set: partialSet,
            })
            .run()
        }
      })

      lastEventMs = nowMs
      emitFor(event.type, tradeId, account.accountId, pnlCents)

      // Sync enqueue (spec §7) — converge the streamed fill to the web app like any
      // other trade. Done AFTER the transaction: enqueueSyncOp opens its own
      // transaction and must not nest. The canonical persisted rows are re-read so
      // the queued envelope matches the upserted state. No-op until enrolled.
      const persisted = db.select().from(schema.trades).where(eq(schema.trades.id, tradeId)).get()
      if (persisted) {
        enqueue('trades', tradeId, 'upsert', persisted)
        const persistedPartials = db
          .select()
          .from(schema.tradePartials)
          .where(eq(schema.tradePartials.tradeId, tradeId))
          .all()
        for (const p of persistedPartials) enqueue('trade_partials', p.id, 'upsert', p)
      }

      // Live detection (spec §5) — prevention in real time. Runs only on the two
      // trade-shaping events, after the row exists so violations carry its FK.
      // Best-effort: it never throws, so a detection fault cannot break capture.
      if (event.type === 'position_opened' || event.type === 'position_modified') {
        const warnings = detect.evaluate(event, {
          accountId: account.accountId,
          tradeId,
          pairId: pair.id,
          pipDecimal: pair.pipDecimal,
        })
        for (const w of warnings) {
          emit('broker.warning', {
            tradeId,
            accountId: account.accountId,
            ruleKey: w.ruleKey,
            symbol: next.symbol,
            message: w.message,
            detail: w.detail,
          } satisfies BrokerWarning)
        }
      }

      return {
        ok: true,
        data: {
          tradeId,
          status: next.status,
          partials: next.partials.length,
          awaitingReflection: next.status === 'closed' && phase2Complete === 0,
        },
      }
    } catch (err) {
      connection = 'error'
      return fail('DB_ERROR', String(err))
    }
  }

  function status(): BrokerStatus {
    return { connection, broker, lastEventMs, lastHeartbeatMs }
  }

  function listUnmapped(): UnmappedBrokerAccount[] {
    return [...seenUnmapped.values()].sort((a, b) => b.lastSeenMs - a.lastSeenMs)
  }

  function flushUnmapped(brokerKind: BrokerKind, brokerAccountId: string): number {
    const key = unmappedKey(brokerKind, brokerAccountId)
    const events = bufferedUnmapped.get(key) ?? []
    // Clear first: a successful re-apply must not re-buffer under the same key, and a
    // still-unmapped event re-buffers itself through apply() → recordUnmapped anyway.
    bufferedUnmapped.delete(key)
    seenUnmapped.delete(key)

    let applied = 0
    for (const event of events) {
      if (apply(event).ok) applied++
    }
    return applied
  }

  return { apply, status, listUnmapped, flushUnmapped }
}
