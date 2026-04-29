# CLAUDE.md — CAIRN

**Project:** Cairn — A Discipline-First Trading Journal
**Version:** 1.1 Specification
**Author of spec:** Trading coach collaboration
**App creator credit:** Designed & built by Jai Akash
**Intended build tool:** Claude Code (Anthropic)

---

## 0. HOW TO USE THIS DOCUMENT

This is the slim root spec for Cairn. Full detail lives in `/docs/*.md` sub-files. Load only the sub-files relevant to your current task — don't load all of them at once.

**This document is the single source of truth for §1, §2, §3, §14, §15, and §16. When it conflicts with any assumption, prior message, or intuition — follow this document.**

**Navigation map:** See §4 below for a pointer to every sub-file and what it covers.

**Current version:** v1.1. See §17 for what changed from v1.0.

---

## 1. FOUNDING DOCUMENT — WHY CAIRN EXISTS

### 1.1 The Problem This App Solves

A cairn is a stack of stones placed on a trail to mark the way for those who come after. Each stone is deliberate. Each stone stays where it's placed. A cairn is built by people who have walked the path and want to make sure they — and others — can find it again.

This app exists because someone walked off the path and wants to build the cairn that keeps them on it.

The user has:
- Studied ICT (Inner Circle Trader) methodology for over a year.
- Diagnosed their own problem as primarily discipline and process, not knowledge.

After structured assessment, the diagnosis was confirmed: **this is ~20% knowledge gap, ~80% discipline and process gap.** The trader knows how to take a good trade. The trader does not yet have the system that prevents them from taking bad ones.

Every feature in this app exists to solve one specific pattern: **"I know the rule. I break the rule. I lose. I promise to follow the rule. I break it again."**

### 1.2 The Design Philosophy

Most trading journals are **records of what you did**. Cairn is a **system that changes what you do**.

This one sentence shapes every decision in this spec. When there is a choice between:
- A nicer report vs. a rule that prevents a bad trade → prevent the bad trade.
- A faster log entry vs. a field that forces self-awareness → force the self-awareness.
- A generic analytic vs. an ICT-specific analytic → go ICT-specific.
- A friendly nudge vs. a hard block when a rule is breaking → hard block.

The app is an **external discipline layer**. Cairn replaces willpower with structure.

### 1.3 The Three Jobs Cairn Must Do

1. **Prevent rule violations in real time, before the click.** Not detect them afterwards. Prevent them.
2. **Capture complete, honest data on every trade.** With no escape hatch for laziness or tilt.
3. **Transform that data into insights that change behavior week over week.**

If a feature doesn't serve one of these three jobs, it doesn't belong in v1.

### 1.4 What Cairn Is Not

- Cairn is not a charting tool. The user trades on TradingView and MT5.
- Cairn is not a social platform. There is no sharing, no feeds, no comparisons to other traders.
- Cairn is not a coach. It doesn't give advice during trades. It enforces the user's own pre-committed rules.
- Cairn is not tied to any specific prop firm. It is neutral and configurable.
- Cairn is not cloud-first. It is a private, local, personal tool.

### 1.5 Voice and Tone (For UI Copy)

Cairn speaks the way a respected mentor speaks: direct, calm, and honest. Never cutesy. Never alarmist. Never patronizing. Examples of correct voice:

- ❌ "Oops! Looks like you've hit your daily limit! 🎉"
- ✅ "Daily loss limit reached. Session closed."

- ❌ "Great job on that trade, champion!"
- ✅ "Trade closed. +2.3R. Rules: clean."

- ❌ "Are you sure you want to move your stop loss?"
- ✅ "You are moving SL against you. This violates Rule 4 on this account. Proceed anyway?"

---

## 2. CORE PRINCIPLES — NON-NEGOTIABLE

These principles override any other consideration in the app. If an implementation decision seems to contradict one of these, stop and re-read.

### 2.1 Prevention Over Detection
The app must block rule-breaking actions in real time wherever possible. Post-hoc analytics are secondary. If a rule can be checked before the trade is placed, it must be.

### 2.2 Friction in the Right Places
Logging a trade must be fast (under ~90 seconds total round-trip). Breaking a rule must be slow (friction, warnings, typed confirmations). The app should be easy to use correctly and hard to use incorrectly.

### 2.3 Honesty Forcing Functions
Fields that require self-awareness (invalidation, emotional state, rules-broken) must be structured so that skipping them is either impossible or explicitly acknowledged. Never default these to "N/A."

