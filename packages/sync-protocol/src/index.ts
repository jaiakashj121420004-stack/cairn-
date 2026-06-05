/**
 * Vector-clock algebra and op-log envelope types for Cairn's E2E-encrypted sync
 * engine (CLAUDE.md §3.3, §18; full spec in `docs/sync-protocol.md`).
 *
 * Pure functions only — no I/O, no crypto, no platform deps — so the same causality
 * rules run identically on desktop, web, and (for shape validation) the server. The
 * server never calls these: vector clocks live *inside* the ciphertext and the server
 * is incapable of reading them (CLAUDE.md §2.4).
 */

/** The kind of mutation an op represents. */
export type SyncOpType = 'upsert' | 'delete'

/**
 * A per-record vector clock: for every device that has written the record, the count
 * of writes that device has made to it. An absent component is treated as 0. Always
 * treated as immutable — the helpers below return new clocks, never mutate inputs.
 */
export type VectorClock = Readonly<Record<string, number>>

/**
 * Causal relationship between two clocks (see {@link compareClocks}). Read relative to
 * the first argument: `'dominates'` means `a` is strictly newer than `b`.
 */
export type ClockRelation = 'equal' | 'dominates' | 'dominated' | 'concurrent'

/**
 * The plaintext payload that sits *inside* `payload_ciphertext` (docs/sync-protocol.md
 * §2.2). Only holders of the data key ever see this shape; the server sees ciphertext.
 */
export interface SyncEnvelope {
  /** Shape version of `data`, for forward/backward record migrations. */
  readonly schemaVersion: number
  /** The record's vector clock *after* this op — the authority for conflict detection. */
  readonly clock: VectorClock
  /** Wall-clock ms at the edit. Advisory LWW tie-input for non-concurrent ops only. */
  readonly updatedAt: number
  /** The record's columns. Present for `upsert`; omitted for a `delete` tombstone. */
  readonly data?: unknown
}

/** Union of every device id mentioned by either clock. */
function deviceIds(a: VectorClock, b: VectorClock): string[] {
  const seen = new Set<string>()
  for (const k of Object.keys(a)) seen.add(k)
  for (const k of Object.keys(b)) seen.add(k)
  return [...seen]
}

/** Read one component, treating an absent device as 0. */
function at(clock: VectorClock, deviceId: string): number {
  return clock[deviceId] ?? 0
}

/**
 * Compare two vector clocks for causality (docs/sync-protocol.md §3.1). The result is
 * relative to `a`:
 * - `'equal'` — identical histories.
 * - `'dominates'` — `a` is causally after `b` (every component ≥, at least one >).
 * - `'dominated'` — `b` is causally after `a`.
 * - `'concurrent'` — neither dominates; a genuine conflict (§4).
 */
export function compareClocks(a: VectorClock, b: VectorClock): ClockRelation {
  let aGreater = false
  let bGreater = false
  for (const d of deviceIds(a, b)) {
    const av = at(a, d)
    const bv = at(b, d)
    if (av > bv) aGreater = true
    else if (bv > av) bGreater = true
  }
  if (aGreater && bGreater) return 'concurrent'
  if (aGreater) return 'dominates'
  if (bGreater) return 'dominated'
  return 'equal'
}

/** True iff `a` is strictly causally after `b` (`a` dominates `b`). */
export function dominates(a: VectorClock, b: VectorClock): boolean {
  return compareClocks(a, b) === 'dominates'
}

/**
 * True iff `a` and `b` are concurrent — neither dominates and they are not equal.
 * This is the sole definition of "conflict" (docs/sync-protocol.md §4).
 */
export function isConcurrent(a: VectorClock, b: VectorClock): boolean {
  return compareClocks(a, b) === 'concurrent'
}

/**
 * Pointwise-max merge of two clocks — the clock of a record that has absorbed both
 * histories (docs/sync-protocol.md §3). Used when applying a remote op and when
 * resolving a conflict. Returns a new frozen clock; inputs are untouched.
 */
export function mergeClocks(a: VectorClock, b: VectorClock): VectorClock {
  const out: Record<string, number> = {}
  for (const d of deviceIds(a, b)) {
    out[d] = Math.max(at(a, d), at(b, d))
  }
  return Object.freeze(out)
}

/**
 * Increment one device's component by 1 — a local write by `deviceId`
 * (docs/sync-protocol.md §3). Returns a new frozen clock; the input is untouched.
 */
export function bumpClock(clock: VectorClock, deviceId: string): VectorClock {
  return Object.freeze({ ...clock, [deviceId]: at(clock, deviceId) + 1 })
}
