# Cairn v1.2 Roadmap — Friction Reduction & Free Parity

**Scope:** the cycle between v1.1 (now) and the v2.0 cloud/sync/billing rebuild (§18 of `CLAUDE.md`). v1.2 is **local-only, zero new infra cost**, and focused on two outcomes:

1. **Cut bad friction** — the time the app currently takes from a trader before / during / after a trade that is not protecting discipline.
2. **Add the TradeZella-parity features that cost nothing** — calendar view, notebook, playbooks, expanded reports, a local insight engine, file-based import — built on data Cairn already stores locally.

This file is the canonical reference for v1.2. CLAUDE.md links here from §4 (Docs Navigation Map) and lists the bound decisions in §14 and the end-state criteria in §16.c.

---

## 1. Strategic positioning vs TradeZella (decision)

TradeZella's centre of gravity is record-and-analyse: auto-imported trades, 50+ reports, replay, AI, education, all cloud SaaS at $29–49/month. By their own positioning they **do not prevent trades or enforce rules in real time**.

That gap is Cairn's. The v1.2 cycle is shaped by it:

- **Do not chase TradeZella feature-for-feature** on reports, replay, backtesting and education. That is their turf and a long, expensive chase.
- **Double down on real-time, broker-aware prevention** — the rule engine, hard locks, circuit breakers, and (in Wave 4) live broker detection of SL widening / over-trading. This is the moat.
- **Use file-based import as the friction killer, not as a journaling parity play.** When trades flow into Cairn from the broker statement, the rule engine and analytics get more honest data; the trader stops being a data-entry clerk. That is the priority, in that order.
- **Build TradeZella's free-to-replicate features locally** (§3 below) so users do not feel they need TradeZella for journaling breadth.
- **Stay local-first, no-subscription, no-telemetry.** That posture is part of the product, not an implementation detail.

Tagline for v1.2: *the journal that stops the trade before you regret it.*

---

## 2. The friction diagnosis (what we are fixing)

A single complete trade currently costs a trader roughly **3–5 minutes of data entry** inside Cairn, on top of the daily session-bias ritual. Almost all of that is duplicating data the broker already has, because v1 has no broker connection. Breakdown:

| Phase | Time cost | Largest sources |
|---|---|---|
| Daily session bias (once/day) | 2–4 min | Six written reason fields |
| New Trade panel (per trade) | 60–120 s | ~15–20 inputs, manual price entry, 20-char invalidation, three emotion sliders |
| Partial close (per partial) | 30–45 s | Modal mode switch, typed lots/price/notes |
| Close Trade modal (per trade) | 90–180 s | ~12–15 inputs: exit price/time, MAE/MFE, honesty Y/N (+ conditional text), rules-broken checklist, reflection, tags, screenshots |

**Good friction (keep slow):** the rule block, override-acknowledgement, "this trade is wrong if…" — these exist to slow down a *bad* action.

**Bad friction (kill):** everything that slows down a *good* action — re-typing prices the broker already knows, re-selecting the same pair, hand-entering exit times, self-reporting violations the engine already detected, three judgement sliders per trade. v1.2 attacks the bad friction while protecting the good.

---

## 3. Zero-cost feature backlog (free TradeZella parity)

These are addable with no paid data feed, no broker-API connector fees, no cloud servers, no content cost. They run on the local SQLite database Cairn already maintains.

| Feature | What it is | Build approach | Wave |
|---|---|---|---|
| Calendar / heat-map view | Month grid coloured by daily P&L; click-through to that day's trades | Render over existing `trades` table grouped by date | 1 |
| Notebook | Free-form notes, watchlists, plans, templates | New local table + rich-text editor | 1 |
| Playbooks / setup templates | Saved strategy definitions you log trades against and get stats for | Extend `setups` model with preset confluence + risk; group analytics by it | 1 |
| Expanded reports & filters (toward 50+) | Best/worst day, time-of-day, day-of-week, expectancy, profit factor, R-distribution, streaks | More SQL queries; analytics service & filter bar already exist | 2 |
| Composite performance score (Zella-Score style) | 0–100 rating from consistency, win/loss, avg quality | Compute from stored P&L/R; sits alongside Discipline Ring | 2 |
| Trade rating (A–F per trade) | Per-trade quality grade | Derive from RR, plan-followed, rules-broken, R outcome | 2 |
| Mistake / bad-habit tagging stats | Tag recurring errors, see their aggregate cost | Tags + rules-broken already captured; just aggregate | 2 |
| Local "AI" insight engine | "Your win-rate drops when urgency > 7"; tilt-cycle detection | Local statistical heuristics over behavioural data — **no paid LLM/API** | 2 |
| File-based statement import | Bulk-add trades from broker exports | Parse MT5 / cTrader / TradingView HTML/CSV — exports are free | 3 |
| Command palette (⌘K) | Fast jump-to-anything | Pure front-end; the slot already exists in TopBar | 1 |

