# Sync Protocol — Cairn v2.0

**Status:** Stage 18.6 (push + pull/merge implemented: encryption-on-write enqueue, pull with decrypt/validate/apply, vector-clock conflict detection, quarantine of un-appliable ops).
**Source of truth** for the vector-clock + op-log design referenced by CLAUDE.md §3.3, §18.
**Companion docs:** [`security.md`](security.md) (crypto primitives, AD binding), [`backend-architecture.md`](backend-architecture.md) (server endpoints), [`data-model.md`](data-model.md) (sync columns).

The privacy contract is non-negotiable (CLAUDE.md §2.4): the server stores **only ciphertext** and routing metadata it cannot decrypt. Every design choice below preserves that. Where this document and CLAUDE.md disagree, CLAUDE.md wins.

---

## 1. Model in one paragraph

Each syncable record is replicated as an **append-only log of encrypted ops**. An op is an `upsert` or `delete` for one `(table, record_id)`, carrying an encrypted payload. The server assigns each op a monotonic `id` (its global cursor) and never inspects the payload. Convergence is decided **on the client** after decryption, using a **per-record vector clock** embedded *inside* the ciphertext. Last-write-wins (by wall clock) resolves non-concurrent edits; genuinely concurrent edits (neither clock dominates) are retained as a `conflict` for the UI to resolve. Because the vector clock lives inside the encrypted envelope, the server is incapable of participating in conflict resolution — by design.

---

## 2. Op-log shape

### 2.1 Wire envelope (cleartext — what the server sees)

The server only ever sees these fields (`packages/shared-zod/src/vault.ts`):

```jsonc
{
  "table_name": "trade",          // logical table, ≤ 64 chars
  "record_id":  "0192f0a1-…",     // stable per-record id (UUIDv7), ≤ 128 chars
  "op_type":    "upsert",          // "upsert" | "delete"
  "payload_ciphertext": "base64…"  // opaque AEAD blob; "" only for a bare delete
}
```

`table_name` and `record_id` are cleartext **routing metadata** — the server needs them to group ops per record for pull cursors. They leak only the *shape* of the vault (how many records, in which logical tables), never its contents. This is an accepted, documented trade-off (`docs/threat-model.md`, row "metadata observer").

On a successful push the server assigns and returns each op's `id` (a Postgres `serial`); on pull it additionally returns `device_id` and `created_at`. The `id` is the **only** cursor used for pagination.

### 2.2 Encrypted envelope (plaintext-before-encryption — what only the client sees)

`payload_ciphertext` decrypts to a UTF-8 JSON **sync envelope**:

```jsonc
{
  "schemaVersion": 1,                 // shape version of `data`, for migrations
  "clock": { "<deviceId>": 7 },       // the record's vector clock AFTER this op
  "updatedAt": 1778112000123,         // wall-clock ms at the moment of the edit
  "data": { /* the record's columns */ } // omitted for a delete tombstone
}
```

- `clock` is the authoritative vector clock for conflict detection (§4). It is **inside** the ciphertext, so only holders of the data key can read it.
- `updatedAt` is the LWW tie-input for *non-concurrent* ops only (§5). It is advisory, not a clock — never used to order concurrent edits.
- `data` is present for `upsert`, omitted for `delete`. A delete **still carries `clock` + `updatedAt`** (an encrypted tombstone) so deletes participate in conflict detection like any other op. A bare delete with `payload_ciphertext === ""` is permitted by the server schema but loses tombstone causality — used only for hard-erase / GDPR paths, never for normal sync.

### 2.3 Local queue row (`sync_queue`, desktop SQLite)

The write path enqueues one row per local mutation; the push service drains it. The
single entry point is `enqueueSyncOp(table, record_id, op_type, plaintext_row)`
(`electron/services/sync/enqueue.ts`) — every IPC handler that mutates a syncable row
calls it **after** its DB commit, and nothing else may touch `sync_queue`. The helper
bumps this device's clock component, wraps the row in a canonical-JSON envelope (§2.2),
and inserts one row. It is a no-op until a device is enrolled and the vault unlocked, so
the offline-first app and existing installs keep `sync_queue` empty until sync is turned
on. The columns:

| column        | type    | meaning                                                            |
|---------------|---------|-------------------------------------------------------------------|
| `id`          | integer | autoincrement; queue order is by `created_at` then `id`           |
| `table_name`  | text    | target logical table                                              |
| `record_id`   | text    | target record                                                     |
| `op_type`     | text    | `upsert` \| `delete`                                              |
| `payload`     | text    | the **plaintext** sync envelope (§2.2) to encrypt at push; `""` for a bare delete |
| `created_at`  | integer | epoch ms when enqueued                                            |

