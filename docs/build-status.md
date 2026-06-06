<!-- Extracted from CLAUDE.md §17.6 on 2026-06-03. This is the build/verification progress log.
CLAUDE.md keeps only a short pointer + current-status headline; full per-wave detail lives here.
Update this file at the end of every wave. -->

## 17.6 BUILD & VERIFICATION STATUS (progress log)

Tracks what is actually built/verified vs planned. Last reviewed **2026-05-31** (Wave 1.5 remediation: all §17.6 issues resolved, five gates green; re-verified same date with Wave 2 event-bus work in working tree — all gates still green, 258 tests). Update at the end of every wave.

### Implemented & committed (in git history)

- **v1.1** — committed (glassmorphism UI, risk calculator, R-alerts, shortcuts, leverage, screenshots, partial-close, daily-trade-limit + max-daily-loss rules).
- **v1.2 Wave 0 (Foundation)** — committed: partial-close tables reconciled to integer-encoded `trade_partials`; Review-screen shell; smoke E2E + CI (`.github/workflows/ci.yml`: typecheck+lint, unit, build, smoke-e2e jobs on windows-latest, `pnpm install --frozen-lockfile`).
- **v1.2 Wave 1 (Friction quick-wins)** — all six features implemented, committed, AND wired into the UI (verified by source inspection):
  1. Remember last trade — `src/stores/last-trade-context.ts` (session-scoped, not persisted, 6h window); consumed in `PreTradePanel` via `getRecentContext`.
  2. Invalidation quick-chips — `src/features/pre-trade/constants/invalidation-chips.ts` (8 ICT chips, all ≥20 chars) + free-text path preserved; rendered in `PreTradePanel`.
  3. One-tap emotion — `src/features/pre-trade/constants/emotion-presets.ts` (Focused/Neutral/Tilted; Tilted = urgency 8/need 7 trips the emotional-state gate); sliders behind Advanced.
  4. Clean-close TP/SL — `CloseTradeModal.applyCleanClose`; disabled when `hasFlaggedViolations`; never auto-submits.
  5. Command palette (⌘K) — `src/features/command-palette/` (registry + CommandPalette); mounted in `Shell.tsx`, opened from `TopBar`.
  6. Calendar — `CalendarTab` (Analytics tab) + `CalendarWidget` (Dashboard) + `getDailyHeatmap` rollup in `electron/services/analytics/performance.ts`.
- Test files for every Wave 1 feature exist and are well-formed (37 unit/integration test files total at Wave 1 commit; 38 files / 258 tests as of re-verification with Wave 2 `event-bus.test.ts` in working tree — the six Wave 1 test files were checked individually, no duplicated imports or top-level redeclarations).
- Honesty gates verified intact: chips are all ≥20 chars; clean-close is disabled on flagged trades and requires a manual Submit; emotion presets don't change the schema; last-trade pre-fill carries only pair/setup/mode/account, never emotional fields.

### Five quality gates — GREEN on 2026-05-31 (re-verified; Notebook enhancement re-checked)