### 2.4 Local-First, Privacy-First
All data is the user's. It lives on their machine. No telemetry. No analytics sent anywhere. No account required. No network calls except for optional cloud-folder backup (which uses existing desktop sync tools, not APIs).

### 2.5 Data Integrity is Sacred
This is a financial app. Money-adjacent calculations must be correct to the cent/pip. All arithmetic uses appropriate decimal types, never floats. All P&L math is tested. All database writes are transactional.

### 2.6 Extensibility Without Rework
The user will add v2 features and MT5/cTrader integration later. Every architectural decision in v1 must accommodate v2 without requiring rewrites. Data model, component structure, and state management are all designed to be added to, never ripped up.

### 2.7 The App is a Cockpit, Not a Notebook
The trader should trade **through** Cairn — lot size calculator, rule-checker, target validator — not log in Cairn **after** trading elsewhere.

### 2.8 Aesthetic is Functional
Good design is a feature, not a polish layer. A calm, beautiful, deliberate UI reinforces the discipline the app is teaching. Cairn uses a **glassmorphism + depth** design language: frosted glass surfaces, layered depth, subtle glow accents, and smooth physics-based animations. A cluttered or flat UI undermines the discipline the app is teaching.

### 2.9 Never Mention Specific Prop Firms in UI
The app is prop-firm-agnostic. Prop firms are configured as generic "firms" with configurable rule sets. No firm name is hardcoded or referenced in user-visible text.

### 2.10 No Reference to the User's Backstory in the App
The founding document above exists for context. The user's history must never appear in the UI, error messages, onboarding, or any user-visible text.

### 2.11 Everything User-Configurable is User-Configurable
Any behavioral preference — timezone, leverage, risk %, daily trade limit, loss circuit breaker, R-target alerts, default pairs — must be configurable in Settings. Defaults are sensible starting points, not constraints.

---

## 3. TECH STACK & ARCHITECTURE

### 3.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Electron (latest stable) | Desktop app, Win/Mac/Linux, mature ecosystem |
| Renderer | React 18+ with TypeScript (strict mode) | Type safety for financial math |
| Build tool | Vite (via electron-vite) | Fast HMR, modern defaults |
| Styling | Tailwind CSS | Rapid styling, design-token friendly |
| Components | shadcn/ui (customized) + custom | Polished baseline, full control |
| Animation | Framer Motion | Physics-based motion, declarative |
| State | Zustand | Simple, boilerplate-free, TypeScript-native |
| Database | SQLite via better-sqlite3 | Fast, synchronous, zero-config |
| ORM / Migrations | Drizzle ORM | Type-safe queries, migration system |
| Charts | Recharts | React-native, customizable, good defaults |
| Forms | React Hook Form + Zod | Validation + type inference |
| Date/Time | date-fns + date-fns-tz | Timezone-critical for killzones |
| Icons | Lucide React | Clean, consistent |
| Fonts | Inter (UI), JetBrains Mono (numbers) | Pro-trader convention for numbers |
| Packaging | electron-builder | NSIS installer, DMG, AppImage |

### 3.2 Package Manager & Node Version
- Use `pnpm` (faster, disk-efficient, strict).
- Node version pinned via `.nvmrc` (latest LTS at time of build).
- `engines` field in `package.json` enforces Node version.

### 3.3 File Structure

