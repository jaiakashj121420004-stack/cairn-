# Wave 4 Closeout — Host Runbook

**Run everything below on the Windows host** (the only place the real `node_modules`,
native modules, Electron build, and live MT5/cTrader terminals exist). I prepared the
code changes and these exact steps from a Linux sandbox, which cannot run the host gates
or place demo trades.

---

## 0. What I already changed in your working tree

Two edits are staged in your files (verify with `git diff`):

1. **`apps/desktop/tests/integration/mt5-import.test.ts`** — added
   `describe('import:commitMt5 — sync enqueue (spec §7)')` with two tests:
   - asserts the bulk import path enqueues one `upsert` per imported trade (×4) and
     partial (×1), closing the documented test gap (the enqueue *code* was already in
     `commitCandidates`; only the assertion was missing).
   - asserts it is a no-op when sync isn't enrolled (offline-first).
   It reuses the exact `fakeDb` sync-context pattern from `tests/unit/sync/enqueue.test.ts`,
   so it does **not** depend on the unverified drizzle-sql.js transaction path.
   **⚠️ I could not run it here — verify it passes in step 1 (`pnpm test:unit`).**

2. **`apps/desktop/electron/services/broker/index.ts`** — fixed the stale file-header
   comment that still called `resolveAccount` "a stub pending the account-map UI." The
   UI and binding lookup now exist, so the comment was slop. Body docstring was already
   correct.

Nothing else in the tree was touched by me; the rest is your uncommitted Wave 4 work.

---

## 1. Pre-commit gates (all five must be green, no weakening)

From repo root:

```bash
pnpm typecheck
pnpm lint --max-warnings 0
pnpm test:unit
pnpm build
pnpm test:e2e        # smoke
```

Rules: no `any`, no `// @ts-ignore` without a linked issue, no `eslint-disable` without
an inline reason, no skipped tests, **do not** raise `--max-warnings`. Fix what they
surface. If my added test (`mt5-import.test.ts › sync enqueue`) is red, that is a real
signal to fix before proceeding — do not delete it.

---

## 2. Read-only assertions (verify green — already in tree)

```bash
pnpm test:unit -- mt5-ea-readonly ctrader-readonly ctrader-codec
```

Confirmed by reading the code:
- `ctrader-readonly.test.ts` now has a **`cTrader codec — read-only send path`** block:
  `codec.encode()` throws `/read-only send allowlist/` for every order-execution payload
  type and only permits the auth/read/heartbeat allowlist (Prompt 8 coverage). ✓
- `mt5-ea-readonly.test.ts` present; adapter exposes no
  `placeOrder/modifyOrder/closeOrder/sendOrder/cancelOrder`. ✓
- `codec.ts` SEND allowlist contains **no** order-execution `ProtoOA*Req` type. ✓

No adapter or EA contains an order-execution path.

---

## 3. Sync-gap (verify green — already closed)

`enqueueSyncOp` is called in all three write paths:
- live fills — `electron/services/broker/ingest.ts`
- bulk import — `_shared/committer.ts › commitCandidates` (lines ~279–280)
- settle/reconcile — `_shared/committer.ts › reconcileSettledTrade` (line ~375)

The committer enqueue code shipped in `cfb8114`; the **only** open item was the missing
test, added in step 0. The server still only ever sees ciphertext (enqueue stores the
plaintext envelope; encryption happens at push time, covered by `sync/enqueue.test.ts`).

---

## 4. Commit plan (Conventional Commits, dependency order)

Run gates (or at least `pnpm typecheck && pnpm test:unit`) between commits so each one is
green on its own. **Do not commit `.claude/scheduled_tasks.lock`** — add it to
`.gitignore` or skip it.

**Commit 1 — `feat(ctrader): protobuf codec with read-only send allowlist`**
```
apps/desktop/electron/services/broker/ctrader/codec.ts
apps/desktop/electron/services/broker/ctrader/connection.ts
apps/desktop/resources/ctrader-proto/
apps/desktop/electron-builder.yml
apps/desktop/package.json
pnpm-lock.yaml
scripts/gen-ctrader-fixtures.cjs
apps/desktop/tests/fixtures/broker/
apps/desktop/tests/unit/broker/ctrader-codec.test.ts
```

**Commit 2 — `test(broker): cover cTrader read-only send path`**
```
apps/desktop/tests/unit/broker/ctrader-readonly.test.ts
```
(Fold into commit 1 if you prefer the send-path test to ship with the codec.)

**Commit 3 — `feat(broker): per-device account map + Settings → Integrations mapping UI`**
```
apps/desktop/electron/db/migrations/0015_broker_account_map.sql
apps/desktop/electron/db/migrations/meta/_journal.json
apps/desktop/electron/db/schema.ts
apps/desktop/electron/services/broker/account-map.ts
apps/desktop/electron/services/broker/index.ts
apps/desktop/electron/ipc/broker-account-map.ts
apps/desktop/electron/ipc/index.ts
apps/desktop/electron/preload.ts
apps/desktop/src/lib/ipc.ts
apps/desktop/src/lib/transport-electron.ts
apps/desktop/shared/types/procedures.ts
packages/shared-types/src/broker.ts
apps/desktop/src/features/settings/tabs/IntegrationsTab.tsx
apps/desktop/tests/integration/migrations.test.ts
```

