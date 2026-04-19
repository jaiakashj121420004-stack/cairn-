# CLAUDE.md — CAIRN

**Project:** Cairn — A Discipline-First Trading Journal
**Version:** 1.0 Specification
**Author of spec:** Trading coach collaboration
**App creator credit:** Designed & built by Jai Akash
**Intended build tool:** Claude Code (Anthropic)

---

## 0. HOW TO USE THIS DOCUMENT

This is the slim root spec for Cairn. Full detail lives in `/docs/*.md` sub-files. Load only the sub-files relevant to your current task — don't load all of them at once.

**This document is the single source of truth for §1, §2, §3, §14, §15, and §16. When it conflicts with any assumption, prior message, or intuition — follow this document.**

**Navigation map:** See §4 below for a pointer to every sub-file and what it covers.

---

## 1. FOUNDING DOCUMENT — WHY CAIRN EXISTS

### 1.1 The Problem This App Solves

A cairn is a stack of stones placed on a trail to mark the way for those who come after. Each stone is deliberate. Each stone stays where it's placed. A cairn is built by people who have walked the path and want to make sure they — and others — can find it again.

This app exists because someone walked off the path roughly 45-50 times and wants to build the cairn that keeps them on it.

The user who commissioned this app has:
- Studied ICT (Inner Circle Trader) methodology for over a year.
- Attempted roughly 45-50 funded prop-firm challenges.
- Cleared Phase 1 approximately 70% of the time.
- Cleared Phase 2 only 7-10% of the time.
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

The app is an **external discipline layer**. The user has proven (45-50 times) that willpower alone does not work during live markets. Cairn replaces willpower with structure.

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
The trader should trade **through** Cairn — lot size calculator, rule-checker, target validator — not log in Cairn **after** trading elsewhere. This is the difference between a journal traders skip and a journal that becomes indispensable.

### 2.8 Aesthetic is Functional
Good design is a feature, not a polish layer. A calm, beautiful, deliberate UI reinforces the discipline the app is teaching. A cluttered or garish UI undermines it.

### 2.9 Never Mention Specific Prop Firms in UI
The app is prop-firm-agnostic. Prop firms are configured as generic "firms" with configurable rule sets. No firm name is hardcoded or referenced in user-visible text.

### 2.10 No Reference to the User's Backstory in the App
The founding document above exists for context to whoever is building the app. The user's history (45-50 accounts, etc.) must never appear in the UI, error messages, onboarding, or any user-visible text. The app speaks to a trader, not to *this* trader's history.

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
├── CLAUDE.md                     # Root spec (slim version after split)
├── docs/                         # Split sub-specs
│   ├── philosophy.md
│   ├── design-system.md
│   ├── data-model.md
│   ├── features-v1.md
│   ├── features-v2.md
│   ├── rules-engine.md
│   ├── analytics.md
│   ├── ui-flows.md
│   ├── customization.md
│   ├── integrations-future.md
│   ├── testing.md
│   └── conventions.md
├── electron/                     # Main process
│   ├── main.ts                   # App entry, window management
│   ├── preload.ts                # Context bridge
│   ├── ipc/                      # IPC handlers grouped by domain
│   │   ├── trades.ts
│   │   ├── accounts.ts
│   │   ├── rules.ts
│   │   ├── backup.ts
│   │   └── settings.ts
│   ├── db/
│   │   ├── index.ts              # DB connection singleton
│   │   ├── schema.ts             # Drizzle schema
│   │   ├── migrations/           # Migration files, versioned
│   │   └── seed.ts               # Default data seed
│   ├── services/                 # Business logic (not UI)
│   │   ├── rules-engine.ts
│   │   ├── pnl-calculator.ts
│   │   ├── backup-service.ts
│   │   ├── import-adapters/      # v2 MT5/cTrader adapters slot here
│   │   │   └── manual.ts         # v1 "adapter" (just passthrough)
│   │   └── export-service.ts
│   └── utils/
├── src/                          # Renderer (React app)
│   ├── main.tsx
│   ├── App.tsx
│   ├── router.tsx
│   ├── assets/
│   │   ├── fonts/
│   │   └── icons/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui customized primitives
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
│   ├── features/                 # Feature modules (page + hooks + logic)
│   │   ├── dashboard/
│   │   ├── pre-trade/
│   │   ├── post-trade/
│   │   ├── analytics/
│   │   ├── accounts/
│   │   ├── settings/
│   │   └── review/
│   ├── stores/                   # Zustand stores
│   │   ├── session-store.ts      # Current session bias, trades today
│   │   ├── settings-store.ts
│   │   └── ui-store.ts
│   ├── hooks/
│   ├── lib/
│   │   ├── ipc.ts                # Typed IPC wrapper
│   │   ├── formatters.ts         # Money, pips, percentages
│   │   ├── calculators.ts        # Lot size, RR, pip value
│   │   └── cn.ts                 # Tailwind class utility
│   ├── styles/
│   │   └── globals.css
│   └── types/
│       └── index.ts              # Shared types
├── shared/                       # Types shared between main and renderer
│   └── types/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/                      # Build, migrate, seed scripts
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