The queue stores **plaintext** envelopes (the device is the only place plaintext ever exists). Encryption happens at push time, not write time, so a key rotation only has to re-encrypt the queue, not the journal. A row leaves the queue **only** after the server acknowledges its op.

---

## 3. Per-record vector clocks

A vector clock is `Record<deviceId, version>` — for each device that has ever written the record, the count of writes that device has made to it. Type and algebra live in `@cairn/sync-protocol` (`packages/sync-protocol/src/index.ts`).

- **Local write:** bump *this* device's component by 1 (`bumpClock`). Other components are carried forward unchanged from the record's current clock.
- **Apply a remote op (merge):** the surviving record's clock becomes the **pointwise max** of the local and remote clocks (`mergeClocks`).
- **In-memory cache (`clock.ts`):** keyed by `(table, record_id)`, holds each record's current clock. Hydrated on app start from the local `version` columns (this device's component) so the write path can bump without a DB round-trip. The cache is advisory acceleration; the persisted record columns + op log remain the source of truth.

### 3.1 Comparison

For clocks `a`, `b` (treating an absent component as 0):

- `a` **dominates** `b` iff `a[d] ≥ b[d]` for all `d` **and** `a[d] > b[d]` for at least one `d`. (`b` is then causally before `a`.)
- `equal` iff every component is equal.
- `concurrent` iff neither dominates and they are not equal — each has at least one component strictly greater than the other.

`compareClocks(a, b)` returns `'equal' | 'dominates' | 'dominated' | 'concurrent'`.

### 3.2 Device-id stability

`device_id` is a UUID minted **once** at enrollment and stored locally (server `devices` table mirrors it). It is the identity of a clock component, so it must be stable for the life of the install:

- Generated on first enrollment, persisted in local config (not regenerated on app restart, reinstall-over-existing-data, or backup-restore).
- A backup restored onto a *new* machine keeps the original `device_id` — it is the same logical device's history. A genuinely new device enrolls and gets a new id.
- Revoking a device server-side does not delete its clock components from existing records; history is immutable. New ops from a revoked device are rejected (`FORBIDDEN`).
- A wiped/forgotten device that re-enrolls gets a **new** id; its old component is frozen at its last value, which is correct (those writes really happened).

Never reuse one `device_id` across two physical devices — it collapses two histories into one component and breaks concurrency detection.

---

## 4. Conflict detection

When pulling, the client decrypts each remote op and compares the remote clock to the local record's clock:

