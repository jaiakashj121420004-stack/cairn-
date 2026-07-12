<!-- Extracted from CLAUDE.md §17.6 on 2026-06-03. This is the build/verification progress log.
CLAUDE.md keeps only a short pointer + current-status headline; full per-wave detail lives here.
Update this file at the end of every wave. -->

## 17.6 BUILD & VERIFICATION STATUS (progress log)

Tracks what is actually built/verified vs planned. Last reviewed **2026-05-31** (Wave 1.5 remediation: all §17.6 issues resolved, five gates green; re-verified same date with Wave 2 event-bus work in working tree — all gates still green, 258 tests). Update at the end of every wave.

### 2026-07-12 — UI / design-polish round (post-P3), all committed + build-green

Three commits on `feat/rules-engine`, then a recovery:

- **`75b7cc4`** `fix(ui)`: (a) **tab-switch blank-page bug** — `Shell.tsx` wrapped the lazy (code-split) routes in `Suspense` + `AnimatePresence mode="wait"` + an `exit` animation; when an incoming route's chunk suspended, `mode="wait"` was still waiting on the old page's exit, so the new page mounted but its enter fade never fired → it sat at `opacity:0` until a reload. Replaced with a keyed fade-in inside `Suspense` (no `AnimatePresence`). (b) Removed the decorative stat-card area-charts (`DecorativeWave` / `SparklineArea` deleted, `sparkData` prop + `equitySpark` gone). (c) Floating card depth (`.card-float`).
- **`2c86ca5`** `feat(ui)`: textured **`.app-canvas`** backdrop (fine paper grain + warm ambient light — sunlit by day, lamplit by night — + edge vignette), **embossed/letterpressed** theme-aware `.card-float`, and fixed the **empty Discipline ring** (was an invisible `bg-surface` pulse → now a dashed ring + "Select an account"). This **amends the flat §14 #10 aesthetic** (texture + light + depth, NOT neon/glass) per an explicit user request; `DESIGN-GUIDELINES.md` / `docs/design-system.md § v3.0` not yet formally re-written.
- **`7d51b6e`** `fix(ui)`: **base64-encode the paper-grain SVG data-URI**. The original inline `url("data:image/svg+xml,…")` had raw spaces + a nested `url(#g)` filter reference, which broke CSS minification and **nuked the entire stylesheet** (app rendered unstyled — nav as raw blue links). Base64 has no spaces / no inner `url(` / no `#`, so it's parser-safe.

**LESSON (important):** any CSS / `globals.css` change MUST be validated with `.\run-host-gates.ps1` — the **`build`** gate is the only one that compiles CSS. The husky pre-commit runs only typecheck / lint / format:check, and **none of those catch a CSS compile failure**. `2c86ca5` slipped through pre-commit and broke the app; caught only on a later full gate run.

Final state: all five desktop gates GREEN (typecheck / lint / test:unit / **build 14.3s** / e2e); on that run the Postgres/server gates also passed (WinNAT free), only `docs routes smoke` red (unrelated server docs-toggle quirk). App renders correctly in both light and dark.

### 2026-07-12 — P3 (breadth/opportunity) COMPLETE — 5 candidates, all committed

All five P3 candidates shipped on `feat/rules-engine`, each committed after all five desktop gates GREEN (typecheck / lint / test:unit / build / e2e). The three backend gates stay RED on the WinNAT-blocked runs (unrelated); on one M2 run the Postgres/server gates went green when the port freed.

