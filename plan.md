# Cairn — Pre-Trade Gate — Master Plan (Improved)

**Feature:** a paid, real-time pre-trade discipline gate for MT5 (then cTrader).
**One line:** make the disciplined entry the easy one and the rule-break a scored one — without Cairn ever touching the order.
**Status:** agreed design, build deferred until the current app is tested.
**Boundary:** **read-only** — Cairn computes and records, the trader places. Locked decision **#37 stands** (no order-execution path anywhere).

This is the canonical, consolidated plan. The longer spec lives in [`docs/pre-trade-gate-popup.md`](docs/pre-trade-gate-popup.md); the sequenced build prompts live in [`cairn-pre-trade-gate-prompts.html`](cairn-pre-trade-gate-prompts.html).

---

## 1. The decisions (locked 2026-06-17)

| # | Decision | Why |
|---|---|---|
| 1 | **Paid feature** behind `EntitlementService.canUse(userId, 'pre_trade_gate')` | Single source of truth for gating (§20); free users keep capture-only |
| 2 | **Read-only — Cairn never places, modifies, or closes an order** | Preserves #37; no liability shift; trader stays in control |
| 3 | **MT5 first, cTrader second** | MT5 is on-device (EA + loopback bridge already exist); cTrader needs a new cAlgo cBot |
| 4 | **Trigger = Cairn's own on-chart Buy/Sell button (or hotkey)** | No platform exposes a *pre-order* hook, so a native click can't be intercepted; native buy/sell becomes the breach path |
| 5 | **Hybrid UI** — chart controls inside MT5 (MQL5), checklist as a frameless Cairn window over the chart | Chart-drag must be in-platform; the rich checklist reuses the real app UI (honors §2.8) |

---

## 2. How it works (compliant path)

1. Trader clicks **Cairn Buy / Sell** on the MT5 chart (or hotkey). *Nothing is sent to the broker.*
2. A Cairn **checklist overlay** opens over the chart; the EA drops **draggable SL and TP lines** on the chart.
3. Trader drags SL/TP and enters **risk %**. Live, TradingView-style: **lot size, R:R, risk-$** update as they drag (computed in `decimal.js`).
4. Trader ticks **confluences** + writes the **invalidation** ("when this trade is wrong") and hits **Confirm** → Cairn saves the **plan**.
5. Trader places the order **manually** in MT5's native ticket using those numbers.
6. The fill streams back through the existing read-only bridge → Cairn **matches it to the plan** → logs a **clean** trade (Phase-2 reflection still owed, as normal).

## 3. The three outcomes (all auto-recorded)

| | Compliant | Acknowledged breach | Silent breach |
|---|---|---|---|
| Opened Cairn? | Yes | Yes | No |
| Checklist? | Completed → Confirm | Hit red **Breach Rules** | Never engaged |
| Placed via | Native ticket, Cairn's numbers | Native ticket | Native ticket |
| Recorded? | **Yes, auto** | **Yes, auto** | **Yes, auto** |
| Score | Clean | Bad | Worst |
| Does profit redeem it? | — | **No** | **No** |

The broker connection guarantees capture no matter what. The only variable is the score.

## 4. Slippage (market moves before the manual click)

- Risk is pinned to the **SL line + lot**, not the exact entry; on a tight stop a few pips of drift can push real risk above plan — surfaced honestly.
- The lot/R:R/risk-$ readout **stays live until placement** (EA streams live price).
- **Limit order at the planned entry = exact match** (recommended for tight stops).
- **Market entry** → a **tolerance band** (time + price) still binds the fill to the plan = clean; Cairn then **recomputes actual risk** from the real fill and stores it next to the plan.
- **Big drift → flagged**, not silently matched.
- Tolerance window/price are **settings**, tuned during testing.

---

## 5. Architecture (what gets built)

- **MQL5 EA (extended, still no `OrderSend`):** Cairn Buy/Sell buttons, draggable SL/TP lines, live on-chart readout, outbound `gate.intent` / `gate.levels`. Read-only test stays green.
- **Loopback bridge:** add a Cairn→EA direction (`gate.show` / `gate.drawLines`); still `127.0.0.1`, token-authed, size-capped.
- **Main process:** `pre_trade_plans` store; plan↔fill matcher (extends the existing draft-linking); three gate outcomes into scoring; entitlement gate.
- **Renderer:** frameless always-on-top overlay reusing `src/features/pre-trade/PreTradePanel.tsx` + `src/lib/calculators.ts`; Confirm / Breach Rules.
- **Data model:** `pre_trade_plans` (new), `gate_outcome` column on `trades`, reuse `external_ref` + `rule_violations`. Migration idempotent, tested both ways.

## 6. Reuses what already exists

`CairnBridge.mq5` (read-only EA), the loopback listener + frame format, the broker ingest service, `calculateLotSize` (already integer-encoded), `PreTradePanel.tsx`, `analytics/composite-score.ts` + `adherence.ts`, `rule_violations`, `external_ref`, and two-phase logging. The gate is an extension, not a rewrite.

## 7. Build order (see the prompts HTML for the detail)

1. **MT5 gate** — spec/ADR + migration → EA chart UI → bridge channel → overlay + calculator → matcher + slippage + scoring → entitlement/settings.
2. **Test MT5** — automated (matcher, scoring, calculator property tests, EA read-only) + manual QA on an MT5 **demo** account across all three flows.
3. **cTrader port** — new cAlgo cBot (chart UI + levels, read-only) wired into the same pipeline.
4. **Test cTrader** — automated + manual QA on a cTrader **demo** account.

## 8. Risks / open questions

- **Manual re-entry friction** (read-only) — mitigated by draggable lines + copy-lot + limit-order nudge; revisiting it would re-open the (declined) execution question.
- **Match-window tuning** — too tight misflags clean trades; too loose mis-binds. Needs good defaults + a setting.
- **Overlay placement** on multi-monitor / fullscreen MT5.
- **Hotkey capture** while MT5 is focused (global vs chart-scoped).
- **cTrader parity** is a separate cBot build, not a flag.

---

*Read-only stays read-only. The gate rewards the disciplined entry and scores the breach — it never touches the order.*