**Features that genuinely cost money** (defer to Wave 4 or skip):

| Feature | Why it costs | Cheaper alternative |
|---|---|---|
| Live 500+ broker auto-sync | Paid connector/aggregator + maintenance | Start with one direct integration (MT5) in Wave 4 |
| Tick-by-tick trade replay | Licensed historical tick data | Embed free TradingView chart widget jumped to the trade window |
| Backtesting over 10+ yrs data | Same licensed historical data | Manual replay mode using user's TradingView data |
| Mentor mode / Spaces | Cloud hosting + accounts (also against local-first spec) | Encrypted export file a mentor opens locally |
| Education hub | Content production cost | Link out to free ICT resources; skip in-app content |

---

## 4. The five waves

Each wave is independently shippable. The sequence is dependency-driven, not flashiness-driven. Waves 0–3 are entirely free; only Wave 4 spends money.

```
WAVE 0 — Foundation                       ~Wk 1
WAVE 1 — Friction quick-wins (free)       ~Wk 2–4
WAVE 2 — Automations (free)               ~Wk 4–7
WAVE 3 — File import + two-phase logging  ~Wk 7–11
WAVE 4 — Live broker integration (optional) Later
```

Timings are planning estimates for a solo build, not commitments.

### Wave 0 — Foundation (must precede everything else)

- Commit the uncommitted v1.1 work currently on `feat/rules-engine` (~2,600 LOC across 40 files) and get `pnpm typecheck && pnpm test` green.
- **Build the Review screen.** It is the home for Wave 2 insights and Wave 3's deferred-reflection queue. The `reviews` table and `reviews.ts` analytics service already exist; the page is a stub.
- **Reconcile the two partial-close tables** (`trade_partials` integer-encoded vs `partial_closes` float) into a single integer-encoded table. Float storage of money/pips contradicts CLAUDE.md §2.5.
- Remove the stub `electron/services/export-service.ts` (export logic actually lives in `ipc/data.ts`); update any references.
- Add a smoke E2E test in `tests/e2e/` covering: open app → onboard → log bias → place trade → close trade → see in analytics. Replaces the README placeholder.

### Wave 1 — Friction quick-wins (free)

All low-effort, high-relief, no new data. Each shippable independently.

- **Remember last trade context** — default the New Trade panel to last pair/setup/mode for the session.
- **Invalidation quick-chips** — tappable ICT-native chips ("below the OB", "liquidity sweep fails", "closes back inside FVG", "MSS invalidated") satisfy the 20-char honesty requirement in one tap; free text remains available.
- **One-tap emotional state** — single selector (Focused / Neutral / Tilted) that maps to a sensible score triple; the three sliders become an "advanced" disclosure for when the trader wants precision. Captures the signal, kills the ceremony.
- **"Clean trade" one-click close** — if the plan was followed, one button fills the entire honesty section and defaults the exit fields. The long form is reserved for trades that actually deviated — which are the ones worth reflecting on anyway.
- **Command palette (⌘K)** — ship the "coming soon" TopBar quick-search as a real command palette: new trade, close trade, jump to account, log bias, navigate to any settings tab.
- **Calendar view** — month grid coloured by daily P&L on the Dashboard or as a new Analytics tab; click-through to that day's trades.

### Wave 2 — Automations (free)

Now that the data is clean and the Review screen exists, turn on the intelligence. All run locally.