```
cairn/
├── CLAUDE.md
├── docs/
│   ├── philosophy.md
│   ├── design-system.md          # v1.1: updated for glassmorphism design language
│   ├── data-model.md             # v1.1: leverage field, partial close, screenshot attachment
│   ├── features-v1.md            # v1.1: risk calculator, draft activation, pairs list, new features
│   ├── features-v2.md
│   ├── rules-engine.md           # v1.1: daily trade limit rule, max daily loss circuit breaker
│   ├── analytics.md
│   ├── ui-flows.md
│   ├── customization.md          # v1.1: timezone setting, leverage, R-target alerts
│   ├── integrations-future.md
│   ├── testing.md
│   └── conventions.md
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   ├── ipc/
│   │   ├── trades.ts
│   │   ├── accounts.ts
│   │   ├── rules.ts
│   │   ├── backup.ts
│   │   └── settings.ts
│   ├── db/
│   │   ├── index.ts
│   │   ├── schema.ts
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── services/
│   │   ├── rules-engine.ts
│   │   ├── pnl-calculator.ts
│   │   ├── backup-service.ts
│   │   ├── import-adapters/
│   │   │   └── manual.ts
│   │   └── export-service.ts
│   └── utils/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── router.tsx
│   ├── assets/
│   │   ├── fonts/
│   │   └── icons/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── Shell.tsx
│   │   ├── dashboard/
│   │   ├── trade-entry/
│   │   ├── trade-log/
│   │   ├── analytics/
│   │   ├── accounts/
│   │   ├── settings/
│   │   └── shared/
│   ├── features/
│   │   ├── dashboard/
│   │   ├── pre-trade/
│   │   ├── post-trade/
│   │   ├── analytics/
│   │   ├── accounts/
│   │   ├── settings/
│   │   └── review/
│   ├── stores/
│   │   ├── session-store.ts
│   │   ├── settings-store.ts
│   │   └── ui-store.ts
│   ├── hooks/
│   ├── lib/
│   │   ├── ipc.ts
│   │   ├── formatters.ts
│   │   ├── calculators.ts        # v1.1: lot size from risk % or risk $, leverage-aware
│   │   └── cn.ts
│   ├── styles/
│   │   └── globals.css
│   └── types/
│       └── index.ts
├── shared/
│   └── types/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/
├── .nvmrc
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── electron-builder.yml
├── tailwind.config.ts
├── postcss.config.js
└── .env.example
```

### 3.4 Process Architecture

- **Main process** owns: database, file system, OS integration, backup service, window management.
- **Renderer process** owns: UI, transient UI state, user interactions.
- **Communication:** typed IPC only. No `remote` module. Context isolation enabled.
- **Preload script** exposes a narrow, typed API surface to the renderer.

### 3.5 Typed IPC Pattern

Every IPC handler:
1. Has a defined input Zod schema and output type.
2. Is registered in a handler map in `electron/ipc/index.ts`.
3. Is accessed from the renderer through a typed wrapper in `src/lib/ipc.ts`.
4. Returns `{ ok: true, data } | { ok: false, error }` — never throws across the bridge.

---

## 4. DOCS NAVIGATION MAP

Load sub-files only as needed. Each is self-contained. Files marked **[v1.1 updated]** have new sections appended at the bottom under `## v1.1 Additions`.

| File | Contents |
|---|---|
| `docs/philosophy.md` | §1 full text — why Cairn exists, design philosophy, three jobs, voice & tone. |
| `docs/design-system.md` | Colors, typography, spacing, motion, component aesthetics, Discipline Ring. **[v1.1 updated]** — glassmorphism design language, new dark/light palettes, text contrast requirements, animation spec. |
| `docs/data-model.md` | All SQLite tables, columns, types, indexes, migration strategy, seed data. **[v1.1 updated]** — leverage column, partial_closes table, screenshot_path column, trade duration fix. |
| `docs/rules-engine.md` | Rule/RuleContext/RuleEvaluation interfaces, all built-in rules, evaluation flow, cooldown system, override system, hard locks, session lock state. **[v1.1 updated]** — daily trade limit rule, max daily loss circuit breaker rule. |
| `docs/features-v1.md` | Full feature specs: onboarding, dashboard, session bias, new trade panel, post-trade log, trade log, accounts, settings, playbook. **[v1.1 updated]** — risk calculator in trade entry, draft activation flow, partial close flow, screenshot attachment (optional), win/loss streak on dashboard, keyboard shortcuts, PDF export, trade duration fix. |
| `docs/analytics.md` | All 6 analytics tabs in detail, filter bar, chart standards. |
| `docs/ui-flows.md` | Key user journeys: happy path, rule-block path, tilt flow, backup flow, migration-fail state. |
| `docs/customization.md` | What's customizable globally vs per-account, custom pair/setup forms. **[v1.1 updated]** — timezone (default: America/New_York), leverage (default: 100:1), default pairs list, daily trade limit, max daily loss %, R-target alert levels, all user-configurable. |
| `docs/integrations-future.md` | v2 broker adapter interface, adapter list, never-features. |
| `docs/testing.md` | Unit, integration, E2E test requirements, manual QA checklist. |
| `docs/conventions.md` | Code style, naming, commits, branching, git hooks, error handling, logging, performance budgets, accessibility, self-healing practices, build order. |

---

## 14. APPENDIX — DECISIONS LOCKED

The following decisions are **locked** and should not be revisited without explicit user confirmation:

