# Cairn — Pre-Trade Gate Popup (MT5) — Build Plan

**Status:** plan (agreed design, not yet built).
**Scope:** a paid, real-time pre-trade discipline gate that sits between the trader and an MT5 fill. Read-only against the broker — Cairn never places an order. cTrader is a later port.
**Relationship to existing work:** extends the Wave 4 MT5 bridge (`apps/desktop/resources/mt5-bridge/CairnBridge.mq5`, the loopback listener, and the ingest service). Reuses the existing pre-trade panel UI (`apps/desktop/src/features/pre-trade/PreTradePanel.tsx`) and lot-size math (`apps/desktop/src/lib/calculators.ts`).

---

## 0. Decisions locked this session (2026-06-17)

| # | Decision |
|---|---|
| 1 | **Paid feature.** Gated through `EntitlementService.canUse(userId, 'pre_trade_gate')` (§20). No scattered plan checks. |
| 2 | **Read-only. Cairn never places, modifies, or closes an order.** Locked decision **#37 stands.** The trader places the trade manually; Cairn computes and *shows* the numbers. The EA gains **no** `OrderSend` path. |
| 3 | **MT5 first.** cTrader is a later port and needs a new cAlgo **cBot** (its read-only Open API can't draw UI or interact with the chart). |
| 4 | **Trigger = Cairn-owned, not the native button.** The trader starts a *compliant* trade from a Cairn **Buy/Sell button on the chart** (or a hotkey). The platform's **native** Buy/Sell is the **breach path** — it can't be intercepted, so using it is treated as "I'm skipping the rules." |
| 5 | **UI is hybrid.** Chart controls (Buy/Sell buttons, draggable SL/TP lines, live lot/R:R readout) are drawn **inside MT5** by the EA. The richer **confluence checklist + risk panel** renders as a **frameless, always-on-top Cairn window** snapped over the MT5 chart (reuses the real React UI; honors §2.8). |

### The hard constraint that shaped #4

Neither MT5 nor cTrader exposes a **pre-order hook**. In MT5, an EA's earliest signal about a manual trade is `OnTradeTransaction`, which fires **after** the deal. There is no "before-order" veto, and the terminal's native Buy/Sell controls are not chart objects, so an EA cannot detect or hold a click on them. Therefore a popup *before* a native order is **not buildable**. The design turns this into a feature: the native button becomes the breach path, auto-flagged on capture.

---

## 1. What we're building, in one paragraph

A paid MT5 add-on that makes the disciplined way to enter a trade the *easy* way and the rule-breaking way the *scored* way. The trader clicks Cairn's own Buy/Sell button on the MT5 chart; a Cairn checklist window appears over the chart and forces the confluences + a risk %, while draggable SL/TP lines on the chart show a live, TradingView-style readout of lot size, R:R and risk-$. When the checklist passes, Cairn shows the exact lot/SL/TP for the trader to place manually, then matches the resulting fill to that plan and logs it **clean**. If the trader instead hits the red **Breach Rules** button — or skips Cairn entirely and uses MT5's native Buy/Sell — the trade is still captured automatically and logged as a **rule breach**, scored badly regardless of whether it made money.

---

## 2. The three flows

### 2.1 Compliant (the rewarded path)
1. Trader clicks **Cairn Buy** or **Cairn Sell** on the chart (EA button) — or presses the hotkey.
2. EA notifies Cairn (`gate.intent`) with symbol, direction, current price, account.
3. Cairn opens the **checklist overlay** (frameless window over the chart). EA draws **draggable SL and TP lines** on the chart.
4. As the trader drags SL/TP (or types prices), the EA streams live `gate.levels` (price, SL, TP). Cairn computes **lot size / R:R / risk-$** with `decimal.js` and shows them live in both the overlay and a small on-chart label.
5. Trader completes confluences + risk % and clicks **Confirm**. Cairn stores a **pre-trade plan** (symbol, direction, intended entry/SL/TP, lot, confluences, risk %) and shows the final numbers.
6. Trader **places the order manually** in MT5 with those numbers.
7. The fill streams in via the existing read-only bridge; Cairn **matches it to the plan** (§4) and writes a **clean** trade — Phase-2 reflection still owed exactly like a normal fast-path close.

### 2.2 Acknowledged breach (opened the popup, chose to override)
1–3 as above, but the trader clicks the red **Breach Rules** button.
4. Overlay closes; Cairn records an **acknowledged breach intent** (which rules were open, what was skipped).
5. Trader places whatever they want manually.
6. Fill is captured and logged as a **breach** — `rule_violations` rows written, never counted clean.

### 2.3 Silent breach (never engaged Cairn)
1. Trader just uses MT5's **native** Buy/Sell.
2. Fill streams in with **no matching plan**.
3. Cairn logs it as an **unplanned breach** — scored worst of the three (didn't even engage the gate).

> All three end with the trade in Cairn automatically. The only difference is the score.

---

## 3. Architecture & components

```
┌─────────────────────── MetaTrader 5 terminal ───────────────────────┐
│  CairnBridge EA (extended — STILL no OrderSend)                       │
│   • OnTradeTransaction → fill capture            (exists today)        │
│   • OnChartEvent: Cairn Buy/Sell buttons         (NEW)                │
│   • OnChartEvent: draggable SL/TP lines + drag    (NEW)               │
│   • on-chart live readout label                   (NEW)               │
│   • outbound gate.intent / gate.levels frames     (NEW)               │
└───────────────┬───────────────────────────▲─────────────────────────┘
   loopback TCP │ JSON frames (127.0.0.1)    │ gate.show / gate.drawLines (NEW, Cairn→EA)
                ▼                             │
┌─────────────────────── Cairn desktop (main process) ─────────────────┐
│  MT5 listener (exists) ──► Broker ingest service (exists, extended)    │
│   • plan store (NEW): pending pre-trade plans                         │
│   • plan↔fill matcher (NEW, extends §5 draft-linking)                 │
│   • scoring: clean / acknowledged-breach / unplanned-breach           │
│   • EntitlementService gate (paid)                                     │
└───────────────┬──────────────────────────────────────────────────────┘
    IPC / events │
                ▼
┌──────────── Cairn renderer ─────────────────────────────────────────┐
│  Checklist OVERLAY window (frameless, always-on-top)                  │
│   • reuses PreTradePanel.tsx confluences + risk UI                    │
│   • live lot/R:R/risk-$ from calculators.ts (decimal.js)             │
│   • Confirm  /  red Breach Rules button                              │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 MQL5 EA additions (read-only — no order execution)
- **Chart buttons:** `OBJ_BUTTON` "Cairn Buy" / "Cairn Sell"; handled in `OnChartEvent (CHARTEVENT_OBJECT_CLICK)`.
- **Draggable levels:** `OBJ_HLINE` for SL and TP, `OBJPROP_SELECTABLE=true`; `CHARTEVENT_OBJECT_DRAG` reports new prices; throttled (e.g. ≤10/s) to the socket.
- **Live readout:** an on-chart `OBJ_LABEL` updated from Cairn's computed values (Cairn → EA `gate.drawLines`), so the chart and the overlay agree.
- **Outbound frames:** reuse the existing length-prefixed JSON frame format (`mt5/frame.ts`) and token auth; add `gate.intent`, `gate.levels`. **No `OrderSend`/`OrderModify`/`OrderClose` — asserted by the existing read-only test, kept and extended.**
- The loopback listener gains a **Cairn → EA** direction for `gate.show`/`gate.drawLines`. Still `127.0.0.1` only, token-authenticated, size-capped.

### 3.2 Cairn main-process additions
- **Plan store:** a `pre_trade_plans` table (or reuse the existing draft mechanism) holding pending plans keyed by `(account, symbol, direction)` with a short TTL.
- **Matcher:** extend the existing fill-to-draft linker (broker-integration §5) so a streamed fill within the TTL/tolerance binds to its plan → **clean**; otherwise → **unplanned breach**.
- **Entitlement:** all gate features behind `EntitlementService.canUse(...,'pre_trade_gate')`; the EA still captures fills for free users (existing behavior), they just don't get the gate UI.

### 3.3 Renderer (overlay window)
- New **frameless, always-on-top** BrowserWindow that renders a thin wrapper around `PreTradePanel.tsx`.
- Live lot/R:R/risk-$ computed in-renderer via `calculators.ts` from the EA's streamed levels.
- Two terminal actions: **Confirm** (writes plan) and **Breach Rules** (writes acknowledged-breach intent, closes overlay).

---

## 4. Plan-to-fill matching & dedupe
- Match a streamed fill to a pending plan on `(account, symbol, direction)` within a configurable **time window** and **price tolerance**.
- Dedupe against later statement imports via the existing `external_ref` column (`ON CONFLICT DO UPDATE`) — a gated trade and its statement row resolve to one trade.
- Money/pips encoded to integers via the existing `_shared/encoder.ts` before any DB write (§2.5 / §19.5). The plan's intended levels are stored alongside the actual fill so planned-vs-actual deviation is auditable.

---

## 5. Lot-size calculator (read-only)
- Inputs: account balance + leverage (per-account, existing), risk % (panel), entry (live price from EA), SL distance (from the draggable SL line), pip value (per pair, existing pairs list).
- `lot = risk$ / (sl_pips × pip_value)`, `risk$ = balance × risk%`, all in `decimal.js`. R:R = TP distance ÷ SL distance.
- This is **display only** — the trader types these into MT5's own ticket. (Friction noted: read-only means a manual re-entry step; the draggable lines + a copyable lot field keep it fast.)

---

## 5.1 Market movement between Confirm and placement (slippage)

Because the trader places manually, seconds pass between confirming the plan and the native order — the market may drift, so the actual entry won't be pixel-perfect. The design handles this on two fronts: **an accurate lot at the moment of placement**, and **honest recording afterward**.

- **Risk is pinned to the SL line + lot size, not the exact entry.** On a tight stop, a few pips of entry drift while the SL price stays fixed can push actual risk meaningfully above plan (e.g. a 3-pip drift on a 20-pip stop turns 1% into ~1.15%). This is the real cost of read-only and must be surfaced honestly, not hidden.
- **The lot/R:R/risk-$ readout stays live until placement.** The EA streams live price; the SL line is a fixed price level, so pip-distance and lot recompute on their own. The trader reads the *current* number at the instant they place, never a stale one.
- **Limit order at the planned entry = exact match.** A pending order at the planned price fills there or not at all — zero drift, risk exactly as planned, perfect plan↔fill match. The gate nudges toward this for tight stops.
- **Market entries use a tolerance band.** A fill within the configured time window + price tolerance (same symbol/direction) still binds to the plan and logs **clean** — no demand for a pixel-perfect entry. After the fill, Cairn recomputes **actual** risk from the real entry and stores it alongside the planned figure, so the journal shows what truly happened.
- **Big drift is flagged, not silently matched.** Too slow, or an entry far off plan (price ran toward TP, or fumbled numbers) falls outside tolerance → Cairn warns or logs a deviation rather than pretending it matched.
- **Tolerance is configurable.** The time window and price tolerance are settings with sensible defaults, tuned during MT5 testing.

---

## 6. Scoring — a breach is never clean
- Three outcomes feed the existing scoring (`analytics/composite-score.ts`, `adherence.ts`): **clean**, **acknowledged breach**, **unplanned breach**.
- Breaches write `rule_violations` rows and are **never** counted clean, **regardless of P&L** — a profitable breach is still a bad habit (§2.3). Acknowledged < clean; unplanned < acknowledged.
- Surfaced in composite score, A–F grade, clean-rate, and at reflection time, consistent with how `unreviewed` is already handled distinctly.

---

## 7. Data-model touches (Drizzle migration)
- `pre_trade_plans` (new) — pending/confirmed plans, TTL, intended levels, confluences, risk %, breach-intent flag.
- `trades` — reuse `external_ref`, `phase2Complete`; add a `gate_outcome` enum column (`clean | breach_ack | breach_silent | n/a`).
- `rule_violations` — reuse existing table for the breach rows.
- Migration idempotent, tested forward + backward (§2.5 / §19).

---

## 8. Safety boundary (unchanged)
- Cairn issues **zero** broker writes. The EA compiles **no** order-execution path; the existing `mt5-ea-readonly` test stays and is extended to cover the new EA code.
- Loopback only (`127.0.0.1`), token-authenticated, size-capped frames — same posture as today.
- No telemetry; everything stays on-device (§2.4).
- Claude builds the feature so the trader acts through it; Claude never places trades in the terminal itself.

---

## 9. Build stages (suggested order)
1. **Spec + ADR** — record the paid gate; confirm #37 is *preserved* (no reversal needed since read-only). Migration for `pre_trade_plans` + `gate_outcome`.
2. **EA chart UI** — Buy/Sell buttons + draggable SL/TP + live readout; outbound `gate.intent`/`gate.levels`; keep read-only test green.
3. **Bridge** — add Cairn→EA channel (`gate.show`/`gate.drawLines`) on the existing loopback listener.
4. **Overlay window** — frameless always-on-top renderer reusing `PreTradePanel.tsx` + `calculators.ts`; Confirm / Breach Rules.
5. **Matcher + scoring** — plan store, fill↔plan matching, three gate outcomes into composite score.
6. **Entitlement gate** — `pre_trade_gate` feature flag; free users keep capture only.
7. **Tests + manual QA** — fixture-replayed intents/levels, matcher unit tests, scoring tests, five gates green, manual run on an MT5 **demo** account.
8. **cTrader port (later)** — replicate via a cAlgo cBot.

---

## 10. Risks & open questions
- **Manual re-entry friction (read-only).** Trader still types lot/SL/TP into MT5. Mitigate with draggable lines + a one-click-copy lot field. Revisit if it proves too clunky (would re-open the execution question — currently declined).
- **Match window tuning.** Too tight → compliant trades misflagged as breaches; too loose → wrong fill bound to a plan. Needs sensible defaults + a setting.
- **Overlay window placement** across multi-monitor / MT5 fullscreen — needs snapping logic and a fallback position.
- **MQL5 UI throttling** — drag events can be chatty; cap update rate to keep the socket calm.
- **Hotkey capture** while MT5 is focused — confirm a global vs chart-scoped hotkey on Windows.
- **cTrader parity later** is a separate build (cBot), not a config flag.

---

## 11. Testing
- **EA:** fixture-replay `gate.intent`/`gate.levels`; assert no order-execution symbols in the compiled surface (extend `mt5-ea-readonly`).
- **Matcher:** unit tests for clean / ack-breach / silent-breach across the time/price window, plus `external_ref` dedupe round-trip vs statement import.
- **Scoring:** breach never clean even when profitable; ack < clean, silent < ack.
- **Calculator:** property-based tests on lot/R:R math in `decimal.js` (§19).
- **Manual QA:** full run on an MT5 demo account — compliant, acknowledged-breach, and silent-breach trades, end to end.

---

*Read-only stays read-only. The gate rewards the disciplined entry and scores the breach — it never touches the order.*