**Commit 4 — `feat(broker): stream live fills to the sync queue`**
```
apps/desktop/electron/services/broker/ingest.ts
apps/desktop/electron/services/sync/store.ts
```

**Commit 5 — `test(broker): assert bulk statement import enqueues sync ops`**
```
apps/desktop/tests/integration/mt5-import.test.ts
```

**Commit 6 — `docs: Wave 4 DONE — commit hashes + end-state`** (after 1–5, hashes known)
```
docs/build-status.md
docs/roadmap-v1.2.md
CLAUDE.md
prompts.md
cairn-prompts-checklist.html
```

> If a split makes a gate red because two files are interdependent, fold them into one
> commit rather than weakening the gate. The "each commit passes on its own" bar wins
> over the grouping.

---

## 5. Manual two-broker end-to-end QA (`docs/broker-integration.md` §10)

I cannot drive your MT5/cTrader terminals or place trades — do this manually:

1. **Settings → Integrations:** map both accounts (MT5 + cTrader) to Cairn accounts.
2. **Connect:** MT5 EA → loopback shows live status; cTrader OAuth (read-only) connects,
   tokens in OS keychain, stream live.
3. **Demo trade in MT5** and **one in cTrader.** Confirm each auto-logs per active mode:
   - **draft-awaiting-context:** mechanical fields prefilled, lands in the reflection
     queue, sidebar badge appears, honesty fields `unreviewed`.
   - **fully-auto:** complete record, never queued, honesty fields `unreviewed` — and
     **never counted as `clean`** in composite score / A–F grade / clean-rate.
4. **Widen a stop on each** → fires a non-blocking mentor-voice warning + writes a
   `rule_violations` row.
5. **Import each broker's day statement.** Confirm:
   - **zero duplicate rows** (dedupe via `external_ref`),
   - the **settled statement wins the monetary columns** (`pnl_cents`, `pnl_pct_bps`,
     `pnl_r`),
   - the **live stream keeps timing + SL/TP modification history + partials**.

**If any QA step double-counts a trade, or fully-auto rows count as clean, Wave 4 is NOT
done — fix before tagging.**

---

## 6. Docs edits (apply in commit 6, after hashes are known)

### `docs/build-status.md`
Replace the heading and intro of the Wave 4 section (currently ~line 173):

- **Old:**
  `## Wave 4 - Live broker integration (built on branch \`feat/vault-enrollment-server\`, uncommitted)`
- **New:**
  `## Wave 4 - Live broker integration — DONE`

- **Old intro paragraph** ("…present in the working tree but **not yet committed** - so
  this section cites no commit hashes; fill them in at commit time…")
- **New:** state it is committed, with hashes:
  `Committed <DATE>: codec <HASH1>, account-map <HASH3>, live-stream sync <HASH4>, import-enqueue test <HASH5>. Binding spec: \`docs/broker-integration.md\`. End-state: \`docs/roadmap-v1.2.md\` §6.1 (#37–#40).`

Replace the **"Remaining production seams before live end-to-end"** block (account mapping
+ cTrader codec "returns null") with:

```
**Production seams closed this cycle:**
- **Account mapping** — `broker_account_map` (migration 0015) + Settings → Integrations
  UI; `resolveAccount()` binds `(broker, brokerAccountId)` → Cairn account, surfacing
  UNKNOWN_ACCOUNT only when unmapped (never guesses, CLAUDE.md §14 #39).
- **cTrader protobuf codec** — `ctrader/codec.ts` compiles the vendored Open API `.proto`
  schema (protobufjs 7.4.0) with a read-only SEND allowlist; `loadProtobufCodec()`
  returns it. No order-execution payload type is encodable (`ctrader-readonly.test.ts`).

**Wave 4 — DONE.** All §10 end-state criteria met; manual two-broker QA passed <DATE>.
```

### `docs/roadmap-v1.2.md` §6.1
Replace the **Status (2026-06-06, …, uncommitted)** line and the **#30/#31 two-seams-open**
bullet with a DONE status citing the commit hashes, and tick #37–#40 as complete (the
read-only boundary, MT5/cTrader transports, configurable auto-log default, and live-detection
warnings are all in place and tested).

### `CLAUDE.md`
- **§17.5 Wave 4 row:** change "**Wave 4 is in progress (built, uncommitted on
  `feat/vault-enrollment-server`)**" → "**Wave 4 is DONE (committed <HASH range>).**" and
  remove the "two production seams remain (account-map UI, cTrader codec)" clause.
- **§17.6 headline:** update the current-status paragraph to note Wave 4 committed + tagged
  `v1.x-wave4-live-broker`, both seams closed, manual two-broker QA passed.

---

## 7. Tag (only after gates green + QA passed + docs committed)

```bash
git tag -a v1.x-wave4-live-broker -m "Wave 4: live MT5 + cTrader broker integration (read-only)"
git push origin v1.x-wave4-live-broker   # if you push tags
```

**No-slop footer:** if any gate is red or any QA step double-counts a trade, Wave 4 is
NOT done — fix before tagging.