1. Electron, not Tauri.
2. Manual entry in v1, broker adapters in v2.
3. Local SQLite, no cloud database.
4. Cloud backup via existing desktop sync services (user points to a synced folder), not via cloud APIs.
5. No news integration, ever (per user direction).
6. No prop firm names hardcoded in UI.
7. No user-history references in UI (founding document context only).
8. App name: **Cairn**.
9. Attribution: "Designed & built by Jai Akash" in sidebar bottom-left, nowhere else.
10. Color palette: Glassmorphism dark (deep graphite base with frosted glass surfaces) / Glassmorphism light (warm bone base with frosted white surfaces). Zero purple/cyan as primary colors.
11. Fonts: Inter + JetBrains Mono.
12. v1 feature scope as listed in §7 (plus v1.1 additions in §17). v2 additions in §11.
13. Rule-gating is blocking by default; overrides require typed acknowledgment; hard locks cannot be overridden.
14. Prevention over detection is the app's north star.
15. Screenshot attachment on trade entry is **always optional** — never required, never blocks trade submission.
16. Default timezone is **America/New_York**. User can change it in Settings.
17. All behavioral preferences (timezone, leverage, daily trade limit, max loss %, R-target alerts, default pairs) are user-configurable in Settings.

---

## 15. GLOSSARY

- **ICT** — Inner Circle Trader methodology.
- **SMC** — Smart Money Concepts.
- **BOS** — Break of Structure.
- **CHoCH** — Change of Character.
- **MSS** — Market Structure Shift (synonym of CHoCH in common usage).
- **FVG** — Fair Value Gap.
- **OB** — Order Block.
- **OTE** — Optimal Trade Entry.
- **PD Array** — Premium/Discount Array.
- **SMT** — Smart Money Technique (divergence between correlated pairs).
- **Killzone** — Time window with historically high volume/volatility.
- **Judas Swing** — Initial manipulation move against the eventual true direction.
- **Silver Bullet** — Specific 1-hour killzone within NY or London.
- **DD** — Drawdown.
- **RR** — Risk-to-Reward ratio.
- **R / R-multiple** — Profit or loss expressed as multiple of initial risk.
- **MAE** — Maximum Adverse Excursion.
- **MFE** — Maximum Favorable Excursion.
- **Clean trade** — Trade with zero rules broken and plan followed exactly.
- **Dirty trade** — Trade with any rule broken or plan deviation.
- **DXY** — US Dollar Index.
- **Partial close** — Closing a portion of an open position while leaving the remainder running.
- **Circuit breaker** — Automatic session lock triggered when max daily loss % is hit.
- **Leverage** — Account leverage ratio (e.g. 100:1). Used in lot size calculations.

---

## 16. END STATE DEFINITION (WHAT "V1.1 DONE" MEANS)

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

---

## 17. V1.1 CHANGE LOG

These items were added in v1.1. For full detail, see the `## v1.1 Additions` section at the bottom of each relevant doc file.

### Design
- Glassmorphism design language across all surfaces (see `docs/design-system.md § v1.1`)
- Text contrast fix: all text meets WCAG AA contrast ratios
- Smooth Framer Motion animations on card load, modal entry, and state transitions

### Bug Fixes
- Dashboard discipline score now updates in real time after each trade
- Dashboard account card shows current balance (not "No account selected" when account exists)
- P&L calculation fixed: uses actual exit price × lot size × pip value × leverage
- Trade duration shows correct elapsed time (open timestamp → close timestamp)

### New Features
- **Risk calculator** in trade entry: risk $ or risk % → auto lot size (see `docs/features-v1.md § v1.1`)
- **Leverage** field added to account settings; used in all lot size and P&L calculations
- **Draft activation**: draft trades appear in trade log with an "Activate" button to open position
- **Partial close**: when closing a trade, user can specify close % and log a partial exit
- **Screenshot attachment**: optional image field on trade entry and post-trade review
- **Default pairs**: expanded seed list with 19 instruments
- **Daily trade limit rule**: configurable max trades/day per account (see `docs/rules-engine.md § v1.1`)
- **Max daily loss circuit breaker**: configurable % drawdown triggers session lock (see `docs/rules-engine.md § v1.1`)
- **R-target alerts**: visual badge on open trades at configurable R levels
- **Win/loss streak**: displayed on dashboard
- **PDF export**: trade review report from Review section
- **Keyboard shortcuts**: core actions, configurable, listed in Settings help panel
- **Timezone setting**: defaults to America/New_York, configurable in Settings (see `docs/customization.md § v1.1`)

---

*A cairn is a stack of stones placed on a trail to mark the way. Each stone is deliberate. Each stone stays where it's placed.*

*Build the stack.*
