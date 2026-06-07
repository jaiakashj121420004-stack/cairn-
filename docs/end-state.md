<!-- Extracted from CLAUDE.md (v2.0). Loaded on demand per CLAUDE.md §0/§4 — not part of the always-in-context root. -->

## 16. END STATE DEFINITION

### 16.a What "v1.1 Done" Means

v1.1 is complete when all v1.0 criteria are met PLUS:

16. Design is glassmorphism — frosted glass cards, depth layers, smooth animations. Text contrast passes WCAG AA in both dark and light modes.
17. Dashboard shows correct discipline score, current account balance, and today's P&L after every trade.
18. P&L calculates correctly in trade log, dashboard, and analytics using actual exit price, lot size, leverage, and pip value.
19. Trade entry panel includes risk calculator: user inputs risk $ or risk %, lot size auto-calculates from account size, leverage, entry, and SL.
20. Leverage is configurable per account in Settings and used in all calculations.
21. Draft trades can be re-opened and activated (placed) from the trade log.
22. Partial close is available when closing a trade — user can close X% of position and leave remainder open.
23. Screenshot attachment field exists on trade entry and post-trade review — optional, never blocks submission.
24. Default pairs seed includes: EURUSD, GBPUSD, XAUUSD, XAGUSD, NZDUSD, AUDNZD, GBPJPY, AUDUSD, USDJPY, USDCAD, USDCHF, EURGBP, EURJPY, GBPCAD, GBPAUD, BTCUSD, US30, NAS100, SPX500.
25. Daily trade limit rule is implemented and configurable per account.
26. Max daily loss circuit breaker is implemented and configurable per account.
27. R-target alerts (configurable levels, e.g. 1R, 2R) provide a visual indicator on open trades.
28. Trade duration shows correct elapsed time from entry time to exit time.
29. Win streak and loss streak are displayed on the dashboard.
30. PDF export of trade review is available from the Review section.
31. Keyboard shortcuts are implemented for core actions (configurable, documented in Settings).
32. Timezone defaults to America/New_York and is user-configurable in Settings.

### 16.b What "v2.0 Done" Means

v2.0 is complete when all v1.1 criteria are met PLUS:

33. Engineering quality baseline (§19) is enforced: TypeScript strict everywhere, ESLint with `@typescript-eslint/strict`, Husky + lint-staged, CI green on `typecheck` + `lint` + `test` + `build`, coverage gate ≥ 80 % on `electron/services/` and `apps/server/src/`.
34. Repo is a pnpm workspace monorepo: `apps/{desktop,web,server}` and `packages/{shared-types,shared-zod,sync-protocol,billing-types}`.
35. Backend API is live on a managed platform with HTTPS, signed by a real CA, behind a load balancer. `/health` returns 200 with build info.
36. Auth flows work end-to-end: signup → email verify → login → refresh rotation → logout. Refresh-reuse detection is verified in a test.
37. Vault sync works end-to-end: two desktop installs of the same account converge to identical local SQLite contents after an online sync. Server logs contain only ciphertext.
38. Recovery phrase flow is implemented: generated at signup, shown once, and verified to recover the vault when the password is lost (tested).
39. Web app is live on Cloudflare Pages or Vercel. A user can log in from a browser, sync their vault, decrypt locally, and see the same data as their desktop.
40. Stripe and Razorpay are both integrated. A test card can complete checkout on each, and the resulting subscription appears in the `subscription` table within 5 seconds of the webhook.
41. Entitlement gating works: a free user attempting to push to `/vault/push` receives 402 with an upgrade payload. A paid user does not.
42. Customer Portal is reachable from in-app Settings → Billing.
43. Trial → active → past_due → canceled flow works for both providers, including grace period (3-day soft, 14-day hard).
44. `docs/threat-model.md`, `docs/asvs-checklist.md`, `docs/security.md`, `docs/sync-protocol.md`, `docs/backend-architecture.md`, `docs/billing.md`, `docs/runbook.md`, and `docs/adr/` exist and are kept current.
45. Code-signed and notarized Windows + macOS desktop builds are produced by the release workflow.
46. Sentry is wired into both server (always-on) and client (opt-in, defaults to off).
47. A daily backup-verification job has restored the latest Postgres backup into a scratch DB and passed migration replay at least three consecutive days.
48. An external pen-test or independent security review has been completed and outstanding findings are tracked or closed.