1. **Live in-trade warnings surfaced** (`13807cd`). Wave-4 live-detection already computed SL-widen / TP-cut / size-up / over-trade / outside-killzone / circuit-breaker breaches and persisted them (`rule_violations.outcome='detected_live'`) but nothing in the renderer consumed them. Added `broker.warning` to the renderer event-bus union; `BrokerWarningToasts` (mentor-voice toast, deduped per trade+rule) mounted in `App`; a persistent Dashboard "Live Discipline · Today" card via a new `dashboard:getLiveWarnings` read IPC.
2. **Pre-trade psychology nudges** (`13807cd`). Pure `electron/services/insights/pre-trade-signals.ts` (current-loss-streak + urgency win-rate split, tested); `insights:preTradeSignals` IPC; `pretrade_nudges` settings key (allow-listed); non-blocking tilt + urgency banners in `PreTradePanel`; configurable thresholds in Settings → Alerts.
3. **Data-backed weekly review** (`e4fe4e9`). New pure `src/lib/week-range.ts`; `WeeklyReview` digest (net P&L / R / win-rate / expectancy / discipline + week-over-week trend / top-broken) computed from the existing `analytics.performance` + `analytics.adherence` IPCs with a week `dateFrom/dateTo` — no backend change; "Write review for this week" pre-fills the manual review form with the computed adherence score.
4. **Embedded TradingView review chart** (`99ea713`). `src/lib/tradingview.ts` URL builders + `TradingViewChart` (collapsed until "Show chart", sandboxed cross-origin iframe so their JS runs in their frame) in the trade detail. CSP change is minimal and safe: `frame-src 'self' https://www.tradingview.com https://s.tradingview.com` only — `script-src` stays `'self'`, so the P1 hardening is intact. Manual QA still owed (gates can't render the embed).
5. **Multi-asset (contract-spec instruments)** — M1 `aee8f76`, M2a `5b35a28`, M2b `da72bb7`, M2c `bb482ea`. Finding: `pairs.asset_class` + the 6-class enum already existed and the app already ships forex/indices/metals/crypto; the real gap was the money model + a `stocks` enum bug (DB CHECK allowed it, IPC rejected it). **M1:** fix the stocks bug end-to-end + `src/lib/asset-class.ts` per-class defaults and pip/point vocabulary in PairsTab. **M2a:** migration `0019_pair_contract_spec` (nullable `tick_size` / `tick_value_cents`) + `electron/services/pricing.ts` `derivePipValueFromTick` (decimal.js, property-tested: `pipValue = round(tickValueCents × 10 / tickSizeStored)`, exact for EURUSD/ES); the pairs IPC derives + stores the canonical pip value on save so every existing consumer is untouched. **M2b:** `calculatePnl` gains an optional **tick-native** path (gated on tick fields, so existing pip pairs are byte-identical) wired into all three trades.ts P&L sites, with a **property test proving tick-path ≡ pip-path** cent-for-cent on the exact-pip domain. **M2c:** PairsTab "Configure by: Pip value | Contract spec" toggle with a live pip-value preview (`src/lib/contract-spec.ts`). §2.5 preserved throughout — no existing trade's P&L changes.

**Migration-list note:** when adding a `pairs`-touching migration, update the two explicit lists — `tests/integration/migrations.test.ts` (`orderedTags`) and `tests/unit/db.test.ts` (its `MIGRATIONS` array stops at 0013 but queries `pairs` via the drizzle schema, so a `pairs` column add must be appended). All other test DBs are journal-driven (`applyAllMigrations`) and pick new migrations up automatically.

**Still open after P3:** TradingView embed manual render QA; MT5 fill-capture QA (market-open) + on-chart gate entitlement; cTrader Spotware KYC; P4 (Dodo billing, deferred; needs the local Fastify backend).

### 2026-07-11 — P0 live QA + P1 security (A–E) + P2 hygiene (A–B), all committed

Executed the regrade backlog (`docs/` regrade doc / memory `cairn-regrade-plan-2026-07-10`). All five desktop gates GREEN throughout (typecheck / lint / test:unit **1148** / build / e2e). Branch `feat/rules-engine`.

**P0 external checklist (needs Akash's machine/accounts):**
- **P0.1 DONE** — compiled `CairnBridge.ex5` in MetaEditor (0 errors); installer bundles it; Cairn "Install Cairn EA" copies the compiled `.ex5` into MT5 `MQL5/Experts`.
- **P0.2 — MT5 bridge VERIFIED LIVE.** EA attached on a MetaQuotes-Demo account; Cairn Integrations shows heartbeats ("Last event: Ns ago"). **Fill capture NOT yet tested** (Saturday = markets closed, demo has no crypto) — resume Sunday ~5pm ET/Monday: place a trade → bind the unmapped account → draft trade → close. The **on-chart pre-trade gate is not live-testable** on this build (paid feature; free-tier session; billing deferred).
- **P0.4 — Spotware app registered** ("Cairn Trading Cockpit", app id **33053**, read-only `accounts` scope, redirect `http://127.0.0.1:53129/ctrader/callback`); Client ID/Secret pasted into Cairn (keychain). **cTrader connect BLOCKED on Spotware KYC (~3 business days)** — the OAuth flow requires app status "Active"; even Demo routes to the "needs Active" page. Nothing to fix our side.

**P1 security hardening — A–E DONE + committed** (`7b65faf` = A–D, `68bc47d` = E):
- A: backup zip-slip guard; https-in-packaged enforcement (loopback http allowed); `settings:set` key allow-list. B: MT5 pairing token encrypted via `safeStorage` (`secret-box.ts`) + legacy plaintext migration. C: renderer `sandbox:true` on both windows. D: strict CSP via build-time `<meta>` (hash of the inline theme script into `script-src`; e2e exercises it since it's baked into `out/`). E: keytar → `safeStorage` migration for all secrets (`secure-store.ts`: encrypted `<userData>/cairn/secrets.json` + one-time keytar-read migration; keychain/ctrader tokens/app-creds swapped). Tests: `tests/unit/security/{hardening,secret-box,secure-store}.test.ts`. **Manual per-OS check Akash still owes:** after rebuild+reinstall, Settings→Integrations→cTrader should still show "OAuth credentials configured" (proves the keytar→safeStorage migration).

**P2 hygiene:**
- **A DONE** (`ffa4aec`) — removed 13 tracked `.fuse_hidden*` orphans (−5318 lines) + gitignored them.
- **B DONE** — journal-driven test-DB migrations (`tests/helpers/test-migrations.ts` `applyAllMigrations`, reads `meta/_journal.json`); converted `_db.ts` + `_fixtures.ts` + 17 inline-list tests off hardcoded migration arrays. **Retires the migration-list drift class** (adding a migration no longer edits ~20 test files). `db.test.ts` + `migrations.test.ts` intentionally left explicit. (Commit pending at time of writing: `git add apps/desktop/tests`.)
- **C — closed no-op:** stale `Cairn_Report_...TradeZella.html` kept (referenced by §17.5 as historical rationale); coverage-threshold ratchet deferred (risky to raise blind).

**Deferred to P4 (billing):** Dodo Payments integration — full plan + 7 task-slices scoped (memory `cairn-p1-security-and-billing`); decisions: Dodo + keep Stripe/Razorpay stubs, Pro = gate+live+sync/web, monthly+annual, **$19/mo (~₹1,599)** / ~$190/yr. Needs the deferred Fastify backend running (local Docker + `dodo wh listen`; WinNAT reset for server gates).

**NEXT: P3 (breadth/opportunity)** — surface Wave-4 live in-trade warnings as a headline; psychology-driven pre-trade nudges; high-signal reports + weekly-review; TradingView replay embed; optional multi-asset (schema change).

### Regrade & P0–P4 execution plan (2026-07-10)

Re-verified the 2026-07-10 full review (`Cairn_Full_Review_2026-07-10.md.pdf`) line-by-line against the live tree. The review predates the same-day connectivity + security commits below, so five of its deductions are already void (MT5 EA bundled + one-click install; cTrader keychain-paste UI; `paths:openFile` contained; `trades:addScreenshot` validated; `openExternal`/`will-navigate` locked down; committed `dist/` is not actually git-tracked). **Regrade:** Product **8.3** (was 7.5), Code **9.2** (was 9), Security **8.4** (was 7.5); MT5 + cTrader both **shippable on a stock build**, pending the last-mile items below.

Full plan doc lives in the session outputs (`Cairn_Regrade_and_Plan_2026-07-10.md`). Prioritized backlog:

- **P0 — moat last mile:** (1) bundle a pre-compiled MT5 `.ex5`; (2) live-terminal QA for both brokers (`broker-integration.md §10`); (3) historical backfill over the live link (cTrader `ProtoOADealListReq` + MT5 first-connect reconcile, converge via `external_ref`); (4) Cairn-owned cTrader OAuth app (public client id / proxy token exchange); (5) cTrader account-picker + Test-connection; (6) first-run demo mode; (7) MT5 on-chart pre-trade gate (`plan.md`).
- **P1 — deferred security (6):** strict nonce CSP (externalise the inline theme script first), `sandbox:true` + threat-model note, `settings:set` key allow-list, MT5 pairing token → keychain, keytar → safeStorage, https enforcement in packaged builds; verify adm-zip per-entry containment.
- **P2 — hygiene:** host-gate + commit the Almanac design round; remove ~13 tracked `.fuse_hidden*`; shared journal-driven test-DB helper (kill the hardcoded-migration-list drift class); ratchet coverage toward 90%; reconcile stale `Cairn_Report_Working_Friction_vs_TradeZella.html`.
- **P3 — breadth/opportunity:** surface Wave-4 live in-trade warnings as a headline; psychology-driven pre-trade nudges (urgency-hurts/tilt); TradingView replay embed; a few high-signal reports + weekly-review; optional multi-asset (core-schema change).
- **P4 — launch/cloud:** deferred per standing decision until feature-complete; gate is the 30-item `launch-checklist.md` + soft-launch window.

Suggested order: P0.1–P0.2 → P1.1–P1.4 → P2.1 → P0.3–P0.6 + P3.1 → remainder. P0.1 (`.ex5` compile), P0.2 (live QA), P0.4 (Spotware registration) carry an external/host dependency (Akash's machine); the rest are code-complete in-repo.

**P0.6 (first-run demo mode) — DONE, five desktop gates GREEN (2026-07-10).** New `electron/services/demo/demo-seed.ts` seeds one fixed `DEMO_ACCOUNT_ID` (2-step $50k challenge + phases + default rules), ~23 closed trades over ~3.5 weeks (mixed clean/dirty, P&L run through the production `calculatePnl` so encoding is exact), 2 playbooks, a welcome note — idempotent, reversible (`removeDemoData`), never enqueued to sync. `electron/ipc/demo.ts` = `demo:status`/`demo:enter`/`demo:exit`. Wired through the full chain + UI: "Explore a demo" on the onboarding welcome, a flat `DemoBanner` with "Exit demo & set up" (clears demo data → onboarding). Test: `tests/unit/demo/demo-seed.test.ts` (5 cases, journal-driven DB so it can't drift behind a migration). **Wiring lesson: the typed IPC chain has EIGHT sites, not six — `src/lib/transport-electron.ts` holds a `Dispatch = { [K in keyof Procedures]: … }` mapped type that MUST get an entry for every new procedure, and `apps/web/src/lib/transport-http.ts` has a `switch` router (its `default → NOT_IMPLEMENTED` makes web-unsupported procedures like `demo:*` safe without a case).** Missing the transport-electron entries failed `typecheck` (non-exhaustive map) AND `test:e2e` (runtime dispatch threw → App boot `await` rejected → onboarding never rendered). Note: `test:e2e` (`playwright test`) does NOT rebuild — always `build` before `test:e2e` or it runs the stale `out/`.

**P0.5 (cTrader account-picker + Test-connection) — DONE, five desktop gates GREEN (2026-07-10).** Additive + read-only, `connectCtrader()` untouched (its auto-select stays the default). New service fns in `electron/services/broker/index.ts`: `listCtraderAccounts()` (REST `GET /connect/tradingaccounts` via keychain token), `selectCtraderAccount(id)` (persists via `setCtraderAccountId`; restarts the stream if one is live), `testCtraderConnection()` (lists accounts to prove creds+token+network — never opens a stream/writes). New procedures `broker:ctraderListAccounts`/`ctraderSelectAccount`/`ctraderTestConnection` across all 8 typed-chain sites (broker.ts, procedures.ts interface+names, preload, ipc.ts type+wrapper, **transport-electron dispatch map**; web transport-http needs none — broker falls to its `default → NOT_IMPLEMENTED`). UI: an Account `<Select>` + "Test connection" button in `CtraderPanel` (Settings → Integrations). No new test (repo convention: `services/broker/index.ts` orchestration isn't unit-tested — it imports Electron shell/tls/net; the pure `fetchTradingAccounts` is already covered by `ctrader-oauth.test.ts`; `ctrader-readonly.test.ts` guard unaffected — no order-execution vocabulary added). Remaining cTrader P0s still open: a Cairn-owned Spotware OAuth app (P0.4, needs Akash + Spotware).

**P0.3 (historical backfill) — code-complete, five desktop gates GREEN (2026-07-10); live semantics pending P0.2 QA.** cTrader: new read-only `OA_DEAL_LIST_REQ/RES` (2133/2134) in `messages.ts` + codec allowlists; pure `ctrader/backfill.ts` (`planDealListWindows` ≤1-week chunks + `dealsToBrokerEvents` reconstructing opens/scale-outs/closes from bare deals, incl. pre-window opens via `closePositionDetail`); adapter fires deal-list after symbols, pages on `hasMore`, fans reconstructed events through the existing accumulator+ingest (no new persistence — converges with live via `external_ref`); 90-day lookback wired in `index.ts`; `ctrader-readonly.test.ts` `ALLOWED_SEND` extended (read query, not an order write). MT5: `CairnBridge.mq5` replays `InpBackfillDays` (default 90) of closed history on attach, grouping by position with cumulative-volume partial/close labeling (can't reuse `HandleDeal` — its check reads the now-gone live position). Tests: `ctrader-backfill.test.ts` (8 pure cases) + a convergence case in `ctrader-ingest.test.ts` (deal-list backfill → live close = one row). The pure logic is verified; Spotware/MT5 deal semantics + the uncompilable `.mq5` are validated at live QA (P0.2). Remaining P0 code item: P0.7 (MT5 on-chart pre-trade gate).

**P0.7 (MT5 on-chart pre-trade gate) — user chose "build the whole epic now"; delivering in 4 slices. Slice 1 (backend) DONE, five desktop gates GREEN (2026-07-10).** Migration `0018_pre_trade_gate` (`pre_trade_plans` table + `trades.gate_outcome` column) — the trades-column add triggered the migration-list drift fanout, so `0018` was appended to all 19 hardcoded test-DB lists + `migrations.test` (settings 8→10). Pure/tested logic in `electron/services/pre-trade-gate/`: `matcher.ts` (plan↔fill match: price-tolerance, newest-wins, compliant-over-breach), `plan-store.ts` (create compliant/breach-ack plans, list/expire, gate config from settings `pre_trade_match_window_ms`/`pre_trade_price_tolerance_pips`), `gate-outcome.ts` (`applyGateOutcome` → clean/breach_ack, forces `is_clean=0` on breach so a breach is never clean regardless of P&L; `markSilentBreach` for Slice 2). Entitlement: `pre_trade_gate` added to server `plans.ts` FEATURES + desktop-local `canUsePreTradeGate(entitlement)` (offline-first). Tests: `matcher.test.ts` (9) + `gate-outcome.test.ts` (journal-driven DB). `tradeRowSchema` is `.passthrough()` so the new column needs no sync change; `pre_trade_plans` is intentionally NOT syncable. **Slice 1 deliberately did NOT touch ingest.ts** — live fill→gate wiring lands in Slice 2 (bridge). Remaining P0.7 slices: 2 = bidirectional loopback bridge (gate.intent/levels + Cairn→EA gate.show/drawLines) + ingest hook; 3 = MQL5 EA chart UI (buttons, draggable SL/TP, readout); 4 = frameless overlay window (reuse PreTradePanel) + Confirm/Breach. Slices 3-4 + live matching verified at P0.2 QA.

**P0.7 Slice 2 (live ingest hook) — DONE, five desktop gates GREEN (2026-07-10).** `electron/services/pre-trade-gate/gate-hook.ts` `maybeApplyGateForFill(db, event)` is called from both broker `onEvent` handlers (`services/broker/index.ts`, mt5 + ctrader) after `ingest.apply`, best-effort (try/catch + log). On a `position_opened` fill it looks up the just-persisted trade by `external_ref` and runs `applyGateOutcome`. Safe by construction: no-op unless a PENDING plan matches, so backfill/historical/free-user fills are untouched (entitlement enforced upstream at plan creation). +3 hook tests in `gate-outcome.test.ts`. **Scope note: the bidirectional frame protocol (gate.intent/gate.levels inbound + gate.show/gate.drawLines outbound) was folded into Slice 3 (the EA), where it's testable with its counterpart.** Remaining: Slice 3 = MQL5 EA chart UI + frame protocol (blind, P0.2 QA); Slice 4 = frameless overlay window + entitlement-gated Confirm/Breach IPC.

**P0.7 Slice 3 (frame protocol + adapter + MQL5 EA) — DONE, five desktop gates GREEN (2026-07-10).** `mt5/frame.ts`: `gate.intent`/`gate.levels` inbound schemas + single-parse `decodeMt5Inbound` returning a `{event}|{gate}` union (`decodeMt5Frame` kept as back-compat wrapper) + `encodeGateCommand` for token-auth Cairn→EA `gate.show`/`gate.drawLines`. `mt5/listener.ts`: routes gate signals to `onGateSignal`, adds `send()` writing to the live EA socket. `mt5/adapter.ts`: `Mt5Adapter` extends `LiveBrokerAdapter` with `sendGateCommand` + `onGateSignal` option. `CairnBridge.mq5`: Cairn Buy/Sell `OBJ_BUTTON`s, draggable SL/TP `OBJ_HLINE`s (throttled `gate.levels` via `GetTickCount`), live readout `OBJ_LABEL`, inbound `gate.drawLines` render (hand-parsed), `OnChartEvent` + `ReadInbound` in `OnTimer` + `OnDeinit` cleanup. Read-only preserved (`mt5-ea-readonly` green — no `.Buy(`/`.Sell(`/OrderSend). +6 gate-signal frame tests. **MQL5 correctness verified at P0.2 live QA (uncompilable here).** Last piece: Slice 4 = frameless overlay window + gate controller (wire `adapter.onGateSignal` → open overlay + `sendGateCommand(drawLines)`) + entitlement-gated `gate:confirmPlan`/`gate:breachRules` IPC.

**P0.7 Slice 4 (frameless overlay + gate controller + IPC) — DONE, five desktop gates GREEN (2026-07-11); P0.7 COMPLETE.** Main-process `electron/services/pre-trade-gate/gate-controller.ts`: opens a frameless, always-on-top `BrowserWindow` loaded at `#gate-overlay`, `resolveContext()` maps the EA's broker (account, symbol) → Cairn (accountId, pairId) via `broker_account_map` + `pairs`, streams `gate:intent`/`gate:levels` to the overlay over the existing `cairn:event` bus, and exposes entitlement-gated `gateConfirmPlan`/`gateBreachRules` (→ Slice-1 `createCompliantPlan`/`createBreachAckIntent`, then hides the overlay) + `gateDismiss`; `setGateEaSender` receives `adapter.sendGateCommand` after connect. `electron/ipc/gate.ts`: `gate:status`/`getIntent`/`confirmPlan`/`breachRules`/`dismiss`, Zod-validated. Renderer `src/features/pre-trade-gate/GateOverlay.tsx`: subscribes via `window.api.events.on('gate:intent'|'gate:levels')`, loads pair + account metadata, computes live lot/RR/risk (float display, integer-tick encoding on confirm), confluence checklist + risk % + invalidation, Confirm/Breach/dismiss; `src/main.tsx` routes `#gate-overlay` → `<GateOverlay/>` at the mount root (keeps `App`'s hooks unconditional). All 5 gate procedures threaded through the full typed chain (procedures → preload → ipc.ts → **transport-electron dispatch map**; web `transport-http` falls to `default → NOT_IMPLEMENTED`). Gates: typecheck ✓, lint ✓, test:unit ✓ (115 files / 1126 tests), build ✓, e2e ✓. **Lint trap that bit this slice:** import/order wants `@cairn/shared-types` + relative type imports ordered before other externals (alphabetical, `@` first, `../../` before `../`) — hit `gate.ts` + `gate-controller.ts`. Remaining P0.7 work is external only: Slices 3–4 MQL5/overlay live behaviour verified at P0.2 QA (uncompilable/unrunnable here); needs a pre-compiled `CairnBridge.ex5` (P0.1) + Spotware OAuth app (P0.4) for a real live session.

### Connectivity P0s + security hardening (2026-07-10, committed on `feat/rules-engine`)

Closed both broker-connectivity P0s from the 2026-07-10 full review (scores: product 7.5 / code 9 / security 7.5) — brokers now connect on a **stock installed build**, not only from source — and hardened four security findings.

**MT5 one-click EA install** (commit `ab7be8c`): the EA is now bundled into the installer — `electron-builder.yml` `extraResources` ships `resources/mt5-bridge` (previously only `ctrader-proto`), so installed builds no longer lack the EA the Settings panel told users to copy. Settings → Integrations → MT5 gained a one-click **Install Cairn EA** button (+ per-folder **Open**) that copies `CairnBridge.mq5` (and `.ex5` when a build ships one) into every detected `MQL5/Experts` folder. New `services/broker/mt5/installer.ts` (`installMt5Ea` / `revealMt5ExpertsFolder`, both allow-listed to `findMt5ExpertsPaths()` — no arbitrary write/open sink); IPC `broker:installMt5Ea` / `broker:revealMt5Experts` wired through the full typed chain (procedures → dispatch → window.api → preload → ipc); test `tests/unit/broker/mt5-installer.test.ts` (9 cases). `resources/mt5-bridge/INSTALL.md` + `docs/broker-integration.md §2.1` updated.

**cTrader credential-paste UI** (commit `feat(broker): cTrader credential-paste UI …`): OAuth *application* credentials are resolved keychain-first with an env-var fallback, so an install with no env vars can connect. New `services/broker/ctrader/app-credentials.ts` (`resolveCtraderAppCredentials` / `isCtraderAppConfiguredAsync` / store / read / clear, keytar-backed with a test seam); the three credential defs moved out of `ctrader/config.ts`; `index.ts` resolves creds async at 4 call sites + adds `saveCtraderAppCredentials` / `forgetCtraderAppCredentials`; IPC `broker:setCtraderCredentials` / `broker:clearCtraderCredentials`; a client-id + password-secret paste form + "Clear credentials" affordance in `CtraderPanel`; test `tests/unit/broker/ctrader-app-credentials.test.ts` (11 cases, incl. keychain-over-env precedence). `docs/broker-integration.md §2.2` updated.

**Security hardening** (commit `fix(security): lock down navigation, openExternal scheme, and IPC path sinks`): `main.ts` now denies `will-navigate` to non-app origins and only hands `https:`/`mailto:` to `shell.openExternal`; `paths:openFile` is confined to `app.getPath('userData')` (its only caller opens screenshots there); `trades:addScreenshot` validates `tradeId` (UUID) / `kind` (charset) / extension (allow-list) + destination containment (closes a path-traversal write). **Deferred** (need runtime/e2e verification, not done): strict renderer CSP (blocked by the inline theme script in `index.html` — externalise it first), `sandbox:true`, `settings:set` key allow-list, keytar→safeStorage.

**Gates (host, 2026-07-10):** desktop `typecheck` / `lint` / `test:unit` (**111 files, 1086 tests**) / `build` / `test:e2e` all GREEN; prettier clean; pre-commit + commitlint green on both commits. Backend gates (postgres / `@cairn/server` / docs-smoke) remain RED from the known WinNAT port-exclusion env issue (host-env, not these changes); backend deferred.

### Design round — Nvexis "The Almanac" (2026-07-10, working tree)

Full re-skin from the v2.1 Neon Cockpit HUD to the **Nvexis "The Almanac"** brand bible
(`DESIGN-GUIDELINES.md`, spec `docs/design-system.md § v3.0`): oxblood on parchment,
Fraunces/Spectral/IBM Plex Mono, flat paper (no neon/glass/gradient/glow/blur), **Day
(parchment) default + Night (ink)** available; app name stays **Cairn**. Rewrote
`globals.css` (v3.0 tokens; HUD utility class names kept but neutralised to flat paper),
`tailwind.config.ts` (fonts + 2px/4px radii + flattened shadows), `index.html` (default
`data-theme=light`); added `@fontsource-variable/fraunces`, `@fontsource/spectral`,
`@fontsource/ibm-plex-mono` to `apps/desktop/package.json`. Swept the inline neon the tokens
couldn't reach (Shell orbs, Sidebar/TopBar/CommandPalette/Dashboard glass+glow, `bg-white/[x]`
overlays → `hsl(var(--ink)/x)`, `shadow-[0_0_…]` glows stripped app-wide); recoloured CairnLogo,
DisciplineRing fonts, pie/heatmap palettes, default swatches. **Responsive fix:** shared `Modal`
now caps to `max-h-[calc(100vh-2rem)]` and scrolls its body (fixes top/bottom clipping the taller
serif exposed); OnboardingCard made scroll-safe. **Verification:** confirmed via `dev`/HMR in the
running app (Day + Night). **Host gates (typecheck/lint/build/tests) NOT yet run for this round —
requires `pnpm install` on host first** (fonts). Not yet committed.

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
- **Verification — RUN ON THE WINDOWS HOST 2026-06-11, ALL GREEN.** Both the five desktop/shared repo gates and the full server suite were run on the real Windows host (transcript: `gate-logs/gates-20260611-070632.log`, driven by `run-host-gates.ps1` at the repo root):

  | Gate | Result (2026-06-11) |
  |---|---|
  | `pnpm typecheck` | clean |
  | `pnpm lint` (`--max-warnings 0`) | clean |
  | `pnpm test:unit` | 102 files passed |
  | `pnpm build` | success |
  | `pnpm test:e2e` (smoke) | passed |
  | Server suite (`pnpm --filter @cairn/server run test`, real Docker-Compose Postgres) | 7 files / **96 tests passed** — auth · vault · billing · webhook integration + the 6 DB-free docs tests |
  | Docs routes smoke | `GET /openapi.json` 200 (OpenAPI **3.1.0**); `GET /docs` 200 (Scalar, relaxed CSP); `GET /docs/standalone.js` 200; strict CSP confirmed on `/health`; all three doc routes **404** when `ENABLE_API_DOCS=false` |

  Two real defects were found and fixed during this host run (not test-harness papering-over): (1) the pure-ESM workspace packages `@cairn/{shared-types,shared-zod,billing-types,sync-protocol}` were missing `"type": "module"`, so `tsx` loaded them as CommonJS and the server's runtime `import { ERROR_CODES } from '@cairn/shared-types'` failed (`export *` re-exports are invisible to Node's CJS named-export lexer) — `pnpm --filter @cairn/server start` was broken on the host independent of any harness; adding `"type": "module"` to all four fixes it (verified by reproduction). (2) Host-side test DB connectivity: a local PostgreSQL owns `127.0.0.1:5432` and shadows the published container for loopback connections, so the runbook now discovers and proves a working host port at runtime (5433 this run). The earlier sandbox-only note (repo `node_modules` are Windows symlinks the Linux sandbox can't resolve) is superseded by this host run.

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

---

## Wave 4 - Live broker integration (built on branch `feat/vault-enrollment-server`, uncommitted)

The Wave 4 surfaces (MT5 loopback EA->socket bridge, cTrader Open API adapter, live detection, configurable auto-log) are present in the working tree but **not yet committed** - so this section cites no commit hashes; fill them in at commit time. Binding spec: `docs/broker-integration.md`. End-state: `docs/roadmap-v1.2.md` 6.1 (#30-#36).

**This cycle - reconciliation rule (6) + sync-gap (7) closed, with tests.** Two end-state items are done and green:

- **#35 Dedupe + conflict rule (statement <-> live), round-tripped in tests.** Both sources resolve to one row via `external_ref = brokerTradeId`. The conflict rule is now *realised*, not just documented: a statement that lands on a still-live row **reconciles** it (`commitWithReconcile` / `reconcileSettledTrade` in `_shared/committer.ts`) - the settled statement wins the monetary columns (`STATEMENT_MONETARY_FIELDS` = `pnl_cents`, `pnl_pct_bps`, `pnl_r`); the live stream keeps intra-trade timing, SL/TP modification history, its partials, and the trader's honesty/reflection. A row is "settled" iff `imported_at` is non-null (statements stamp it; live capture leaves it null - committer `settledImport` flag). The live ingest's conflict update drops the monetary columns once a row is settled, so a replayed fill cannot clobber settled money back to its price-derived $0. The commit path routes new->insert / live->reconcile / settled->skip via `findExistingTrades` + `partitionCandidates`; `ImportCommitResult.reconciled` surfaces the count in the Import UI.
- **#36 (2nd clause) Streamed fills sync via `enqueueSyncOp`.** The live ingest now enqueues the persisted trade + its partials after each applied event, and the importer write path (`commitCandidates`) enqueues too - this closes the documented import-adapter sync-gap follow-up. The server still only ever sees ciphertext; no-op until the device is enrolled.
- **#36 (1st clause) No order-execution path** - already enforced by `tests/unit/broker/mt5-ea-readonly.test.ts` + `ctrader-readonly.test.ts`.

**Tests added:** `tests/integration/broker-ingest.test.ts` - settle-from-statement (statement wins money, live keeps timing, no duplicate partial), replay-after-settlement (settled money survives), idempotent re-import (skip not re-reconcile), and a sync-enqueue assertion (streamed trade + partials queued). Desktop gates green: typecheck, lint 0, full vitest, build (smoke E2E unchanged from the Stage-18.6 run).

**Remaining production seams before live end-to-end (NOT closed by this cycle):**
- **Account mapping.** `services/broker/index.ts` `resolveAccount()` still returns `null` (no Settings -> Integrations account-map UI), so a real MT5/cTrader fill surfaces `UNKNOWN_ACCOUNT` and creates no row yet. The reconciliation/sync logic above is verified at the service level (ingest + committer), independent of this seam.
- **cTrader protobuf codec.** `services/broker/ctrader/connection.ts` `loadProtobufCodec()` returns `null`, so cTrader links via OAuth but does not stream until the codec is vendored.

Until those two land, the **manual MT5/cTrader end-to-end QA** in `docs/broker-integration.md` 10 cannot be exercised on a live terminal; the automated round-trip test above covers the import-after-live no-duplicate path in its place.

---

## v0.1.1 packaged-migrations hotfix — verified 2026-06-11

**Hotfix commit:** `d53be8d` (2026-06-03) — two fix sites:
1. `apps/desktop/electron/db/index.ts`: packaged branch of `migrationsFolder` now points at `join(process.resourcesPath, 'app.asar', 'electron', 'db', 'migrations')`.
2. `apps/desktop/electron-builder.yml`: `files` array includes `electron/db/**/*` so migrations are packed into the asar.

**Repackage:** `apps/desktop/dist/Cairn Setup 0.1.0.exe` (100.6 MB) built **2026-06-07** — confirmed post-hotfix by `builder-debug.yml` timestamp (Jun 7 16:04 UTC > hotfix commit Jun 3 07:31 UTC).

**Asar verification (2026-06-07 build):** `npx asar list dist/win-unpacked/resources/app.asar` confirmed all 14 SQL files (`0001_initial.sql` → `0014_live_detection_outcome.sql`) and `meta/_journal.json` present at `/electron/db/migrations/` inside the asar.

**Clean-install verification (2026-06-11):** NSIS installer launched on the development machine. App opened to the onboarding screen ("Trade the plan, not the emotion.") with no crash and no `Can't find meta/_journal.json` error. The packaged migration path is operative.

**Current installed version:** 0.1.0

---

## Stage 7 — release pipeline & launch checklist (in progress, uncommitted)

**Prompt:** CLAUDE.md §18.9 Prompt C / `prompts.md` §1915-1922 (release pipeline).

**Built this cycle:**
- `apps/desktop/electron-builder.yml` — Windows `signtoolOptions` (publisher name +
  RFC 3161 timestamp server), macOS `hardenedRuntime` + `gatekeeperAssess: false` +
  entitlements, Linux AppImage metadata, and a `publish: { provider: github,
  releaseType: draft }` block. Signing is wired but inert until certificates exist
  (no `.pfx`/Apple secrets configured yet) — unsigned builds still produce normally.
- `apps/desktop/build/entitlements.mac.plist` — hardened-runtime entitlements for
  Electron's JIT plus `disable-library-validation` (required for the prebuilt
  `better-sqlite3`/`keytar` native modules) and `network.client` (sync/billing/cTrader
  HTTPS).
- `apps/desktop/electron/main.ts` — Linux sandbox is disabled only when
  `process.env.APPIMAGE` is set, fixing the AppImage sandbox warning without weakening
  Windows/macOS or non-AppImage Linux packages.
- `.github/workflows/release.yml` — new tag-triggered (`v*.*.*`) workflow: builds
  win/mac/linux via `electron-builder --publish always` to a draft GitHub Release,
  then generates and uploads a per-platform `checksums-<platform>.txt` (SHA-256).
  Windows EV-cert install step is a documented, commented placeholder for SSL.com
  eSignerCKA or Azure Trusted Signing (procurement is Akash's offline task).
- `docs/runbook.md` §7 — new section: Windows EV cert procurement (cloud-HSM signing,
  since file-based EV certs were discontinued June 2023), macOS notarization secrets,
  the required GitHub secrets table, and the cut-a-release procedure (manual draft
  review/publish — the workflow never auto-publishes).
- `docs/launch-checklist.md` — new doc: 30-item legal/product/tech/comms launch gate
  plus the soft-launch plan (≈50-trader invite list, 14-day stability window, daily
  standup-with-myself log template, and the public-launch trigger condition: <0.1%
  5xx rate and zero open P1s over the window, per `docs/runbook.md` §1 severity scale).

**Not yet done:** no signing/notarization secrets exist yet, so `release.yml` has not
been exercised on a real tag (would currently produce unsigned artifacts). Five gates
not re-run for this change (no application code paths touched — config/docs/workflow
only).

## Functional round + Neon HUD (2026-07-09) — COMMITTED `c87d209` on `feat/rules-engine`

This round's work (previously uncommitted across the parallel-agent build) was verified and committed on **2026-07-10** as **`c87d209`** (156 files, +12837 −728), and the installer `Cairn Setup 0.2.0.exe` was rebuilt.

**Feature work landed:**
- **Per-phase prop-firm accounts** — migration 0016 `account_phases` (+per-account backfill), `accounts:advancePhase` / `accounts:updatePhases` IPC, per-phase onboarding (shared `PhaseRulesFields`), AccountsPage per-phase edit/advance/add-remove, `'funded'`→`'passed'` fix. Denormalization contract: the single account columns mirror the ACTIVE phase, so the rules engine keeps reading the account row unchanged.
- **Draft-trade lifecycle fixes (D1–D8)** — drafts (status `planned`) excluded from daily-trade limit / dup-guard / dashboard count; Save-draft in fast mode; `trades:setOpen` re-runs the full rules gate on activation and re-links the draft to today's session; `openedAt` exposed.
- **Advanced metrics** — `electron/services/analytics/advanced-metrics.ts` (decimal.js: Sharpe, Sortino, max drawdown, recovery factor, Kelly, SQN, day-consistency, hold times) on the Dashboard grid + Metrics tab via shared `advanced-metrics-display.ts`.
- **Guardrail hardening** — `guardrail.ts` sink + `guardrail.degraded` event + `GuardrailBanner`; migration 0017 `daily_locks` (persisted circuit-breaker lock that works with no `sessions` row — the honesty boundary §2.3 forbids fabricating a bias just to hold a lock); hard-lock rules fail CLOSED on invalid config; broker `resolveAccount` falls back to a system "Unclassified" setup; `broker:diagnostics` IPC + Connection-health card.
- **Neon Cockpit HUD v2.1** — `docs/design-system.md` v2.1 section, CLAUDE.md §14 #10 amendment (glassmorphism override → neon cockpit HUD), dev gallery, consistency fixes.

**Gate-fix pass (2026-07-10) — the parallel-agent edits left the gates red; fixed here (part of `c87d209`):**
- **Test-DB migration lists lagged the journal (the "0003-omission class").** `0017_daily_locks.sql` was correctly listed in `meta/_journal.json` (production applies it), but several tests build their sql.js DB from *hardcoded* migration arrays that stopped at 0016 (analytics `_fixtures.ts` was even further behind, at 0013), so `daily_locks` never existed in those DBs → `no such table: daily_locks` in `draft-activation`, `performance`, and a mismatch in the `migrations.test` guard. Fixed by adding `0017_daily_locks` to `draft-activation.test.ts`, `tests/unit/analytics/_fixtures.ts`, and the `migrations.test.ts` expected array. **Known debt:** ~13 other test files carry the same hardcoded lists but pass today (they never query `daily_locks`) — the durable fix is a shared journal-driven test-DB helper (like `migrations.test`'s `orderedTags()`) instead of copies, so this omission class can't recur.
- **Typecheck (3)** — `accounts.ts`: `denormFromPhase` return type `Partial<insert>` → concrete `Pick<...>` (so `dailyDrawdownType` reads as required at the insert), and its optional params widened to accept `undefined` under `exactOptionalPropertyTypes`. `context-builder.ts`: the raw `schema.accounts` row lacks the new `phases` field, and the rules engine only reads the denormalized columns, so it casts the row (`account as unknown as Account`).
- **Lint (4)** — import order (`trades.ts`, `GuardrailBanner.tsx`), `consistent-return` (`PhaseRulesFields.tsx`), unused var (`advanced-metrics.test.ts`).
- **Prettier** — `prettier --write` across the previously-unformatted tree (the bulk of the 156-file commit).

**Five desktop gates — GREEN on the Windows host (`run-host-gates.ps1`, 2026-07-10):**

| Gate | Status |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` (`--max-warnings 0`) | PASS |
| `pnpm test:unit` | PASS (108/109 files; the Electron-dependent `ctrader-oauth` suite needed the host fix below) |
| `pnpm build` | PASS |
| `pnpm test:e2e` (smoke) | PASS |

**Backend gates still RED — environment, not code.** `postgres up + host-side reachable`, `@cairn/server run test` (7 suites, all `ECONNREFUSED …:15432`), and `docs routes smoke` fail because Windows WinNAT/Hyper-V reserves every candidate Postgres port (all `OS-excluded`), so Docker can't bind. Fix from an **elevated** shell: `net stop winnat; netsh int ipv4 set dynamicport tcp start=49152 num=16384; net start winnat`, then restart Docker Desktop. These are the deferred v2.0 backend (server go-live intentionally deferred).

**Host-environment gotchas hit this round (documented so they don't recur):**
- **Electron binary install.** After a fresh `pnpm install`, `test:unit` (`ctrader-oauth`) + `test:e2e` fail with "Electron failed to install correctly". NOT the skip flag (`ELECTRON_SKIP_BINARY_DOWNLOAD` confirmed unset in env / npm / pnpm / `~/.npmrc`). Root cause (via `$env:DEBUG="@electron/get:*"`): `@electron/get` downloads + caches the zip fine, but electron's `install.js` silently does not extract it, so `node_modules/electron/path.txt` and `dist/` are never written. A pre-existing corrupt cached zip also causes a false "Cache hit". **Fix:** purge `%LOCALAPPDATA%\electron\Cache`, `pnpm install` (recreates the symlink), `node .\node_modules\electron\install.js` (re-downloads), then manually `tar -xf <cached zip> -C <pkg>\dist` and `Set-Content <pkg>\path.txt "electron.exe"`. Electron pinned at 33.4.11.

**Installer:** `apps/desktop/dist/Cairn Setup 0.2.0.exe` rebuilt 2026-07-10 (unsigned — signing inert until certs exist; SmartScreen "unrecognized app" is expected).

**Next:** MT5 on-chart pre-trade gate (`plan.md`). Open follow-ups: web `/auth/me` session-restore fix, broader E2E journeys, first-run demo mode, web read-only dashboard, release-workflow dry-run tag, and the shared journal-driven test-DB helper noted above.

---

## Neon HUD redesign (2026-07-09)

User-approved override of locked decision #10 (glassmorphism → **Neon Cockpit HUD**), recorded
in CLAUDE.md §14 #10 and `docs/design-system.md` § "v2.1 Neon Cockpit HUD (2026-07-09)". This is
a **visual-language retoken + hero-surface pass only** — no functional/logic changes, no new
dependencies (Tailwind + Framer Motion + CSS), no `electron/`, IPC, schema, service, or test files
touched. All test-asserted UI strings were preserved (verified against `tests/e2e/smoke.spec.ts`,
incl. onboarding copy such as "Trade the plan, not the emotion." and "You're set up.").

**What changed:**

- **Token layer (`src/styles/globals.css`):** both themes redefined — dark "deep-space cockpit"
  (`#05070E` base) and light "daylight cockpit" (`#F4F7FC`). Token *names* kept, so the whole app
  re-skinned through the layer. New HUD utilities added: `hud-grid`, `hud-corners`,
  `crown-*`, `card-glow-*`, `text-glow-*`, `text-gradient-*`, `aurora-ribbon`/`aurora-mist`,
  `trail-line`/`waypoint-active`, `summit-halo`, `prismatic-edge`. `tailwind.config.ts` glow
  shadows + `glow-pulse`/`dot-pulse`/`shimmer` keyframes. Reduced-motion contract preserved
  (`main.tsx` `MotionGlobalConfig.skipAnimations` + CSS `prefers-reduced-motion` block).
- **Hero surfaces:** Sidebar, TopBar, Shell (aurora + grid + nebula backdrop), DashboardPage +
  DisciplineRing (neon glow filter, count-up, arc sweep, summit halo), PreTradePanel (rule check
  as a pre-flight checklist), Onboarding (cockpit backdrop + segmented HUD progress + "Cockpit
  ready" finish), shared Modal / toast / GuardrailBanner (glow border by severity), StatCard /
  GlassCard / button / badge (token-driven), charts (`chart-theme.ts` → neon tokens).
- **This session's additions on top of the above:** docs (this entry + `design-system.md` v2.1
  section + CLAUDE.md #10 amendment); `features/dev/ComponentsPage.tsx` gained a "Neon Cockpit
  HUD" showcase section (GlassCard crown/glow/hero, `hud-corners`, text-glow/gradient, a pre-flight
  rule-check sample, and the Discipline Ring) for eyeballing the language; `features/sync/
  ConflictResolver.tsx` badge given a severity glow and its invalid `text-text-tertiary` classes
  (no such token exists) corrected to `text-text-muted`.

**Gates:** not re-run in this doc/gallery session (typecheck/lint/build unable to run here);
changes are style-only and were self-reviewed for TS-strict + `import/order` + `--max-warnings 0`
compliance. Re-run the five gates before packaging the next installer.

---

## Functional round — bugs, phases, drafts, metrics, guardrails (2026-07-09, uncommitted)

Five parallel workstreams landed in the working tree on top of the Neon HUD retoken. All are
**pending the five host gates** (the review sandbox cannot execute them; run `run-host-gates.ps1`)
and a fresh installer build.

1. **Per-phase prop-firm accounts** — migration `0016_account_phases.sql` (+ backfill,
   idempotent) and `account_phases` table; accounts' single columns remain the ACTIVE phase's
   effective values (rules engine untouched); new `accounts:advancePhase` / `accounts:updatePhases`
   IPC (transactional, sync-enqueued, registered end-to-end); onboarding `StepTemplate`/
   `StepAccount` collect every phase via shared `src/components/shared/PhaseRulesFields.tsx`;
   AccountsPage create/edit modals do per-phase editing, phase advance (mentor-voice confirm),
   add/remove phase (min 1), functional chevron, trimmed delete-confirm; TemplatesTab numeric
   editing; leverage max aligned to 3000 on create+update; `analytics/phases.ts` + AccountsPhasesTab
   `'funded'`→`'passed'` fix. Tests: `tests/integration/account-phases.test.ts` (16),
   migration-0016 cases in `migrations.test.ts`, pass-rate case in `phases.test.ts`.
2. **Draft-trade lifecycle (defects D1–D8)** — drafts (`status='planned'`) no longer count
   against `max_trades_per_day` or dashboard today-count; Save draft renders in fast mode;
   `trades:setOpen` now re-runs the full pre-trade rules gate (blocking failures →
   `RULES_BLOCKED`, violations recorded, trade stays planned) and re-links stale drafts to
   TODAY's session before locking; duplicate-trade guard ignores planned rows; `openedAt`
   mapped onto the Trade DTO + "Activated" row in TradeDetailModal; dashboard draft activation
   surfaces errors (toast) and refreshes. Tests: `tests/integration/draft-activation.test.ts`
   + updated max-trades-per-day / context-builder cases.
3. **Advanced metrics** — pure `electron/services/analytics/advanced-metrics.ts` (decimal.js:
   Sharpe √252 daily, Sortino, max drawdown $/bps/duration, recovery factor, Kelly bps clamped,
   SQN, day-consistency bps, extremes, stddev R, avg hold winners/losers) with
   `{ value, sufficient }` contract; wired into `dashboard:getStats` (last-200 cap) and
   `analytics:derived` (uncapped); rendered via shared `src/lib/advanced-metrics-display.ts`
   on the Dashboard "Performance Metrics" grid and the Metrics tab "Advanced Metrics" panel.
   Tests: `tests/unit/analytics/advanced-metrics.test.ts` (42 cases incl. fast-check
   scale-invariance / non-negativity / clamp properties).
4. **Guardrail hardening** — `rules-engine/guardrail.ts` sink (`parseRuleConfig`) replaces every
   silent `catch {}` around rule-config JSON (engine, close-detection, live-detection); main
   process logs + broadcasts `guardrail.degraded`; `GuardrailBanner` (mounted in App) shows a
   persistent mentor-voice warning. Circuit breaker no longer needs a session row: migration
   `0017_daily_locks.sql` + `daily_locks` table written on breach (`onConflictDoNothing`),
   consulted by context-builder/engine/session-state as a hard lock. Hard-lock rules
   (`daily_stop_after_losses`, `max_overall_daily_loss_hard_stop_pct`) now fail **closed** on
   invalid config (blocking, non-overridable, guardrail-reported) instead of degrading to a
   warning the gate ignores. Broker: `resolveAccount` falls back to a system "Unclassified"
   setup (never drops a mapped fill); cTrader codec failures captured verbatim
   (`getLastCtraderCodecError`); new `broker:diagnostics` IPC + "Connection health" card at the
   top of Settings → Integrations. Tests: setup-resolver, ctrader-codec error capture, engine
   guardrail + no-session circuit-breaker + hard-lock fail-closed cases.
5. **Neon HUD** — see the section above.

**Verification status:** static cross-workstream review done (no duplicate type/procedure
registrations; IPC chains complete for `accounts:advancePhase`, `accounts:updatePhases`,
`broker:diagnostics`; DashboardStats/DerivedStats consumers compile-consistent by inspection).
The five gates + smoke E2E must be run on the Windows host before commit/packaging. Known
follow-ups deliberately NOT in this round: web `/auth/me` session-restore fix, broader E2E
journeys, `trustProxy` deployment guardrail, release-workflow dry-run tag, first-run demo mode,
web read-only dashboard, and the MT5 on-chart pre-trade gate (next round, user-approved).