| `compareClocks(remote, local)` | meaning                              | action                          |
|--------------------------------|--------------------------------------|---------------------------------|
| `equal`                        | already have it (idempotent replay)  | ignore                          |
| `dominates`                    | remote is strictly newer             | apply remote (fast-forward)     |
| `dominated`                    | local is strictly newer              | ignore remote (we're ahead)     |
| `concurrent`                   | true conflict                        | **retain both** as a `conflict` |

**The conflict rule, stated plainly:** two ops conflict **iff neither op's vector clock dominates the other** (and they are not equal). This is the only definition; wall-clock proximity, op order on the server, and `device_id` ordering are **never** used to *detect* a conflict.

---

## 5. Conflict resolution policy

1. **Non-concurrent (`dominates` / `dominated`):** the dominating op wins — this is plain causal fast-forward, not a "resolution". No user involvement.
2. **Concurrent:** **both versions are retained** and the record is marked `conflict`. The app surfaces it on the Review screen for the user to resolve (pick one, or merge fields). Until resolved:
   - The record stays usable; the client shows the **LWW provisional view** — the side with the greater `updatedAt` wall clock (ties broken deterministically by the lexicographically greater `device_id`, purely to avoid a flicker, never to discard the other side).
   - Provisional LWW **never deletes the losing side.** The losing version is preserved verbatim until the user resolves, so an accurate clock or a clock-skewed device can't silently destroy data.
3. **Resolution** produces a new op whose clock is `mergeClocks(a, b)` then `bumpClock(thisDevice)` — it causally dominates both conflicting versions, so it converges everywhere on next sync.

> Why LWW-by-wall-clock only for *non-concurrent*? Wall clocks are unreliable across devices; using them to *order* concurrent edits would silently drop a real edit. Vector clocks decide causality; wall clock is only a cosmetic provisional choice that is always reversible.

---

## 6. Push protocol

### 6.1 Request — `POST /vault/push`

Auth: `Authorization: Bearer <access token>` (≤ 15 min), verified email required. Body (≤ 5 MB):

```jsonc
{
  "device_id": "<this device uuid>",
  "ops": [ { "table_name": "...", "record_id": "...", "op_type": "...", "payload_ciphertext": "..." } ]
}
```

- Batch size: up to **200** ops per request (server hard cap is 500). Larger queues are drained in successive batches within one run.
- Each op is encrypted **individually** with the data key, using `"<table_name>:<record_id>"` (UTF-8) as AEAD **associated data**. This binds a ciphertext to its row: a blob moved to another row fails the Poly1305 tag on decrypt (`security.md` §4.4). `payload_ciphertext` is base64 of `nonce(24) ‖ ciphertext‖tag`.

### 6.2 Response

`200`: `{ "op_ids": [<int>, …] }` — server-assigned ids, **same order** as the input `ops`. On ack the client deletes exactly those `sync_queue` rows.

Errors (Cairn `Result` error envelope, mapped from the codes in §9):

| status | code (server)        | client handling                                              |
|--------|----------------------|-------------------------------------------------------------|
| 400    | `VALIDATION_FAILED`  | client bug — toast, stop until manual run (will recur)      |
| 401    | `UNAUTHENTICATED`    | refresh once via cookie, retry once; still 401 → re-login   |
| 403    | `FORBIDDEN`          | device revoked / email unverified — toast, stop until manual|
| 413    | `PAYLOAD_TOO_LARGE`  | batch too big — toast, stop until manual (shouldn't happen) |
| 429    | `RATE_LIMITED`       | back off, honoring `Retry-After`; auto-retry later          |
| 5xx    | `INTERNAL`           | exponential backoff + jitter, capped at 5 min               |

### 6.3 Idempotency & ordering

The op log is append-only and ops are immutable, so a retried batch after an ambiguous failure (e.g. the ack was lost) can create duplicate ops for the same `(table, record_id, clock)`. That is **safe**: on pull, a duplicate has an `equal` clock to one already applied and is ignored (§4). Convergence does not depend on exactly-once delivery — only on eventually-at-least-once.

---

### 5.1 Where conflicts and un-appliable ops are stored (desktop SQLite)

Migration `0012_sync_merge` adds the pull/merge bookkeeping tables:

| table             | holds                                                                            |
|-------------------|----------------------------------------------------------------------------------|
| `sync_conflicts`  | concurrent edits retained for the UI — both clocks + both payloads, never lost   |
| `sync_quarantine` | ops that couldn't be applied (decrypt/schema failure) + their raw ciphertext     |
| `sync_audit`      | append-only log of non-trivial decisions (`sync.conflict`, `sync.quarantine`)    |
| `sync_state`      | key/value bookkeeping; currently the persisted pull cursor (`pull_last_op_id`)   |

A quarantine or conflict is **never silent**: each writes both its row and an audit-log
line in the same transaction as the rest of the page.

## 7. Pull protocol

### 7.1 Manifest — `GET /vault/manifest`

`{ key_version, schema_version, latest_op_id_per_table }`. The client compares `key_version` to the version its data key was wrapped under to detect a **key rotation** (forces re-derive before pulling). `latest_op_id_per_table` lets the client show "N ops behind" without a full pull.

### 7.2 Request — `POST /vault/pull`

```jsonc
{
  "since_op_id_per_table": { "trade": 0, "account": 0 }, // initial cursor per table
  "since_id": 41021                                       // page 2+; overrides the map
}
```

- First sync: send `since_op_id_per_table` (omit tables never synced; the server returns those from id 0).
- Subsequent pages: send only `since_id = next_cursor` from the previous response.

### 7.3 Response

`{ ops: PulledOp[], next_cursor: number | null }`, ≤ 500 ops/page, ascending by `id`. `next_cursor` is non-null while more pages remain; keep pulling until null. Each `PulledOp` adds `id`, `device_id`, `created_at` to the wire envelope.

### 7.4 Apply loop

The pull engine (`electron/services/sync/pull.ts`) processes one page in two phases.

**Phase A (no writes)** — for each op, in `id` order: decrypt with `"<table>:<record_id>"`
AD → parse the envelope frame → validate `data` against the table's Zod schema → read the
envelope clock → `compareClocks` against the local record's clock. This resolves each op
to one action: *ignore* (equal/dominated), *apply* (dominates), *conflict* (concurrent),
or *quarantine* (couldn't decrypt or failed validation).

**Phase B (one transaction per page)** — apply every resolved action atomically: upserts
and tombstones write the row; conflicts write a `sync_conflicts` row (both sides retained)
+ an audit line; quarantines write a `sync_quarantine` row (raw ciphertext preserved) + an
audit line; finally the cursor advances to the page's last `id`. The in-memory vector-clock
cache is reconciled **only after** the transaction commits, so a rolled-back page never
leaves the cache ahead of the DB. Cursor advances are **persisted per page** so an
interrupted pull resumes without re-applying.

A **schema-validation failure is quarantined, never silently discarded** — the op is set
aside with its raw ciphertext so it can be inspected or re-applied after a fix, and the
rest of the page still applies.

---

## 8. The "wrong key, fail loudly" rule

A decrypt failure during pull is **never** swallowed, retried as if transient, or worked around. It means one of: wrong data key (wrong password / stale key after rotation), a row-substitution attack (AD mismatch), or ciphertext corruption. These split into two responses, distinguished by **who wrote the op**:

- **Our own op won't decrypt → wrong key.** A ciphertext this device wrote *must* decrypt under this device's own key. If it doesn't, the key itself is wrong (wrong password / stale after rotation). The pull **halts immediately** — no further ops are applied (a partially-applied pull under a wrong key would corrupt local state) — and surfaces `SYNC_WRONG_KEY` with an explicit, actionable message ("Cairn can't decrypt your synced data on this device. Re-enter your password or recovery phrase."). Sync is **paused**, not retried, until the user re-authenticates. Nothing is quarantined — the data isn't corrupt, our key is simply wrong.
- **A foreign op won't decrypt → quarantine that op.** Other devices' ops decrypt fine under a *correct* key; if exactly one fails while others succeed, that op is a single misrouted/tampered row (its AD `table:id` didn't bind — a row-substitution attempt, `security.md` §4.4) or corrupt ciphertext. It is **quarantined** (`DECRYPT_FAILED`) with its raw bytes preserved + an audit line, and the rest of the page applies. It is never silently dropped, and it never halts the whole pull on one bad op from elsewhere.
- The crypto layer fails closed (`security.md` §4.3–4.4): a tag mismatch throws `DECRYPT_FAILED` and **never** returns partial or garbage plaintext. The sync layer propagates that loudly (halt) or isolates it (quarantine); it never masks it.
- A **whole-vault** key mismatch (e.g. after a server-side rotation) is caught *before* pulling by the `key_version` manifest check (§7.1): the client re-derives the key rather than trying to decrypt under a stale one. So the in-pull decrypt-failure paths above are the targeted-tamper and own-key-wrong cases, not the routine rotation case.

---

## 9. Error codes

### 9.1 Server / cross-boundary (`packages/shared-types/src/error-codes.ts`)

`VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `EMAIL_NOT_VERIFIED`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `INTERNAL` — returned by the vault endpoints, mapped to HTTP status by `apps/server/src/lib/errors.ts`.

### 9.2 Client sync codes (`apps/desktop/electron/services/sync/types.ts`)

| code               | when                                                                  |
|--------------------|----------------------------------------------------------------------|
| `SYNC_NOT_READY`   | no enrolled device / no data key / logged out — sync can't run yet    |
| `SYNC_AUTH_EXPIRED`| 401 persisted after one cookie refresh — user must log in again       |
| `SYNC_RATE_LIMITED`| server returned 429 — backing off (honors `Retry-After`)             |
| `SYNC_CLIENT_ERROR`| non-401 4xx (400/403/413) — auto-sync paused until a manual run       |
| `SYNC_SERVER_ERROR`| 5xx — backing off with jitter, will auto-retry                        |
| `SYNC_NETWORK_ERROR`| fetch threw (offline / DNS / TLS) — backing off, will auto-retry     |
| `SYNC_WRONG_KEY`   | a pull op failed to decrypt — sync paused, user must re-auth (§8)     |

Client codes are local to the sync module; the UI maps them to copy. Raw lower-layer strings are never shown (CLAUDE.md §3.7).

---

## 10. Scheduling & failure handling (sync runner)

`runner.ts` is a single-flight (leaky-bucket) scheduler. Each run is one **cycle** =
**push then pull** (`cycle.ts`): local edits leave first, then remote ops are reconciled.
If the push leg hits a transport/auth condition the pull is skipped that tick (the same
transport just failed); on a clean push the pull always runs and its outcome drives
scheduling.

- **Cadence:** a cycle every 60 s; also on window focus (both legs); also on manual `window.api.sync.now()` (IPC `sync:now`; the spec shorthand is `cairn.sync.now()`).
- **Single-flight:** at most one cycle in flight. A trigger while a run is active coalesces onto the running promise rather than starting a second.
- **Backoff:** `SYNC_SERVER_ERROR` / `SYNC_NETWORK_ERROR` → exponential backoff with full jitter, base 2 s, **capped at 5 min**, reset on the next success. `SYNC_RATE_LIMITED` → wait `Retry-After` (or the backoff delay if the header is absent).
- **Hard stop until manual:** `SYNC_CLIENT_ERROR` and `SYNC_AUTH_EXPIRED` and `SYNC_WRONG_KEY` pause the automatic cadence (a 400 will just recur; a 401/decrypt failure needs the user). The next manual `now()` clears the pause and tries again.
- A run that finds the queue empty is a no-op (`idle`) and costs one indexed `SELECT … LIMIT 1`.

---

*Append-only log, immutable ops, causality in the ciphertext. The server moves bytes it can't read; the client alone decides truth.*
