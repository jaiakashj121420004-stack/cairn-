/**
 * Shared types and dependency seams for the sync push engine
 * (CLAUDE.md §18.6, docs/sync-protocol.md). Every external concern — the queue, the
 * HTTP call, the auth/session, encryption, the clock, logging, toasts — is an
 * injected interface so the engine is fully unit-testable without Electron, a network,
 * or a live key.
 */
import type {
  VaultPullInput,
  VaultPullOutput,
  VaultPushInput,
  VaultPushOutput,
} from '@cairn/shared-zod'

/** Client-side sync error codes (docs/sync-protocol.md §9.2). UI maps these to copy. */
export const SYNC_ERROR_CODES = {
  /** No enrolled device / no data key / logged out — sync can't run yet. */
  NOT_READY: 'SYNC_NOT_READY',
  /** 401 persisted after one cookie refresh — user must log in again. */
  AUTH_EXPIRED: 'SYNC_AUTH_EXPIRED',
  /** Server returned 429 — backing off (honors Retry-After). */
  RATE_LIMITED: 'SYNC_RATE_LIMITED',
  /** Non-401 4xx (400/403/413) — auto-sync paused until a manual run. */
  CLIENT_ERROR: 'SYNC_CLIENT_ERROR',
  /** 402 — cloud sync requires a Cairn Pro entitlement (docs/billing.md §5). Paused; the
   *  renderer surfaces the upgrade prompt and routes to Settings → Billing. */
  UPGRADE_REQUIRED: 'SYNC_UPGRADE_REQUIRED',
  /** 5xx — backing off with jitter, will auto-retry. */
  SERVER_ERROR: 'SYNC_SERVER_ERROR',
  /** Fetch threw (offline / DNS / TLS) — backing off, will auto-retry. */
  NETWORK_ERROR: 'SYNC_NETWORK_ERROR',
  /** Our own pulled op failed to decrypt (wrong/stale data key) — sync paused, user must re-auth (§8). */
  WRONG_KEY: 'SYNC_WRONG_KEY',
} as const

export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[keyof typeof SYNC_ERROR_CODES]

/** One pending op as read from the local `sync_queue` table. */
export interface QueueRow {
  readonly id: number
  readonly tableName: string
  readonly recordId: string
  readonly opType: 'upsert' | 'delete'
  /** Plaintext sync envelope to encrypt; '' for a bare delete. */
  readonly payload: string
  readonly createdAt: number
}

/** Read/delete access to the local outbound queue. */
export interface SyncQueue {
  /** Oldest-first batch of up to `limit` rows (order: created_at, id). */
  take(limit: number): readonly QueueRow[]
  /** Delete the given queue rows by id (after the server acks them). */
  remove(ids: readonly number[]): void
  /** Count of rows still pending — used only for diagnostics/logging. */
  size(): number
}

/**
 * Auth/session seam. Supplies the per-device identity and the unwrapped data key, and
 * owns access-token refresh. Implemented by the (future) desktop session module; the
 * push engine never reaches into the keychain or HTTP cookies directly.
 */
export interface SyncContext {
  /** This device's enrolled id (UUID), or null if not enrolled / logged out. */
  getDeviceId(): string | null
  /** The 32-byte unwrapped vault data key, or null if the vault is locked. */
  getDataKey(): Uint8Array | null
  /** Current access token, or null if logged out. */
  getAccessToken(): string | null
  /** Refresh the access token via the refresh cookie. Resolves to the new token, or null on failure. */
  refresh(): Promise<string | null>
}

/** Outcome of an HTTP call to the vault API. `error` is set only when the fetch threw. */
export interface VaultHttpResult {
  readonly status: number
  readonly body: unknown
  /** Present only when the request never completed (offline, DNS, TLS). */
  readonly networkError?: string
  /** Parsed `Retry-After` in ms, when the server sent one (429/503). */
  readonly retryAfterMs?: number
}

