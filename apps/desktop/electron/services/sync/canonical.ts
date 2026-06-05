/**
 * Canonical JSON + sync-envelope (de)serialization (docs/sync-protocol.md §2.2).
 *
 * The plaintext that gets encrypted into `payload_ciphertext` must be byte-identical
 * for identical content, regardless of property insertion order: two devices that hold
 * the same record must produce the same bytes so a re-push is recognised as a duplicate
 * (equal clock) rather than a spurious conflict. We therefore serialize with
 * recursively-sorted object keys. Numbers are emitted verbatim — every money/pip field
 * is already integer-encoded upstream (CLAUDE.md §2.5/§19.5), so there is no float
 * ambiguity to canonicalize away.
 *
 * Pure and platform-free: no crypto, no I/O. Encryption of the result happens at push
 * time (serialize.ts / push.ts).
 */
import type { SyncEnvelope, SyncOpType, VectorClock } from '@cairn/sync-protocol'

/**
 * Deterministic JSON: object keys sorted ascending at every depth; arrays keep order;
 * scalars verbatim. Mirrors `JSON.stringify` for non-objects.
 *
 * @throws TypeError on a value JSON cannot represent losslessly here — `undefined`,
 *   a function, a `bigint`, or a non-finite number — surfaced loudly rather than
 *   silently dropping a field (an `undefined` column would otherwise vanish from the
 *   canonical form and desync the two sides).
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonicalJson: non-finite number ${String(value)}`)
    }
    return JSON.stringify(value)
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'bigint') {
    throw new TypeError('canonicalJson: bigint is not representable')
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const parts: string[] = []
    for (const k of keys) {
      const v = obj[k]
      if (v === undefined) continue // JSON.stringify drops undefined props; match that, explicitly
      parts.push(`${JSON.stringify(k)}:${canonicalJson(v)}`)
    }
    return `{${parts.join(',')}}`
  }

  // function / undefined / symbol at the top level
  throw new TypeError(`canonicalJson: unsupported value of type ${typeof value}`)
}

/** Current envelope schema version (shape of `data`). Bumped on a record-shape migration. */
export const ENVELOPE_SCHEMA_VERSION = 1

/**
 * Build the plaintext sync envelope for one op (docs/sync-protocol.md §2.2). `data` is
 * present for an upsert and omitted for a delete tombstone (which still carries clock +
 * updatedAt so deletes participate in conflict detection like any other op).
 */
export function buildEnvelope(params: {
  readonly opType: SyncOpType
  readonly clock: VectorClock
  readonly updatedAt: number
  readonly data: unknown
}): SyncEnvelope {
  if (params.opType === 'delete') {
    return {
      schemaVersion: ENVELOPE_SCHEMA_VERSION,
      clock: params.clock,
      updatedAt: params.updatedAt,
    }
  }
  return {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    clock: params.clock,
    updatedAt: params.updatedAt,
    data: params.data,
  }
}

/** Serialize an envelope to its canonical plaintext (the bytes that get encrypted). */
export function serializeEnvelope(env: SyncEnvelope): string {
  return canonicalJson(env)
}

/**
 * Parse + structurally validate a decrypted envelope. This checks only the *envelope*
 * frame (schemaVersion / clock / updatedAt / optional data); the per-table validation
 * of `data` happens afterwards in the pull path (docs/sync-protocol.md §7.4).
 *
 * @throws Error if the text is not JSON or is missing/!malformed envelope fields. The
 *   pull path turns this into a quarantine, never a silent skip.
 */
export function parseEnvelope(plaintext: string): SyncEnvelope {
  const raw: unknown = JSON.parse(plaintext)
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('sync envelope is not an object')
  }
  const o = raw as Record<string, unknown>

  if (typeof o.schemaVersion !== 'number' || !Number.isInteger(o.schemaVersion)) {
    throw new Error('sync envelope: schemaVersion missing or non-integer')
  }
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) {
    throw new Error('sync envelope: updatedAt missing or non-finite')
  }
  if (typeof o.clock !== 'object' || o.clock === null || Array.isArray(o.clock)) {
    throw new Error('sync envelope: clock missing or not an object')
  }
  const clock = o.clock as Record<string, unknown>
  for (const [dev, n] of Object.entries(clock)) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
      throw new Error(`sync envelope: clock component ${dev} is not a non-negative integer`)
    }
  }

  const env: SyncEnvelope = {
    schemaVersion: o.schemaVersion,
    clock: clock as VectorClock,
    updatedAt: o.updatedAt,
    ...(o.data === undefined ? {} : { data: o.data }),
  }
  return env
}