Load sub-files only as needed. Each is self-contained.

| File | Contents |
|---|---|
| `docs/philosophy.md` | §1 full text — why Cairn exists, design philosophy, three jobs, voice & tone. Load when making product decisions or writing UI copy. |
| `docs/design-system.md` | §4 — colors, typography, spacing, motion, component aesthetics, Discipline Ring. Load when building any UI component. |
| `docs/data-model.md` | §5 — all SQLite tables, columns, types, indexes, migration strategy, seed data. Load when touching the database or schema. |
| `docs/rules-engine.md` | §6 — Rule/RuleContext/RuleEvaluation interfaces, all built-in rules, evaluation flow, cooldown system, override system, hard locks, session lock state. Load when touching the rules engine or any enforcement logic. |
| `docs/features-v1.md` | §7 — full feature specs: onboarding, dashboard, session bias, new trade panel, post-trade log, trade log, accounts, settings, playbook. Load when implementing any feature. |
| `docs/analytics.md` | §8 — all 6 analytics tabs in detail, filter bar, chart standards. Load when working on analytics. |
| `docs/ui-flows.md` | §9 — key user journeys: happy path, rule-block path, tilt flow, backup flow, migration-fail state. Load when implementing flows or writing E2E tests. |
| `docs/customization.md` | §10 — what's customizable globally vs per-account, custom pair/setup forms. Load when working on settings or customization features. |
| `docs/integrations-future.md` | §11 — v2 broker adapter interface, adapter list, never-features. Load when making v1 architectural decisions that must not foreclose v2. |
| `docs/testing.md` | §12 — unit, integration, E2E test requirements, manual QA checklist. Load when writing tests. |
| `docs/conventions.md` | §13 — code style, naming, commits, branching, git hooks, error handling, logging, performance budgets, accessibility, self-healing practices, build order. Load at session start for any implementation work. |

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
10. Color palette: Graphite & Citrus (dark) / Bone & Forest (light). Zero purple/cyan.
11. Fonts: Inter + JetBrains Mono.
12. v1 feature scope as listed in §7. v2 additions in §11.
13. Rule-gating is blocking by default; overrides require typed acknowledgment; hard locks cannot be overridden.
14. Prevention over detection is the app's north star.

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

---

## 16. END STATE DEFINITION (WHAT "V1 DONE" MEANS)

v1 is complete when:

1. A user can install, onboard, and configure an account in under 10 minutes.
2. A user can log a session bias in under 60 seconds.
3. A user can submit a pre-trade plan with full rule gating in under 60 seconds (with prior context loaded).
4. A user can log a trade close with full reflection in under 60 seconds.
5. Every rule in §6.3 is implemented, configurable, and evaluated correctly.
6. Dashboard renders accurate live stats for the active account.
7. Analytics tabs 1-5 are fully functional with 500+ trade datasets.
8. Backup and restore work cleanly, including cross-device via pen drive.
9. Dark and light modes both ship polished.
10. All motion respects reduced-motion preference.
11. All of §13.11 self-healing behaviors are in place.
12. Critical paths in §12.4 pass E2E.
13. No console errors in normal use.
14. Performance budgets in §13.9 are met.
15. App packages successfully for Windows (NSIS), macOS (DMG), Linux (AppImage).

When all 15 are true, v1 ships. v2 planning begins the same day.

---

*A cairn is a stack of stones placed on a trail to mark the way. Each stone is deliberate. Each stone stays where it's placed.*

*Build the stack.*