### 16.c What "v1.2 Done" Means

v1.2 sits between v1.1 and v2.0 and is its own shippable milestone. It is complete when all v1.1 criteria in §16.a are met **and** the v1.2 end-state list in `docs/roadmap-v1.2.md` §6 is met. The headline items are reproduced here for quick reference; the binding list is in the roadmap doc.

**Foundation (Wave 0):**
49. The v1.1 work currently uncommitted on `feat/rules-engine` is committed; `pnpm typecheck && pnpm test` are green on `main`.
50. The Review screen renders real content (not a stub); it is wired as the home for the insight engine and the deferred-reflection queue.
51. The schema has a single, integer-encoded partial-close table; no monetary or pip column is stored as `real`/`float`.
52. `tests/e2e/` contains a smoke E2E covering onboard → log bias → place trade → close trade → analytics. The integration test directory contains real tests, not README placeholders.

**Friction quick-wins (Wave 1):**
53. The New Trade panel remembers last pair/setup/mode within a session; invalidation offers ICT-native quick-chips that satisfy the 20-char gate in one tap; emotional state defaults to a one-tap selector with sliders behind an advanced disclosure; the close modal has a "Closed clean at TP/SL" one-click path; a ⌘K command palette is implemented; a calendar view exists.

**Automations (Wave 2) — DONE 2026-05-31:**
54. ✅ Dashboard updates instantly on every close; analytics includes time-of-day, day-of-week, expectancy, profit factor, and R-multiple distribution; the Review screen surfaces at least five local-heuristic insights; the close modal pre-ticks rules-broken from planned-vs-actual comparison; a composite performance score sits alongside the Discipline Score; per-trade A–F quality grade appears on the trade detail and trade log; the Notebook is available with at least three templates. (commits `14d8ced` · `f13cabd` · `4ac1913` · `eac6e9e` · `ce30ab7` · `bc3808b` · `eb7e52c`)

**Import + two-phase logging (Wave 3) — DONE 2026-06-01:**
55. ✅ MT5, cTrader and TradingView statement/CSV imports land trades into the local DB with no manual entry, round-tripped through tests (items 18–20, commits `0505913` · `b35172e` · `4069b56` · `0d42e6e`). MAE/MFE auto-computes from price series via shared committer; current statement formats carry no OHLC series so it stays null in practice (item 21, commit `04a82b6`). Close modal defaults to minimal fast-path (exit + reason only); deferred reflection queue on the Review screen; `completePhase2` clears it (item 22, commit `04a82b6`). Sidebar badge shows N trades awaiting reflection, live-refreshed via eventBus (item 23, commit `04a82b6`). Playbooks in Settings pre-fill the New Trade panel on one tap and from ⌘K (item 24, commit `04a82b6`).

**Quality bars (continuous):**
56. `pnpm typecheck` and `pnpm lint --max-warnings 0` stay green on every PR; coverage on `electron/services/` does not fall below the v1.1 level and rises toward 80%; no new monetary or pip column is added as `real`/`float`; every new IPC handler has a Zod input schema and a typed Result return.

Wave 4 (live broker integration) is **not** part of v1.2 done — it is a separate optional milestone that lands at the v1.3 / v2.0 boundary depending on whether broker work happens before or after the cloud rebuild in §18. Its design is specified in `docs/broker-integration.md`, its build prompts in `prompts.md` §8.7, and its end-state criteria (#30–#36) in `docs/roadmap-v1.2.md` §6.1. Headline: MT5 via a read-only EA→localhost socket bridge + cTrader via the Open API, both normalising to one `BrokerEvent` stream; configurable auto-log (default draft-awaiting-context, toggle for fully-auto, `unreviewed` never counted as clean); real-time non-blocking rule warnings; read-only forever (Cairn never executes a broker order).