The 2026-05-30 review could not execute the gates (the Linux review sandbox could not resolve the repo's Windows-symlinked `node_modules`). They were run locally on **2026-05-31** and all passed. Re-verified same date with Wave 2 event-bus changes in the working tree — all five still green. Re-verified again after Notebook enhancement (migration 0007, @uiw/react-md-editor, search, Cmd+K):

| Gate | Wave 1 commit (`f82a0d6`) | Re-verified (Wave 2 WIP in tree) | Notebook enhancement |
|---|---|---|---|
| `pnpm typecheck` | clean | clean | clean |
| `pnpm lint` (`--max-warnings 0`) | clean | clean | clean |
| `pnpm test:unit` | 37 files, 254 tests | 38 files, 258 tests | 53 files, 424 tests |
| `pnpm build` | success | success | success |
| `pnpm test:e2e` (smoke) | passed, 4 consecutive runs | passed | passed |

### Issues found during review — RESOLVED (commit `f82a0d6`, 2026-05-31)

All six issues from the 2026-05-30 review are fixed and covered by the now-green gates.

1. **Calendar day-bucketing ignored the configured timezone — FIXED.** `getDailyHeatmap` now buckets in the user's configured timezone via a shared `electron/services/time/trading-day.ts` module, reused by both the calendar and the rules engine (`engine.ts`, `session-state.ts`), so calendar day == rules-engine day. Covered by `tests/unit/analytics/calendar/CalendarTab.test.tsx` and the `getDailyHeatmap` cases in `performance.test.ts` (near-local-midnight + agrees-with-rules-engine).
2. **Calendar bucketed by `updated_at` — FIXED.** Closed trades now bucket by `exit_time`; null-`exit_time` rows are excluded (no phantom days). Covered by the edit-stability and null-exit_time tests in `performance.test.ts`.
3. **Two floating promises — FIXED.** `CommandPalette.tsx` and `CloseTradeModal.tsx` now `void` the promise and surface rejection (`.catch` → toast / non-fatal).
4. **Clean-close test drift — FIXED.** Prefill logic extracted to the pure module `src/features/post-trade/clean-close-prefill.ts` (`buildCleanClosePrefill` + `dbToDisplayPrice`); both `CloseTradeModal` and `close-clean-prefill.test.ts` import it — drift is now structurally impossible.
5. **Minor — FIXED.** `last-trade-context.ts` JSDoc reconciled to placed-only; a comment documents why `matchCommand` stays substring (shadcn `<Command>` supplies its own filtering).
6. **Duplicated import lines — FIXED.** Cleaned up in the analytics tests.

> Also landed in this commit while hardening the smoke E2E: trade `mode` is threaded through the rules pipeline so sim/backtest trades skip live-only timing rules (`require_killzone`, `weekend_holding_blocked`); the app sets `MotionGlobalConfig.skipAnimations` under `prefers-reduced-motion` so modal flows are deterministic under Playwright; and `Modal` stabilises `onClose` so inline parent callbacks no longer churn the focus-trap effect.

### Repo hygiene (2026-05-30)

- The working tree contained 12 truncated/corrupted uncommitted files from an interrupted earlier session (e.g. `ui-store.ts` ended mid-token at `setSetti`). They were restored to their committed HEAD content — **the corrupt edits were discarded, no committed work was lost.**
- `.git/index` was corrupted during review (filesystem-permission quirk on the Windows mount). **Resolved 2026-05-31:** removed `.git/index` + stale `.git/index.lock` / `.git/index.stash.*` and ran `git reset` to rebuild the index from HEAD. Committed history was always intact; no work was lost. The uncommitted prior-session timezone work (`trading-day` module + calendar fixes) was recovered and is included in commit `f82a0d6`.

### Wave 2 progress — DONE 2026-05-31 (items 11–17 complete; all five gates green, 424 unit tests)

**Wave 2 item 17 ENHANCED — Notebook rebuilt with @uiw/react-md-editor, account-scoping, and search.** Migration 0007 adds `account_id` (nullable FK) and `version` (integer, starts at 1, bumps on title/content change) to `notebook_entries`. `notebook:search` IPC does substring search across title + body via SQLite LIKE. `NotebookPage` rebuilt: the hand-rolled markdown renderer is replaced with `@uiw/react-md-editor` (live split-pane editor/preview, proper toolbar, dark/light via `data-color-mode`); search bar with instant results above the entry list; save-on-blur + Cmd+S; "New notebook entry" and "Search notebook" added to Cmd+K registry (navigating `/notebook?action=new|search`). +9 search and account/version tests (integration). 424 unit tests, all five gates green.

**Wave 2 item 17 DONE — commit `eb7e52c`, 2026-05-31.** Notebook — local markdown notes with templates. Migration 0006 + `notebook_entries` table; CRUD IPC (`notebook:list/get/create/update/delete`, Zod-validated, soft delete, pinned-first list with markdown-stripped preview); `data.ts` export/reset now include it (reset also wipes `dismissed_insights`). `src/lib/markdown.ts` is a dependency-free, XSS-safe renderer (block structure parsed on the raw line, all text HTML-escaped before any tag, links limited to http/https/mailto). `NotebookPage` is a two-pane editor (list + markdown Edit/Preview) with New / New-from-template (trading plan, watchlist, weekly review), pin and soft-delete; new `/notebook` route, sidebar entry, and "Open Notebook" command. +21 tests (markdown subset + XSS, CRUD integration against a real sql.js DB, migrations journal/table updates, page smoke).

**Wave 2 item 16 DONE — commit `bc3808b`, 2026-05-31.** Per-trade A–F quality grade. Pure `src/lib/trade-grade.ts` scores the *decision* not the result (discipline-first): plan-followed +35, rules-clean +30 (−10/rule), planned RR ≥2.0R +20 / ≥1.5R +10, R outcome >0 +15 / break-even +7; bands A≥85…F<40; unclosed trades return null. A disciplined loss can grade A; a rule-breaking win grades F. `GradeBadge` shown in the trade-log Grade column (+ CSV) and the trade-detail header. +13 tests incl. fast-check properties (always A–F in [0,100]; following the plan never lowers the score).

**Wave 2 item 15 DONE — commit `ce30ab7`, 2026-05-31.** Composite performance score (Zella-Score style). Pure `electron/services/analytics/composite-score.ts` combines five decimal.js sub-scores (win rate, profit factor, avg win/loss, consistency = 1 − maxWinR/grossWinR, clean-rate) into a 0–100 rating, weighted .15/.30/.20/.15/.20; `sufficient=false` below 10 rated trades. `dashboard.ts` computes it over the last 50 closed trades on `DashboardStats.compositeScore`; the dashboard renders a "Performance" readout under the Discipline Ring. +11 tests including fast-check [0,100]-bound and R-scale-invariance properties.

**Wave 2 item 4 DONE — commit `eac6e9e`, 2026-05-31.** Auto-detect rules broken at close. Six pure detectors in `electron/services/rules-engine/close-detection.ts` (SL widened, TP narrowed, risk increased >10%, outside killzone, daily-limit exceeded, circuit-breaker bypassed); `detectCloseViolations(db, tradeId)` orchestrates them, sourcing planned values from the immutable trade and actual SL/TP/lot from recorded modification snapshots in `rule_violations`. `rules:detectCloseViolations` IPC + `CloseDetectionDTO`. The Close Trade modal pre-ticks matching checklist rows with a "detected by Cairn" badge; the trader still confirms/unticks (honesty preserved). Real-time hooks (prevention over detection, §14 #14): `no_sl_widening` already blocks SL widening live (snapshot now carries `field`); NEW `no_tp_narrowing` registry rule blocks cutting TP toward entry live, seeded enabled. **Real-time risk-increase hook landed — commit `754e332`, 2026-05-31:** `position_size_matches_plan` now also evaluates lot-size *modifications* (not just pre-trade drafts), recording a `{ field:'lot_size', current, proposed }` snapshot when a mid-trade size-up exceeds tolerance, so detector #3 fires live and persists. +43 tests (6 detector suites, the new rule, DB integration incl. the seeded widened-SL → `no_sl_widening` pre-tick case, and a modal pre-tick component test); 368 unit tests green.

**Wave 2 item 3 DONE — commit `4ac1913`, 2026-05-31.** Local insight engine: five pure heuristics in `electron/services/insights/` (`urgency-hurts`, `killzone-expectancy`, `tilt-cycle`, `best-setup-underused`, `worst-hour`). Each takes `ClosedTrade[]` and returns `Insight | null`. `insights:list` / `insights:dismiss` IPC. Migration 0005 adds `dismissed_insights` (7-day snooze). Review screen "Patterns" section renders non-null insights sorted by severity with per-card dismiss. 5 new test files (unit + fast-check property each). No LLM, no network, no "AI" label anywhere.

**Wave 2 item 2 DONE — commit `f13cabd`, 2026-05-31.** Derived analytics: `electron/services/analytics/derived.ts` with five pure functions (`getTimeOfDayHeatmap`, `getDowSummary`, `getExpectancyWithSpark`, `getProfitFactorR`, `getRDistributionPure`), all taking `TradeRowForDerived[]`. Expectancy and profit factor use decimal.js exclusively — no float arithmetic. `analytics:derived` IPC channel + `DerivedTab` ("Metrics" tab) wired into Analytics page. 24 tests including two fast-check properties (constant-outcome expectancy, scale-invariant profit factor). decimal.js 10.6.0 added.

**Wave 2 item 1 DONE — commit `14d8ced`, 2026-05-31.** Typed event bus implemented end-to-end:
- `electron/ipc/trades.ts` emits `cairn:event` after every DB-committing trade mutation (`trade.placed`, `trade.closed`, `trade.partial-closed`, `session.locked`, `rule.violated`).
- `electron/preload.ts` fans the IPC channel into per-name listener sets, exposed as `window.api.events.{on,off}`.
- `src/lib/event-bus.ts` — typed module-level singleton wrapping the preload bridge.
- `DashboardPage` subscribes via `eventBus.on(...)`, refreshing the Discipline Ring, streak, and all stat cards on every trade mutation. No polling.
- `tests/integration/event-bus.test.ts` — 4 integration tests asserting event payload shape for `trade.placed`, `trade.closed`, `rule.violated`, `trade.partial-closed`.
- Also fixed a pre-existing flaky failure in `ReviewPage.test.tsx` (double-useEffect race with `afterEach`/`delete window.api`).

All five gates green post-commit: typecheck · lint · 258 tests · build · smoke E2E.

**Wave 3 item 18 DONE — commit `0505913`, 2026-05-31.** MT5 statement import adapter. Migration 0008 adds `external_ref` (unique partial index on non-NULL) to `trades` + `trade_partials`. Parser (`electron/services/import-adapters/mt5/parser.ts`) finds Deals/Orders tables by section label across EN/ES/DE languages, detects column positions from header row, skips balance rows silently, propagates all unparseable rows as `Mt5ParseError`. Reconciler (`reconciler.ts`) groups deals by orderId, detects full-close vs. still-open by lot totals, derives partialExits. IPC: `import:previewMt5` (resolve + dedupe + return preview, unresolved excluded from skippedCount); `import:commitMt5` (block on any unresolved symbol, write in one transaction with full decimal encoding). 34 new tests (16 parser unit + 18 reconciler unit + 17 integration); all 5 quality gates green: typecheck · lint(0) · 478 tests · build · smoke E2E. Also bumped all test fixture files to load migrations 0001-0008 (Drizzle includes new nullable columns in INSERTs if they appear in the schema, so the test DB must stay in sync).

**Wave 1 DONE (baseline) — commit `f82a0d6`, 2026-05-31.** All six §17.6 issues resolved, five quality gates green, Wave 2 unblocked.

### Wave 3 progress — DONE 2026-06-01 (items 18–24 complete; all five gates green, 661 unit tests)

**End-to-end verification (2026-06-01):** All seven Wave 3 items confirmed user-reachable — not source-only.

**Item 21 note:** MAE/MFE auto-compute infrastructure is fully present and tested (`mae-mfe-commit.test.ts`). Current statement formats (MT5/cTrader HTML, TradingView CSV) do not carry per-candle OHLC data, so both columns remain null for all current imports. The committer correctly populates them when a future adapter provides `priceSeries + stopLoss`.

| Gate | Wave 3 closeout (`04a82b6`) |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` (`--max-warnings 0`) | clean |
| `pnpm test:unit` | 69 files, 661 tests |
| `pnpm build` | success |
| `pnpm test:e2e` | passed |

**Wave 3 item 18 DONE — commit `0505913`, 2026-05-31.** MT5 statement import adapter. Migration 0008 adds `external_ref` (unique partial index on non-NULL) to `trades` + `trade_partials`. Parser (`electron/services/import-adapters/mt5/parser.ts`) finds Deals/Orders tables by section label across EN/ES/DE languages, detects column positions from header row, skips balance rows silently, propagates all unparseable rows as `Mt5ParseError`. Reconciler (`reconciler.ts`) groups deals by orderId, detects full-close vs. still-open by lot totals, derives partialExits. IPC: `import:previewMt5` (resolve + dedupe + return preview, unresolved excluded from skippedCount); `import:commitMt5` (block on any unresolved symbol, write in one transaction with full decimal encoding). 34 new tests (16 parser unit + 18 reconciler unit + 17 integration); all 5 quality gates green: typecheck · lint(0) · 478 tests · build · smoke E2E. Also bumped all test fixture files to load migrations 0001-0008 (Drizzle includes new nullable columns in INSERTs if they appear in the schema, so the test DB must stay in sync).

**Wave 3 item 19 DONE — commit `b35172e`, 2026-05-31.** cTrader HTML statement import adapter (shared import layer refactor). `electron/services/import-adapters/ctrader/` parser + reconciler; shared `_shared/symbol-resolver.ts`, `committer.ts`, `encoder.ts`. `import:previewCtrader` / `import:commitCtrader` IPC handlers. 17 integration tests + 22 reconciler unit + 19 parser unit. All five gates green.

**Wave 3 item 20 DONE — commits `b35172e` (handler) · `4069b56` (IPC bridge) · `0d42e6e` (Import UI) · `a5898c4` (integration tests), 2026-06-01.** TradingView CSV import adapter (parser + reconciler), IPC bridge in preload.ts + ipc.ts + shared/types, Settings → Import tab (MT5 / cTrader / TradingView picker → file → preview table → symbol mapper → commit → done), "Import statement" in ⌘K registry, 20 integration tests + 19 parser unit + 21 reconciler unit + 4 ImportTab smoke tests.

**Wave 3 items 21–24 DONE — commit `04a82b6`, 2026-06-01.** All shipped together as the remaining Wave 3 working-tree files:
- **21 (MAE/MFE):** `electron/services/mae-mfe.ts` — pure `computeMaeMfe` (decimal.js, OHLC candles); shared committer calls it when `priceSeries + stopLoss` present; 5 committer integration tests + 15 unit tests (fast-check properties: always returns non-negative R, scale-invariant).
- **22 (Two-phase logging):** Migration 0009 adds `phase`, `awaiting_reflection`, `reflected_at` columns to `trades`. `closeMinimal` + `completePhase2` IPC handlers (Zod-validated). `CloseTradeModal` reads `pre_trade.fast_path_enabled` (default true, toggled in Settings → General); when enabled shows minimal close form + deferred-reflection notice and calls `closeMinimal`. `ReflectionModal` on ReviewPage calls `completePhase2`. `listAwaitingReflection` + `countAwaitingReflection` IPC for the queue. Integration test: `two-phase-logging.test.ts` (5 tests).
- **23 (Sidebar badge):** `src/stores/reflection-store.ts` tracks `pendingCount` via `ipc.trades.countAwaitingReflection`; Sidebar subscribes, shows badge on Review nav item (collapsed: dot; expanded: count pill), refreshes on `trade.closed` and `trade.reflected` eventBus events.
- **24 (Playbooks):** Migration 0010 adds `playbooks` table. `electron/ipc/playbooks.ts` CRUD handlers (Zod-validated). `PlaybooksTab.tsx` in Settings. `src/lib/playbook-prefill.ts` — pure `buildPlaybookPatch`; applied in PreTradePanel on inline `<select>` change and on `initialPlaybookId` from ⌘K `playbookIdRequested` store signal. Analytics: `playbook-analytics.test.ts` (6 tests), `playbooks.test.ts` integration (11 tests), `playbook-prefill.test.ts` unit (12 tests).

---

## v2.0 — Cloud / Sync / Billing (Stage 18.x, in progress)

The v2.0 rebuild (CLAUDE.md §18 / `docs/roadmap-v2.0.md`) is underway on top of the v1.2 feature-complete base. Stages 18.0–18.3 (monorepo move, shared types/Zod, P&L → decimal.js) landed earlier; the entries below cover the crypto / server / sync stages.

### Stage 18.4 — client-side E2E crypto + OS keychain — committed `e812589`

libsodium-based client crypto per `docs/security.md`: Argon2id KDF → KEK, data-key wrap/unwrap, XChaCha20-Poly1305 AEAD, recovery phrase. OS keychain (keytar) caches the unwrapped data key at rest. Shared result/error/crypto/auth types + auth/billing/devices/vault Zod schemas landed alongside in `9c73422`.

### Stage 18.5 / 18.6 (server half) — Fastify backend — committed `91c0fb2`

Fastify API: auth (Argon2id + pepper, JWT access ≤15 min + opaque rotating refresh with reuse-detection), billing (BillingProvider + entitlements), vault (ciphertext push/pull), devices, signature-verified idempotent webhooks. Server stores ciphertext only; never decrypts user content. Vault key-material endpoints (`/vault/key` GET/PUT) + password reset landed in follow-up `15299b3`.

### Stage 18.5 — OpenAPI 3.1 spec + Scalar API reference docs — pending working tree (this change)

Closes the one outstanding Stage 18.5 (Stage 3) scope item: "OpenAPI / Scalar docs". The routes validate with Zod at the boundary rather than attaching Fastify JSON schemas, so there is nothing for a schema-introspecting generator to read — the contract is therefore **hand-authored and reviewed** in `apps/server/src/docs/openapi.ts` (typed `as const`, no `any`), covering all 25 registered HTTP paths (health, auth, devices, vault, billing, webhooks, admin) with the universal `Result<T>` envelope and bearer/admin security schemes.

- **Serving (`apps/server/src/docs/routes.ts`)** — `GET /openapi.json` (raw spec for any OpenAPI tooling), `GET /docs` (Scalar UI), `GET /docs/standalone.js` (the vendored Scalar bundle). Gated by new env `ENABLE_API_DOCS` (default `true`; `false` → routes 404, revealing nothing).
- **Self-hosted, offline** — Scalar's browser bundle (`@scalar/api-reference` 1.32.0, MIT) is **vendored** at `apps/server/src/docs/scalar-standalone.js` and served same-origin. No CDN, so no Subresource-Integrity gap and no external runtime dependency. (pnpm could not add a runtime dep from the Linux build sandbox — EPERM on the Windows-mounted store — so vendoring is also the only verifiable path here.)
- **CSP** — the global helmet policy is `default-src 'none'`; the three doc routes relax CSP to *same-origin* sources only (the narrowest policy that lets Scalar render), since they serve no secrets and no user content.
- **Tests** — `apps/server/tests/integration/docs.test.ts` (6 cases, **DB-free**): valid OpenAPI 3.1 doc; documented-paths == registered-paths drift guard; bearer security on authed endpoints; `/docs` HTML + relaxed-CSP override; vendored bundle served; all doc routes 404 when disabled.
- **Verification** — the 6 docs tests pass and the new files typecheck clean under the repo's exact strict flags, run in a throwaway pinned-version project in the build sandbox (the repo's own `node_modules` are Windows symlinks the Linux sandbox can't resolve — same limitation noted in the 2026-05-30/31 review). **The five repo gates (typecheck · lint · full vitest · build · smoke E2E) still need a run on the Windows host** — the full server suite needs the Docker Compose Postgres, and the desktop build/E2E can't run in the sandbox.

### Stage 18.6 (client sync half) — push / pull / merge slice — committed `363f8c8`

Vertical sync slice for the **`trades` table only** (intentionally one table end-to-end; other tables follow in the next prompt). On disk under `apps/desktop/electron/services/sync/` (`enqueue`, `pull`, `cycle`, `push`, `clock`, `canonical`, `serialize`, `store`, `runner`, `http`, `queue`, `types`, `index`):

- **Encryption-on-write (`enqueue.ts`)** — single `enqueueSyncOp(table, record_id, op_type, plaintext_row)` helper; the only way to enqueue. After a handler's DB commit it bumps the record's vector clock, wraps the row in a canonical-JSON envelope, appends to `sync_queue`. No-ops until sync is enrolled, so the offline-first app is untouched. Currently wired into the seven mutating **trades** handlers in `ipc/trades.ts` only.
- **Pull (`pull.ts`)** — `/vault/pull` with persisted cursor; per page: decrypt (AD = `table:record_id`) → validate the table's Zod schema → compare clocks → apply / ignore / conflict / quarantine. Whole page applied in one transaction; schema failures are **quarantined + audit-logged, never discarded**.
- **Merge/conflict (`compareClocks`)** — ancestor→apply, descendant→skip, concurrent→**both versions retained** in `sync_conflicts` + audit line (resolution modal is the next prompt).
- **Runner (`cycle.ts`)** — each tick is a push→pull cycle; `wrong-key` pause path on decrypt-of-own-op failure.
- **Migrations** — `0011_sync.sql` (`sync_queue`), `0012_sync_merge.sql` (`sync_conflicts`, `sync_quarantine`, `sync_audit`, `sync_state` cursor). Both additive + idempotent; empty on existing installs until sync is enrolled.
- **Decrypt-failure policy** — a *foreign* device's undecryptable op → quarantine (single tampered/misrouted row); our *own* op failing → wrong-key halt. Whole-vault rotation caught upstream by `key_version` manifest check.
- **Robustness (from §19.11 review)** — upsert uses `ON CONFLICT DO UPDATE` (not `INSERT OR REPLACE`, which would cascade-delete a trade's child rows); enqueue is best-effort (swallows + logs) so a sync hiccup can never break the canonical local write.

**Tests:** ~74 sync test cases (`tests/unit/sync/`: canonical, clock, vector-clock, enqueue, push, merge, runner, serialize, cycle) — the four required scenarios pass (two-device→conflict in both DBs; linear→no conflict + B sees A's change; wrong-AD→quarantined; server-can't-decrypt), plus schema-invalid, wrong-key, cycle, and canonical-JSON.

**Gates (as reported by the build session, not independently re-run here):** typecheck ×2 · lint 0 · 791 unit tests · build · smoke E2E not re-run.

**Known scope boundary (next prompt):** only `trades` is in the `store.ts` apply registry (`TABLE_SPECS`) and only `trades.ts` is wired to `enqueueSyncOp`. Registering the other syncable tables (accounts, sessions, playbooks, notebook…), the main-process wiring (`SyncWriteContext` + `createSyncRunner` in `index.ts`, device id + data key + token refresh), and the conflict-resolution modal are still pending.

### Stage 18.6 (Sync Engine, "Stage 4") — full sync slice + enrollment/recovery + conflict UI — working tree (this change)

Completes the four remaining Sync-Engine pieces on top of the trades-only slice (`363f8c8`). **Five gates all green on the Windows host:** `typecheck` · `lint --max-warnings 0` · **860 unit/integration tests (89 files)** · `build` · **smoke E2E (passed, 58.7 s)**.

**Foundational fix — durable vector clocks (decided with the user).** The Stage-18.6 design hydrated the in-memory clock from a per-table `version` column that never existed on `trades`/`accounts`/`sessions`/`trade_partials` (`activate.ts` ran `SELECT id, version FROM trades`, which would throw at runtime — the engine had only ever been exercised by unit fakes, never end-to-end). A `version`-only column also stores just *this* device's component, so a foreign-op replay after a restart would compare `concurrent` → a phantom conflict (violating §2.5). Replaced with a dedicated **`sync_clocks(table_name, record_id, clock json, updated_at)`** table (migration 0013) holding each record's FULL clock. The write path (`enqueue.ts`) upserts the bumped clock in the same txn as the `sync_queue` insert; the pull/merge path (`pull.ts` + `store.setClock`) upserts the merged clock inside the page txn; the cache hydrates from it (`clock.ts` `RecordClock`, `activate.ts` `readClocks`).

1. **All syncable tables registered.** `store.ts` `TABLE_SPECS` now covers `trades`, `accounts`, `sessions`, `playbooks`, `notebook_entries`, `trade_partials` (Zod row schema + `columnMap` each; money/pips integer-validated). `enqueueSyncOp` wired into `ipc/accounts.ts`, `sessions.ts`, `playbooks.ts`, `notebook.ts`, and the `trade_partials` insert in `trades.ts` partial-close — after each DB commit, matching the trades pattern. Migration 0013 also conforms two tables: `sessions` gains `deleted_at`; `trade_partials` gains `updated_at` + `deleted_at`. **Deliberately excluded** from sync: reference/seed tables (`pairs`, `setups`, `killzones`, `prop_firms`, `account_templates`), local-only/derived tables (`account_rules`, `rule_violations`, `cooldowns`, `dismissed_insights`, `reviews`, `backup_log`, `trade_screenshots`), and the sync bookkeeping tables themselves. (Import-adapter bulk commits do not yet enqueue — a documented follow-up.)
2. **Main-process wiring.** `activate.ts` hydrates from `sync_clocks` and wires `SyncWriteContext` + `createSyncRunner`; `main.ts` now triggers `runner.onFocus()` on window focus (interval + focus + manual `sync:now` per docs §10). First-login enrollment (password → Argon2id → unwrap → keychain cache) already lived in `SessionStore.unlockVault`/`VaultEnroller`; this stage fixes the clock hydration it depended on. New `sync:status` IPC exposes `{ configured, paused }`.
3. **Recovery phrase.** Enrollment already generates a 24-word BIP-39 phrase shown once; added the recover-from-phrase path: `VaultEnroller.recover` unwraps the data key via the recovery-wrapped key, re-wraps under a new password KEK (fresh salt, recovery key preserved), and re-registers. `SessionStore.recoverVault` + `vault:recover` IPC. Tests prove the phrase recovers the same data key, a valid-but-wrong phrase → `WRONG_KEY`, a bad-checksum phrase → `INVALID_RECOVERY_PHRASE`, and no-vault → `NOT_FOUND`.
4. **Conflict-resolution UI.** `ipc/sync-conflicts.ts` (`list`/`count`/`resolve`); resolution merges the losing clock in (`mergeRemoteClock`), applies + re-enqueues the winner so it dominates both. `src/features/sync/ConflictResolver.tsx` — floating badge + modal showing both versions with a per-field diff and a winner picker — mounted in `App.tsx`. Exposed via preload + `src/lib/ipc.ts`.

**Tests added:** `sync-tables.test.ts` (round-trip + two-device concurrent→conflict for all 5 new tables), recovery cases in `enrollment.test.ts`, migration-0013 assertions in `migrations.test.ts`, updated `clock.test.ts`/`merge.test.ts`/`enqueue.test.ts` for the durable-clock model. The 11 hardcoded test-DB migration lists were bumped through 0013 (Drizzle emits the new nullable columns in INSERTs, so the test schema must match).

**Two launch-crash bugs the E2E caught and this change fixes** (they broke the *entire* `feat/vault-enrollment-server` branch at runtime — the app could not start once the vault/session wiring became eager at startup; both pre-dated this prompt and were never E2E'd):
- `@scure/bip39` (+ `@scure/base`, `@noble/hashes`) are ESM-only → the CJS main bundle `require()`d them → `ERR_REQUIRE_ESM`.
- `@cairn/*` workspace packages ship raw TS source → `require()` of `src/index.ts` → `SyntaxError: Unexpected token 'export'`.
Fix: `electron.vite.config.ts` now excludes both groups from `externalizeDepsPlugin` so Vite bundles them into the main chunk.

Also fixed two pre-existing floating-promise lint errors in `apps/server/src/docs/routes.ts` (`reply.removeHeader` — Fastify replies are thenable) that were blocking the lint gate.