- **Auto dashboard refresh** — Discipline Ring, balance, P&L, streak update instantly on every close (verify v1.1 fix landed; bake it into a single event flow).
- **Derived analytics** — time-of-day, day-of-week, expectancy, profit factor, R-multiple distribution as SQL queries on top of existing `trades`.
- **Local insight engine** — statistical heuristics on the Review screen:
  - "Win rate drops X% when urgency > 7"
  - "Negative expectancy when trading outside listed killzones"
  - "Tilt cycle detected: three consecutive losses followed by an over-risked trade in N of last M weeks"
  - "Setup X is your highest expectancy but you only take it N% of the time"
  - These are deterministic rules over the behavioural data, not an LLM call.
- **Auto-detect rules broken at close** — pre-tick the Close Trade modal's rules-broken checklist by comparing planned-vs-actual; trader confirms or unticks. Honesty preserved (engine proposes, trader confirms); recall friction eliminated.
- **Composite performance score** (Zella-Score style) alongside the existing Discipline Score.
- **Per-trade quality grade** (A–F) derived from RR, plan-followed, rules-broken, R outcome.
- **Notebook** — free-form rich-text notes with templates (trading plans, watchlists, weekly reviews). Local table.

### Wave 3 — File import + two-phase logging (free)

This is where the double-entry friction for closed trades disappears.

- **MT5 statement import** — parse the MT5 HTML/CSV statement export (free; user generates it from the broker terminal). Map order tickets to Cairn trades; auto-populate entry, SL, TP, lots, exit, time, duration, partials.
- **cTrader statement import** — same approach.
- **TradingView CSV import** — for traders using its built-in journal/paper trader.
- **MAE / MFE auto-compute** — derive from the price series in the statement where available.
- **Two-phase logging structural change.** Split the current heavy moment into two ceremonies:

  ```
  PHASE 1 — THE GATE (in the moment, < 20 s)
    Pair · direction · prices · risk · rule check
    One invalidation chip · one emotion tap
    Hard locks still block. Rules still gate.

  PHASE 2 — THE JOURNAL (deferred, batched)
    A "trades awaiting reflection" queue on the Review screen.
    Honesty review · what right/wrong · tags · screenshots · MAE/MFE.
    Done once for all of the session's trades, calmly, after the close.
  ```

  This protects the discipline (the gate stays in the moment, where it must be) while moving the journaling weight to a single calm review at the end of the day — which is also *more* honest because reflection benefits from distance.
- **Reflection queue UI** — a badge on the sidebar showing N trades awaiting reflection; the Review screen surfaces them in a quick keyboard-driven flow.
- **Setup templates / playbooks** — saved per-account templates that pre-fill pair, setup, killzone, required confluence, default risk %, default invalidation chip. One tap loads the scaffold; the trader only types the live prices.

### Wave 4 — Live broker integration (optional)

This is the only wave with real moving parts. Waves 0–3 already removed ~80% of the friction with zero infrastructure, so Wave 4 is sequenced separately and the project stays fully useful even if it never ships. **Binding spec: `docs/broker-integration.md`. Build prompts: `prompts.md` §8.7.**

The shape, locked with the user:

