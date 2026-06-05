/**
 * Sync engine public surface (CLAUDE.md §18.6, docs/sync-protocol.md).
 *
 * Stage 18.6 ships the full push + pull/merge cycle. The write path fills `sync_queue`
 * via {@link enqueueSyncOp} (the only enqueue entry point); the push leg drains it; the
 * pull leg reconciles remote ops, detecting conflicts and quarantining anything it can't
 * apply. On existing installs no write context is registered and no device is enrolled,
 * so the runner simply no-ops until a session exists.
 *
 * Wiring is performed by the main process once the desktop session module (device id +
 * data key + token refresh) exists: register a {@link SyncWriteContext} with
 * {@link setSyncWriteContext}, call {@link createSyncRunner} with a {@link SyncContext},
 * then {@link setActiveSyncRunner} so the `sync:now` IPC can drive it. Until then the IPC
 * handler reports `SYNC_NOT_READY`.
 */
import { decryptRecord, encryptRecord } from '../crypto'
import { runSyncCycle } from './cycle'
import { HttpVaultApi } from './http'
import { pullOnce } from './pull'
import { pushOnce } from './push'
import { SqliteSyncQueue } from './queue'
import { SyncRunner } from './runner'
import { decodeCiphertext, encodeCiphertext } from './serialize'
import type { VectorClockCache } from './clock'
import type { SyncLocalStore } from './store'
import type { DecryptOp, EncryptOp, Notify, SyncContext, SyncLogger } from './types'
import type { CairnDb } from '../../db/index'

export { VectorClockCache } from './clock'
export { SqliteSyncQueue } from './queue'
export { HttpVaultApi } from './http'
export { SyncRunner } from './runner'
export { pushOnce, PUSH_BATCH_SIZE } from './push'
export { pullOnce } from './pull'
export { runSyncCycle } from './cycle'
export { adFor, encodeCiphertext, decodeCiphertext } from './serialize'
export { canonicalJson, buildEnvelope, serializeEnvelope, parseEnvelope } from './canonical'
export { enqueueSyncOp, setSyncWriteContext, isSyncWriteEnabled } from './enqueue'
export { SqliteSyncStore, SYNCABLE_TABLES, isSyncableTable, validateSyncRow } from './store'
export { SYNC_ERROR_CODES } from './types'
export type { SyncWriteContext } from './enqueue'
export type {
  ConflictRecord,
  QuarantineReason,
  QuarantineRecord,
  AuditRecord,
  SyncLocalStore,
} from './store'
export type {
  DecryptOp,
  EncryptOp,
  Notify,
  PullOutcome,
  PushOutcome,
  QueueRow,
  SyncContext,
  SyncErrorCode,
  SyncLogger,
  SyncQueue,
  VaultApi,
  VaultHttpResult,
} from './types'

/**
 * Production {@link EncryptOp}: XChaCha20-Poly1305 under the data key, bound to the row
 * by its `table:id` associated data, serialized to the base64 wire form. Requires
 * `initCrypto()` to have completed.
 */
export function createEncryptOp(): EncryptOp {
  return (plaintext, dataKey, ad) => encodeCiphertext(encryptRecord(plaintext, dataKey, ad))
}

/**
 * Production {@link DecryptOp}: the inverse of {@link createEncryptOp}. Decodes the
 * base64 wire form, decrypts under the data key bound to the row's `table:id` AD, and
 * returns the UTF-8 plaintext. Throws (never returns garbage) on a tag mismatch.
 */
export function createDecryptOp(): DecryptOp {
  return (payloadCiphertext, dataKey, ad) =>
    new TextDecoder().decode(decryptRecord(decodeCiphertext(payloadCiphertext), dataKey, ad))
}

export interface CreateSyncRunnerOptions {
  readonly db: CairnDb
  /** Local store for the pull/merge apply path (built over the raw sqlite handle). */
  readonly store: SyncLocalStore
  /** Shared per-record vector-clock cache (also bumped by the write path). */
  readonly clock: VectorClockCache
  readonly ctx: SyncContext
  readonly baseUrl: string
  readonly notify: Notify
  readonly log: SyncLogger
  /** Wall clock (injected for testability). Defaults to `Date.now`. */
  readonly now?: () => number
  /** Override the default fetch (tests / Electron cookie-aware client). */
  readonly fetchImpl?: ConstructorParameters<typeof HttpVaultApi>[0]['fetchImpl']
}

/** Build a fully-wired push+pull runner from production dependencies. */
export function createSyncRunner(opts: CreateSyncRunnerOptions): SyncRunner {
  const queue = new SqliteSyncQueue(opts.db)
  const api =
    opts.fetchImpl === undefined
      ? new HttpVaultApi({ baseUrl: opts.baseUrl })
      : new HttpVaultApi({ baseUrl: opts.baseUrl, fetchImpl: opts.fetchImpl })
  const encrypt = createEncryptOp()
  const decrypt = createDecryptOp()
  const now = opts.now ?? Date.now

  const push = (): ReturnType<typeof pushOnce> =>
    pushOnce({ queue, api, ctx: opts.ctx, encrypt, log: opts.log })
  const pull = (): ReturnType<typeof pullOnce> =>
    pullOnce({
      api,
      ctx: opts.ctx,
      decrypt,
      store: opts.store,
      clock: opts.clock,
      log: opts.log,
      now,
    })

  return new SyncRunner({
    pushOnce: () => runSyncCycle(push, pull),
    notify: opts.notify,
    log: opts.log,
  })
}

// ── Active-runner registry (consumed by the `sync:now` IPC handler) ───────────
let activeRunner: SyncRunner | null = null

/** Register the live runner so the manual-sync IPC can drive it. */
export function setActiveSyncRunner(runner: SyncRunner | null): void {
  activeRunner = runner
}

/** The live runner, or null if sync has not been wired for this session. */
export function getActiveSyncRunner(): SyncRunner | null {
  return activeRunner
}