/** Minimal vault API surface the sync engine depends on. */
export interface VaultApi {
  push(input: VaultPushInput, accessToken: string): Promise<VaultHttpResult>
  pull(input: VaultPullInput, accessToken: string): Promise<VaultHttpResult>
}

/** Encrypts plaintext under the data key, bound to its row via associated data. */
export type EncryptOp = (plaintext: Uint8Array, dataKey: Uint8Array, ad: Uint8Array) => string

/**
 * Decrypts a base64 wire ciphertext under the data key, bound to its row via associated
 * data. Returns the UTF-8 plaintext.
 * @throws on a tag mismatch (wrong key, wrong AD, or tampering) — never returns garbage.
 */
export type DecryptOp = (payloadCiphertext: string, dataKey: Uint8Array, ad: Uint8Array) => string

/** A user-facing toast. `level` lets the runner distinguish a pause from a transient retry. */
export type Notify = (toast: {
  readonly level: 'error' | 'warning' | 'info'
  readonly code: SyncErrorCode
  readonly message: string
}) => void

/** Structured logger seam (electron-log in production, a spy in tests). */
export interface SyncLogger {
  debug(msg: string, meta?: unknown): void
  info(msg: string, meta?: unknown): void
  warn(msg: string, meta?: unknown): void
  error(msg: string, meta?: unknown): void
}

/**
 * The result of one push run. The runner maps this to a scheduling decision and a
 * toast (docs/sync-protocol.md §10). Kept exhaustive so the runner's switch is total.
 */
export type PushOutcome =
  /** Nothing was queued. */
  | { readonly kind: 'idle' }
  /** Ops acknowledged and removed from the queue. */
  | { readonly kind: 'pushed'; readonly opCount: number }
  /** 401 after one cookie refresh — user must log in again. */
  | { readonly kind: 'auth-expired' }
  /** 429 — back off (honor Retry-After when present). */
  | { readonly kind: 'rate-limited'; readonly retryAfterMs: number | null }
  /** Non-401 4xx — pause auto-sync until a manual run. */
  | { readonly kind: 'client-error'; readonly status: number; readonly code: SyncErrorCode }
  /** 402 — cloud sync needs Cairn Pro; pause and prompt the user to upgrade. */
  | { readonly kind: 'upgrade-required' }
  /** 5xx — exponential backoff with jitter. */
  | { readonly kind: 'server-error'; readonly status: number }
  /** Fetch threw — exponential backoff with jitter. */
  | { readonly kind: 'network-error'; readonly message: string }
  /** Sync isn't usable yet (no device, key, or token). */
  | { readonly kind: 'not-ready'; readonly reason: string }
  /** A pull op failed to decrypt under the data key — pause until the user re-auths (§8). */
  | { readonly kind: 'wrong-key'; readonly message: string }

/**
 * The result of one pull run (docs/sync-protocol.md §7). Mapped, alongside the push
 * outcome, into a single {@link PushOutcome} the runner schedules on.
 */
export type PullOutcome =
  /** No new ops on the server. */
  | { readonly kind: 'idle' }
  /** Applied/merged ops from the server. */
  | {
      readonly kind: 'pulled'
      readonly applied: number
      readonly conflicts: number
      readonly quarantined: number
    }
  | { readonly kind: 'auth-expired' }
  | { readonly kind: 'rate-limited'; readonly retryAfterMs: number | null }
  | { readonly kind: 'client-error'; readonly status: number }
  /** 402 — cloud sync needs Cairn Pro; pause and prompt the user to upgrade. */
  | { readonly kind: 'upgrade-required' }
  | { readonly kind: 'server-error'; readonly status: number }
  | { readonly kind: 'network-error'; readonly message: string }
  | { readonly kind: 'not-ready'; readonly reason: string }
  /** Every op on a page failed to decrypt — the wrong-key signature (§8). */
  | { readonly kind: 'wrong-key'; readonly message: string }

/** Re-export for convenience at call sites. */
export type { VaultPullInput, VaultPullOutput, VaultPushInput, VaultPushOutput }