- **MT5 = local Expert Advisor → `127.0.0.1` socket bridge.** A read-only EA inside the MT5 terminal pushes every fill (open / modify / partial / close) to a loopback-only Cairn listener, token-authenticated. Stays entirely on-device — the most local-first option, and instant (so live detection is real-time). Chosen over the Windows-only, poll-based MT5 Python package.
- **cTrader = official Open API** — OAuth 2.0, read-only scopes, streams execution events. Free for any cTrader user. Tokens live in the OS keychain. (Caveat: events transit Spotware's servers — the one non-local path, disclosed in Settings.)
- **One internal `BrokerEvent` stream.** Both transports normalise to a single typed event the ingest service consumes, so the rest of Cairn is transport-agnostic and a third broker later is just another adapter.
- **Configurable auto-log.** Default **draft-awaiting-context** (mechanical fields prefilled; the trade lands in the Wave 3 reflection queue; honesty fields stay `unreviewed`, never defaulted to clean). A Settings toggle enables **fully-auto** (complete record, never queued). Neither mode fabricates honesty data, and neither runs the *pre-trade* gate — auto-log is capture (job #2), not prevention (job #1).
- **Live SL-move / over-trade detection** — the rule engine watches the open position (fed the live `BrokerEvent`s) and raises non-blocking, mentor-voice warnings the instant a planned-vs-actual divergence breaches a rule, recorded as `rule_violations`. The genuine realisation of "prevention over detection" for trades placed outside Cairn — something TradeZella structurally does not do. (Non-blocking because Cairn cannot stop a broker order; it reads, never writes.)
- **Read-only, forever.** No adapter has an order-execution path. Cairn never places, modifies, or closes a broker order — a hard safety boundary, asserted by a test.
- **Dedupe with Wave 3 imports** via `external_ref = brokerTradeId`, so a live-streamed trade and the same trade in a later statement import resolve to one row.
- **TradingView embed for replay** — jump a free TradingView chart widget to the trade's time window. Avoids the licensed tick-data cost of a real replay engine while delivering ~80% of the value. (TradingView itself has no read API for your trades; its fills execute at the connected broker, so capture happens there, not in TradingView.)

---

## 5. Automation deployment schedule (detailed)

Exactly which automations ship, in which wave, and what each one removes.

| # | Automation | What it does | Removes | Depends on | Wave |
|---|---|---|---|---|---|
| 1 | Auto dashboard refresh | Recompute Ring/balance/P&L/streak instantly on every close | Manual refresh, stale numbers | Wave 0 data fix | 2 (~Wk 4) |
| 2 | Derived analytics | Time-of-day, day-of-week, expectancy, profit factor, R-distribution auto-calculated | Any manual stat work | Existing `trades` | 2 (~Wk 5) |
| 3 | Local insight engine | Heuristic patterns surfaced on the Review screen | Guesswork; the analysis TZ charges for | Review screen, behavioural data | 2 (~Wk 6–7) |
| 4 | Auto-detect rules broken at close | Pre-ticks the violations checklist from planned-vs-actual; trader confirms | Self-reporting from memory | Rule engine (exists) | 2 (~Wk 6) |
| 5 | Composite performance score | Zella-Score equivalent, alongside Discipline Score | Manual P&L tracking | Wave 2 derived analytics | 2 (~Wk 7) |
| 6 | Statement / CSV auto-fill | Parse MT5 / cTrader / TradingView export → auto-populate trades | Re-typing every closed-trade number | Import adapter | 3 (~Wk 8–10) |
| 7 | MAE / MFE auto-compute | Derive max excursions from imported price data | Reading the chart by hand | Import (price series) | 3 (~Wk 10) |
| 8 | Deferred-reflection queue | Closed trades land in a "to reflect on" list cleared in one calm batch | Heavy in-the-moment close form | Two-phase split, Review screen | 3 (~Wk 11) |
| 9 | Live SL-move / over-trade detection | Engine watches the live position and warns the instant a rule is breached | Discovering violations only afterwards | Live broker feed | 4 (later) |
| 10 | Live auto-import of fills | Open/close events stream in with no manual entry at all | All remaining manual entry | Live broker feed | 4 (later) |

Sequencing logic: automations are ordered by cost and dependency, not flashiness. Everything in Waves 0–3 is free and ships in roughly the first ~11 weeks. The only paid, infrastructure-heavy automations (live detection & auto-import) are isolated in Wave 4, so the project delivers continuous value and stays usable even if Wave 4 never happens.

---

## 6. v1.2 done — end-state criteria

v1.2 is complete when all v1.1 criteria (CLAUDE.md §16.a) are met, the v1.1 branch is committed and tests green, and the following are true. (CLAUDE.md §16.c references this list.)

**v1.2 Wave 0 — DONE 2026-05-29**

**Foundation (Wave 0)**
1. ✅ The `feat/rules-engine` branch is committed; `pnpm typecheck && pnpm test` are green on `main`.
2. ✅ The Review screen renders (not a stub) and is the home for the insight engine and the deferred-reflection queue.
3. ✅ Schema has one partial-close table, integer-encoded; no monetary or pip column is `real`/`float`.
4. ✅ `tests/e2e/` contains a smoke E2E covering onboard → log bias → place trade → close trade → analytics.

**Friction quick-wins (Wave 1) — DONE 2026-05-31** (all features implemented + wired; Wave 1.5 remediation closed the §17.6 gaps and all five gates are green — commit `f82a0d6`)
5. ✅ New Trade panel remembers last pair/setup/mode for the session.
6. ✅ Invalidation field offers ICT-native quick-chips that satisfy the 20-char requirement in one tap; free text remains available.
7. ✅ Emotional state defaults to a one-tap selector (Focused / Neutral / Tilted); the three sliders are an advanced disclosure.
8. ✅ Close Trade modal has a "Closed clean at TP/SL" one-click path that fills the honesty section.
9. ✅ ⌘K command palette is implemented and listed in Settings shortcuts.
10. ✅ Calendar view exists, coloured by daily P&L, with click-through to a day's trades (bucketed by `exit_time` in the configured timezone, agreeing with the rules engine).

**Automations (Wave 2) — DONE 2026-05-31** (items 11–17 complete; gates green)
11. ✅ Dashboard updates instantly on every close (no manual refresh). — commit `14d8ced`, 2026-05-31
12. ✅ Analytics includes time-of-day, day-of-week, expectancy, profit factor, R-multiple distribution. — commit `f13cabd`, 2026-05-31
13. ✅ The Review screen lists local insight-engine findings; at least 5 heuristics are wired and tested. — commit `4ac1913`, 2026-05-31
14. ✅ Close Trade modal pre-ticks rules-broken from planned-vs-actual comparison; the trader confirms or unticks. — commit `eac6e9e`, 2026-05-31 (6 detectors in the rule engine; SL-widening + new TP-narrowing have real-time hooks; mid-trade risk-increase real-time hook deferred — see §17.6)
15. ✅ A composite performance score is displayed alongside the Discipline Score. — commit `ce30ab7`, 2026-05-31 (decimal.js 0–100 score from win rate, profit factor, avg win/loss, consistency, clean-rate; rendered under the Discipline Ring)
16. ✅ Per-trade A–F quality grade appears on the trade detail and the trade log. — commit `bc3808b`, 2026-05-31 (process-weighted: plan-followed + rules-clean dominate; disciplined loss can grade A, rule-breaking win grades F)
17. ✅ Notebook is available with markdown notes and three templates (trading plan, watchlist, weekly review). — commit `eb7e52c`, 2026-05-31 (local `notebook_entries` table, XSS-safe markdown renderer, two-pane page, pin + soft-delete)

**Import + two-phase logging (Wave 3) — DONE 2026-06-01**
18. ✅ MT5 statement import lands trades into the local DB with no manual entry; round-tripped through tests. — commit `0505913` (adapter + committer), `b35172e` (shared layer refactor)
19. ✅ cTrader statement import works the same way. — commit `b35172e`
20. ✅ TradingView CSV import works for users on its journal/paper trader. — commit `b35172e` (handlers), `4069b56` (IPC bridge), `0d42e6e` (Import UI tab), `a5898c4` (integration tests)
21. ✅ MAE/MFE auto-computes via shared committer when `priceSeries + stopLoss` are both present; infrastructure tested in `mae-mfe-commit.test.ts`. Note: MT5/cTrader HTML statements and TradingView CSV do not carry per-candle OHLC data, so MAE/MFE remains null for current statement imports. The machinery is in place for adapters that do provide a price series. — commit `04a82b6`
22. ✅ Two-phase logging is live: `pre_trade.fast_path_enabled` (default on, toggled in Settings → General) makes the close modal minimal — exit price + reason + time only, with a deferred-reflection notice; `closeMinimal` IPC writes the trade closed; the Review screen surfaces the queue via `listAwaitingReflection`; `ReflectionModal` calls `completePhase2`. — commit `04a82b6`
23. ✅ Sidebar shows a live badge (N trades awaiting reflection) on the Review nav item; `ReflectionStore` drives it; `eventBus` refreshes on `trade.closed` and `trade.reflected`. — commit `04a82b6`
24. ✅ Setup templates / playbooks exist (Settings → Playbooks); `buildPlaybookPatch` pre-fills PreTradePanel on inline dropdown tap or ⌘K "New trade from playbook: <name>". — commit `04a82b6`

**Quality bars (continuous across all waves)**
25. `pnpm typecheck` and `pnpm lint --max-warnings 0` stay green on every PR.
26. Coverage on `electron/services/` does not fall below the v1.1 level; rises toward 80%.
27. No new monetary or pip column is added as `real` or `float`; all money math remains integer-encoded.
28. Every new IPC handler has a Zod input schema and a typed Result return.
29. No feature ships that bypasses `EntitlementService` (matter of habit pre-v2.0 — keep the gates clean for when the service exists).

Wave 4 is its own milestone and is **not** part of v1.2 done; it lands in a v1.3 / v2.0 boundary depending on whether broker work happens before or after the cloud rebuild in CLAUDE.md §18. Its end-state list is §6.1 below.

---

## 6.1 Wave 4 done — end-state criteria (live broker integration)

Wave 4 is a separate optional milestone. Full spec: `docs/broker-integration.md` §10. It is complete when:

30. A Cairn-bridge Expert Advisor installs into an MT5 terminal and, on every fill, delivers a `BrokerEvent` to the desktop over a loopback-only, token-authenticated socket; Settings → Integrations → MT5 shows live connection status.
31. cTrader Open API connects via OAuth (read-only scopes), tokens stored in the OS keychain, and streams execution events as `BrokerEvent`s.
32. Both sources normalise to one `BrokerEvent` stream; the ingest service encodes money/pips to integers (decimal.js), never floats.
33. Auto-log mode is a Settings toggle (default **draft-awaiting-context**): draft mode prefills mechanical fields, lands the trade in the reflection queue, and leaves honesty fields `unreviewed`; **fully-auto** writes a complete trade that never enters the queue. `unreviewed` is never counted as `clean` in composite score, A–F grade, or clean-rate. Settings copy states auto-log is capture, not pre-trade prevention.
34. Live detection raises non-blocking, mentor-voice warnings on SL-widen / size-up / TP-cut / over-trade / post-circuit-breaker / outside-killzone, recorded as `rule_violations`, for trades from both brokers.
35. Live trades dedupe against statement imports via `external_ref`; no double-counting (round-tripped in tests).
36. No order-execution code path exists in either adapter or the EA; a test enforces this. If built on the v2.0 sync engine, streamed fills sync via `enqueueSyncOp`.

**Status (2026-06-06, branch `feat/vault-enrollment-server`, uncommitted):**
- **#35 — done & tested.** Dedupe to one row via `external_ref`, and the conflict rule is realised: statement wins monetary fields, live wins timing/modification history (`commitWithReconcile` / `reconcileSettledTrade`). Round-tripped in `tests/integration/broker-ingest.test.ts` (settle-from-statement, replay-after-settlement, idempotent re-import).
- **#36 — done & tested.** No-order-execution enforced by the read-only adapter tests; streamed fills (and statement imports) now enqueue via `enqueueSyncOp`, closing the import-adapter sync-gap follow-up.
- **#32, #33, #34 — built, service-level green.** Single `BrokerEvent` stream + integer encoding; auto-log Settings toggle with the honesty boundary; live detection warnings recorded as `rule_violations`.
- **#30, #31 — built, two production seams open before live end-to-end:** the Settings → Integrations account-map UI (`resolveAccount()` returns `null` today → fills hit `UNKNOWN_ACCOUNT`) and the cTrader protobuf codec (`loadProtobufCodec()` returns `null`). Until both land, the live-terminal manual QA in `docs/broker-integration.md` §10 cannot run; the automated round-trip test stands in for the import-after-live no-duplicate path.

**Update (2026-07-10, committed on `feat/rules-engine`) — shippability P0s CLOSED + the #30/#31 seams landed:**
- The account-map UI and cTrader protobuf codec seams above have since landed (per CLAUDE.md §17.6: account-map UI `16e22af`, codec `b238fdd`/`44dc9b6`); the remaining Wave-4 gap is live-terminal manual QA (`docs/broker-integration.md §10`).
- Two gaps that stopped a **stock installed build** from connecting are now fixed: the MT5 EA is **bundled into the installer** with a one-click "Install Cairn EA" button (`ab7be8c`), and cTrader gained a **keychain-first credential-paste UI** so it connects with no env vars (`feat(broker)` commit). Plus a security-hardening pass (`fix(security)` commit). Full detail: `docs/build-status.md` § "Connectivity P0s + security hardening (2026-07-10)" and `docs/broker-integration.md §2.1/§2.2`.

Wave 4 carries external-dependency slack not present in Waves 0–3: an MT5 demo terminal to test the EA, and a Spotware Open API app registration + OAuth review for cTrader.

---

## 7. Source of this plan

This roadmap was derived from `Cairn_Report_Working_Friction_vs_TradeZella.html` (in the project root) — a comprehensive working-procedure, friction and competitive analysis produced in May 2026. That report is the long-form rationale; this doc is the binding plan.
