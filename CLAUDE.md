# CLAUDE.md — CAIRN

**Project:** Cairn — A Discipline-First Trading Journal
**Version:** 2.0 Specification (extends v1.1)
**Author of spec:** Trading coach collaboration
**App creator credit:** Designed & built by Jai Akash
**Intended build tool:** Claude Code (Anthropic)

---

## 0. HOW TO USE THIS DOCUMENT

This is the slim root spec for Cairn. Full detail lives in `/docs/*.md` sub-files. Load only the sub-files relevant to your current task — don't load all of them at once.

**Source of truth.** This root file is the single source of truth for the principles and architecture it holds inline — **§2 (core principles), §3 (tech stack), §14 (locked decisions)**, plus the decision-shaping essentials of §1. For sections that have been extracted to `docs/*.md` — §1 full narrative (`philosophy.md`), §15 (`glossary.md`), §16 (`end-state.md`), §17.6 (`build-status.md`), §18 (`roadmap-v2.0.md`), §19 (`engineering-quality.md`), §20 (`subscription-contract.md`) — the linked doc file is the source of truth and the root keeps only a pointer/summary. When anything conflicts with an assumption, prior message, or intuition, follow this document and the doc file it points to.

**Navigation map:** See §4 below for a pointer to every sub-file and what it covers.

**Current version:** v2.0. See §17 for the v1.1 delta and §18 for the v2.0 cloud / sync / subscription roadmap. v1.1's "local-only" language is preserved for context but is **amended** by §2.4 (revised), §3 (extended), §18, §19, and §20 below.

**Reading order for any new contributor (human or AI):** §1 (why) → §2 (principles, including the new §2.12–2.14) → §3 (stack, including backend + web + payments) → §18 (v2.0 architecture & roadmap) → §19 (engineering quality, no slop) → §20 (subscription-readiness) → relevant `docs/*.md` sub-files.

---

## 1. FOUNDING DOCUMENT — WHY CAIRN EXISTS

> Full founding narrative (problem, philosophy, three jobs, what-it's-not, voice) lives in [`docs/philosophy.md`](docs/philosophy.md). The decision-shaping essentials are kept inline below because every feature decision references them.

**The problem.** This is a discipline-and-process problem, not a knowledge gap (~80% discipline, ~20% knowledge). The trader knows how to take a good trade but lacks the system that prevents bad ones. Every feature solves one pattern: **"I know the rule. I break the rule. I lose. I promise to follow the rule. I break it again."** Cairn is an **external discipline layer** — it replaces willpower with structure. Most journals are a *record of what you did*; Cairn is a *system that changes what you do*.

**The tie-breakers (apply to every decision):**
- A nicer report vs. a rule that prevents a bad trade → prevent the bad trade.
- A faster log entry vs. a field that forces self-awareness → force the self-awareness.
- A generic analytic vs. an ICT-specific analytic → go ICT-specific.
- A friendly nudge vs. a hard block when a rule is breaking → hard block.

**The three jobs (a feature must serve one, or it doesn't belong in v1):** (1) prevent rule violations in real time, before the click — not detect afterwards; (2) capture complete, honest data on every trade, with no escape hatch for laziness or tilt; (3) transform that data into insights that change behavior week over week.

**What Cairn is NOT:** not a charting tool (user trades on TradingView + MT5); not a social platform (no sharing/feeds/comparisons); not a coach (it enforces the user's *own* pre-committed rules, gives no advice during trades); not tied to any prop firm (neutral, configurable); not cloud-first — **local-first**, fully usable offline forever. v2.0 adds optional E2E-encrypted sync where the server is architecturally incapable of reading user content (see §2.4, §18).

**Voice (UI copy):** like a respected mentor — direct, calm, honest. Never cutesy, alarmist, or patronizing. ❌ "Oops! You've hit your daily limit! 🎉" → ✅ "Daily loss limit reached. Session closed." ❌ "Great job, champion!" → ✅ "Trade closed. +2.3R. Rules: clean." ❌ "Are you sure you want to move your stop loss?" → ✅ "You are moving SL against you. This violates Rule 4 on this account. Proceed anyway?"

---

## 2. CORE PRINCIPLES — NON-NEGOTIABLE

These principles override any other consideration in the app. If an implementation decision seems to contradict one of these, stop and re-read.

### 2.1 Prevention Over Detection
The app must block rule-breaking actions in real time wherever possible. Post-hoc analytics are secondary. If a rule can be checked before the trade is placed, it must be.

### 2.2 Friction in the Right Places
Logging a trade must be fast (under ~90 seconds total round-trip). Breaking a rule must be slow (friction, warnings, typed confirmations). The app should be easy to use correctly and hard to use incorrectly.

### 2.3 Honesty Forcing Functions
Fields that require self-awareness (invalidation, emotional state, rules-broken) must be structured so that skipping them is either impossible or explicitly acknowledged. Never default these to "N/A."

### 2.4 Local-First, Privacy-First (revised in v2.0)
All data is the user's. The desktop app stays fully usable offline forever; the local SQLite database is the canonical store on the user's machine. No telemetry is collected by default — any telemetry (e.g. Sentry crash reports) is **opt-in** and the opt-in defaults to **off**.

In v2.0, Cairn adds **optional end-to-end-encrypted cloud sync** for paid users. The privacy contract is non-negotiable:
- Data is encrypted on the client *before* it leaves the device using a data key wrapped by a key-encryption key (KEK).
- The KEK is derived from the user's password via Argon2id; the KEK never leaves the client.
- The server stores **only ciphertext** and the wrapped data key. The server is architecturally incapable of reading trades, accounts, journals, or any user content.
- Free users never have any vault data on the server — only an account record exists if they signed up at all, and even signing up is optional for the desktop app.
- Cancelling a subscription stops sync but never deletes the user's local data.

See §18 for the v2.0 architecture and `docs/security.md` for the full threat model.

### 2.5 Data Integrity is Sacred
This is a financial app. Money-adjacent calculations must be correct to the cent/pip. All arithmetic uses appropriate decimal types (`decimal.js` or `big.js`), never floats. All P&L math is tested with property-based tests. All database writes are transactional. All migrations are tested forward and backward.

### 2.6 Extensibility Without Rework
The user will add v2 features (broker adapters), v2.0 cloud sync, and future subscription tiers. Every architectural decision must accommodate the next layer without requiring rewrites. The data model, component structure, state management, and transport layer are all designed to be added to, never ripped up.

### 2.7 The App is a Cockpit, Not a Notebook
The trader should trade **through** Cairn — lot size calculator, rule-checker, target validator — not log in Cairn **after** trading elsewhere.

### 2.8 Aesthetic is Functional
Good design is a feature, not a polish layer. A calm, beautiful, deliberate UI reinforces the discipline the app is teaching. **As of 2026-07-10 Cairn's visual language is Nvexis "The Almanac"** (brand bible: `DESIGN-GUIDELINES.md`; app spec: `docs/design-system.md § v3.0`): two inks on aged paper — **oxblood on parchment**, set in Fraunces/Spectral/IBM Plex Mono on a disciplined editorial grid. It is **flat**: no neon, glass, gradients, glow, or blur — character comes from the type and the rules (hairlines, masthead double-rules, oxblood eyebrows, folios). **Day (parchment) is the default; Night (ink) is its pair.** P&L follows the ledger convention (gains = ink "in the black", losses = signal red, brand/emphasis = oxblood). *(This supersedes the earlier glassmorphism and v2.1 Neon Cockpit HUD directions, retained in `docs/design-system.md` for history.)*

### 2.9 Never Mention Specific Prop Firms in UI
The app is prop-firm-agnostic. Prop firms are configured as generic "firms" with configurable rule sets. No firm name is hardcoded or referenced in user-visible text.

### 2.10 No Reference to the User's Backstory in the App
The founding document above exists for context. The user's history must never appear in the UI, error messages, onboarding, or any user-visible text.

### 2.11 Everything User-Configurable is User-Configurable
Any behavioral preference — timezone, leverage, risk %, daily trade limit, loss circuit breaker, R-target alerts, default pairs — must be configurable in Settings. Defaults are sensible starting points, not constraints.

### 2.12 No Slop. Ever. (NEW in v2.0)
Cairn is built to be put in front of strangers in many countries. **Slop coding is banned.** The full standard is in §19. Headlines:

- TypeScript strict mode. No `any`. No `// @ts-ignore` without a linked issue. No `eslint-disable` without an inline reason.
- Every input validated at every boundary (IPC, HTTP, DB-read-back). Zod schemas, no exceptions.
- Every async path awaited or explicitly `void`-ed; no floating promises.
- Every error typed. The result type `{ ok: true, data } | { ok: false, error }` extends from IPC to HTTP to internal services.
- Every monetary or pip calculation uses decimal types, never floats. Tested with property-based tests.
- Every migration is idempotent and tested forward + backward.
- Every dependency is pinned, audited weekly, license-checked. GPL/AGPL transitives fail CI.
- Every PR is reviewed (by a human or by Claude Opus in code-review mode). Nothing merges from a single voice.
- Every secret is in env vars or a secret manager. Never in source. `gitleaks` runs in CI.
- Every public surface has tests. Coverage gate ratchets up, never down.

If a change cannot meet this bar, it does not ship. Time pressure does not lower the bar.

### 2.13 Security-First (NEW in v2.0)
Cairn touches a person's trading psychology and (with subscriptions) their payment information. The security posture matches:

- Threat model lives in `docs/threat-model.md` and is reviewed every quarter.
- End-to-end encryption for all synced user content. The server stores ciphertext only.
- Argon2id for password hashing, with a server-side pepper from env. Bcrypt and SHA variants are banned.
- Auth uses short-lived JWT access tokens (≤ 15 min) + opaque rotating refresh tokens, with refresh-reuse detection (a token used twice means session compromise — all tokens for that family are immediately revoked).
- Rate limiting on every auth endpoint (per IP and per identifier).
- All HTTP responses use `helmet` headers, strict CSP, `__Host-` cookies with `SameSite=Strict + Secure + HttpOnly`.
- All webhook receivers verify signatures and dedupe via an idempotency table.
- Dependencies scanned in CI (`npm audit`, `trivy`, `gitleaks`, optionally `socket.dev`). High/critical findings block release.
- OWASP ASVS Level 2 checklist tracked in `docs/asvs-checklist.md`.

### 2.14 Subscription-Ready by Design (NEW in v2.0)
The codebase is designed from day one so that turning subscriptions on is a configuration change, not a refactor. This is true even before a single paid feature exists. See §20 for the full contract. Headlines:

- All paid-feature gates pass through one `EntitlementService.canUse(userId, feature)` call. No `if (user.plan === 'pro')` scattered through the codebase.
- Payment integration sits behind a `BillingProvider` interface. Stripe is provider #1, Razorpay is provider #2, Dodo Payments is provider #3 (the default gateway for every country when configured — a Merchant of Record that handles India GST + international tax); adding Paddle / LemonSqueezy later is a class, not a rewrite.
- Webhook handlers are idempotent (idempotency-key table) and signature-verified.
- Subscription state has a single canonical source (the `subscription` table in Postgres, synced from provider webhooks). Never read directly off the provider's API in hot paths.
- Trial, grace period (soft + hard), dunning, and cancellation flows are first-class state transitions, not afterthoughts.

---

## 3. TECH STACK & ARCHITECTURE

### 3.1 Stack

#### 3.1a Desktop client (v1.x — already scaffolded)

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Electron (latest stable) | Desktop app, Win/Mac/Linux, mature ecosystem |
| Renderer | React 18+ with TypeScript (strict mode) | Type safety for financial math |
| Build tool | Vite (via electron-vite) | Fast HMR, modern defaults |
| Styling | Tailwind CSS | Rapid styling, design-token friendly |
| Components | shadcn/ui (customized) + custom | Polished baseline, full control |
| Animation | Framer Motion | Physics-based motion, declarative |
| State | Zustand | Simple, boilerplate-free, TypeScript-native |
| Database (local) | SQLite via better-sqlite3 | Fast, synchronous, zero-config |
| ORM / Migrations | Drizzle ORM | Type-safe queries; same ORM on server enables shared types |
| Charts | Recharts | React-native, customizable, good defaults |
| Forms | React Hook Form + Zod | Validation + type inference |
| Date/Time | date-fns + date-fns-tz | Timezone-critical for killzones |
| Money | decimal.js or big.js | Never use floats for currency or pips |
| Crypto (client) | libsodium-wrappers / @stablelib | Argon2id KDF + XChaCha20-Poly1305 AEAD |
| OS keychain | keytar | Cache unwrapped data key at rest |
| Icons | Lucide React | Clean, consistent |
| Fonts | Fraunces (display), Spectral (body), IBM Plex Mono (numbers) | Nvexis "The Almanac" — serif signature; mono for every figure |
| Packaging | electron-builder | NSIS installer, DMG, AppImage, signed + notarized |

#### 3.1b Backend API (v2.0 — NEW)

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js LTS + TypeScript strict | Same language and types end-to-end |
| Framework | Fastify | Fast, schema-first, mature TS support |
| Database | Postgres (managed: Supabase or Neon) | ACID, JSONB for vault blobs, PITR backups, multi-region |
| ORM / Migrations | Drizzle ORM | Same as client; types shared via workspace package |
| Validation | Zod | Same as client; one schema definition reused at IPC + HTTP |
| Auth — hashing | @node-rs/argon2 (Argon2id + pepper) | Industry-leading password hashing |
| Auth — tokens | JWT access (≤ 15 min) + opaque rotating refresh | Refresh-reuse detection |
| Email | Resend or Postmark | Transactional only, no marketing |
| Cache / queues | Redis (managed: Upstash) | Rate-limit data, entitlement cache, job queue |
| Logging | pino + request-id propagation | Structured, PII-scrubbed |
| Error tracking | Sentry (opt-in for client, always-on for server) | Both processes |
| Tracing | OpenTelemetry → Grafana Tempo / Honeycomb | API → DB spans |
| Rate limiting | @fastify/rate-limit + Redis | Per-IP and per-identifier |
| Security headers | @fastify/helmet, strict CSP, CORS allowlist | Default-deny |
| Hosting (API) | Fly.io / Railway / Render (managed) | Multi-region capable, low ops |
| Hosting (DB) | Supabase or Neon | PITR backups, managed |
| Container | Docker (multi-stage build, distroless final) | Reproducible, minimal attack surface |

#### 3.1c Web client (v2.0 — NEW)

| Layer | Choice | Rationale |
|---|---|---|
| Build | Vite (separate config from desktop) | Same React UI, different transport |
| Transport | `Transport` interface; `HttpTransport` impl | Mirrors `ElectronTransport` on desktop |
| Local cache | IndexedDB (via idb-keyval or Dexie) | Decrypted vault held in-browser only |
| Offline | Service Worker (read-only offline) | PWA-lite |
| Hosting | Cloudflare Pages or Vercel | Edge static + functions for auth callbacks |
| Cookies | `__Host-` prefix, `SameSite=Strict`, `Secure`, `HttpOnly` (refresh) | Access token in memory only |

#### 3.1d Payments (v2.0 — NEW)

| Layer | Choice | Rationale |
|---|---|---|
| Provider abstraction | `BillingProvider` interface in `apps/server/src/billing/` | Adding new providers later is a class, not a rewrite |
| Provider #1 | Stripe (global) + Stripe Tax | Industry default, best primitives |
| Provider #2 | Razorpay (India: UPI, INR cards) + GST handling | Indian-market friction reducer |
| Provider #3 (default) | Dodo Payments (Merchant of Record) — India GST + international tax in one | Default gateway for every country when configured; single MoR handles tax/invoicing worldwide |
| Entitlements | `EntitlementService` (Postgres + Redis cache) | Single source of truth for "is user X entitled to feature Y" |
| Webhooks | Signature verify + idempotency table | Reject replays, dedupe deliveries |

### 3.2 Package Manager & Node Version
- Use `pnpm` (faster, disk-efficient, strict).
- Node version pinned via `.nvmrc` (latest LTS at time of build).
- `engines` field in each `package.json` enforces Node version.
- v2.0: repo becomes a **pnpm workspace monorepo** (see §3.3 below).

### 3.3 File Structure

**v1.x layout (current — preserved as-is during the v2.0 monorepo move):**

```
cairn/
├── CLAUDE.md
├── docs/
│   ├── philosophy.md
│   ├── design-system.md          # v3.0: Nvexis "The Almanac" (oxblood on parchment); see DESIGN-GUIDELINES.md
│   ├── data-model.md             # v1.1: leverage, partial close, screenshot
│   ├── features-v1.md            # v1.1: risk calculator, draft activation, pairs list
│   ├── features-v2.md
│   ├── rules-engine.md           # v1.1: daily trade limit, max daily loss circuit breaker
│   ├── analytics.md
│   ├── ui-flows.md
│   ├── customization.md          # v1.1: timezone, leverage, R-target alerts
│   ├── integrations-future.md
│   ├── testing.md
│   └── conventions.md
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   ├── ipc/
│   ├── db/
│   ├── services/
│   └── utils/
├── src/
│   ├── components/
│   ├── features/
│   ├── stores/
│   ├── hooks/
│   ├── lib/
│   └── types/
├── shared/types/
├── tests/{unit,integration,e2e}/
├── scripts/
├── .nvmrc · package.json · pnpm-lock.yaml
├── tsconfig.json · tsconfig.node.json
├── vite.config.ts · electron-builder.yml
├── tailwind.config.ts · postcss.config.js
└── .env.example
```

**v2.0 monorepo layout (extends the v1.x layout above; the existing `electron/` and `src/` move under `apps/desktop/` via `git mv`):**

```
cairn/
├── pnpm-workspace.yaml           # v2.0: workspace root
├── apps/
│   ├── desktop/                  # existing electron/ + src/ moved here
│   │   ├── electron/
│   │   └── src/
│   ├── web/                      # v2.0 NEW — same React UI via HttpTransport
│   │   ├── src/
│   │   ├── public/
│   │   └── vite.config.ts
│   └── server/                   # v2.0 NEW — Fastify API
│       ├── src/
│       │   ├── auth/             # signup, login, JWT, refresh rotation
│       │   ├── billing/          # BillingProvider, Dodo/Stripe/Razorpay, entitlements
│       │   ├── vault/            # ciphertext push/pull endpoints
│       │   ├── devices/
│       │   ├── webhooks/
│       │   └── db/               # Drizzle schema for server tables
│       ├── tests/
│       └── Dockerfile
├── packages/
│   ├── shared-types/             # types used by desktop + web + server
│   ├── shared-zod/               # Zod schemas reused across boundaries
│   ├── sync-protocol/            # vector-clock + op-log types
│   └── billing-types/            # plan + entitlement matrix
├── ops/
│   ├── dashboards/               # Grafana JSON
│   └── runbooks/
└── docs/                         # extended in v2.0 — see §4
```

The monorepo move is mechanical (a `git mv` plus import-path rewrites) and is the first task in Stage 1 of §18. Git history is preserved.

### 3.4 Process & Service Architecture

- **Desktop main process** owns: local SQLite, file system, OS integration, backup service, window management, **sync runner** (v2.0), **OS keychain access** (v2.0).
- **Desktop renderer process** owns: UI, transient UI state, user interactions.
- **Desktop communication:** typed IPC only. No `remote` module. Context isolation enabled. Preload exposes a narrow, typed API.
- **Web client** (v2.0): same renderer code, but the `Transport` interface is fulfilled by `HttpTransport` instead of `ElectronTransport`. Client-side decryption happens in-browser; plaintext never traverses the network.
- **Server** (v2.0): single Fastify app, stateless (except Redis cache + rate-limit data), behind a load balancer. Postgres is the source of truth. The server never decrypts user vault content.

### 3.5 Typed IPC / HTTP Pattern

Every boundary call — IPC on desktop, HTTP on web — follows the same shape:

1. Has a defined input Zod schema and output type, **sourced from `packages/shared-zod/`** so desktop and web share one definition.
2. Is registered in a handler map: `electron/ipc/index.ts` (desktop) or `apps/server/src/routes/index.ts` (server).
3. Is accessed from the UI through the typed `Transport` interface — never directly.

### 3.6 Transport Abstraction (v2.0)

```ts
// packages/shared-types/src/transport.ts
export interface Transport {
  call<K extends keyof Procedures>(
    name: K,
    input: Procedures[K]['input']
  ): Promise<Result<Procedures[K]['output']>>;
}
```

`ElectronTransport` (desktop) forwards over IPC. `HttpTransport` (web) forwards over `fetch`. Renderer code depends only on `Transport`, so adding new surfaces in the future (e.g. a CLI or a future mobile app) is just a new implementation.

### 3.7 Result Contract (universal)

```ts
// packages/shared-types/src/result.ts
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

Error codes are enumerated in `packages/shared-types/src/error-codes.ts`. UI maps codes to copy; never displays raw error strings from the server.

---

## 4. DOCS NAVIGATION MAP

Load sub-files only as needed. Each is self-contained. Files marked **[v1.1 updated]** have new sections appended at the bottom under `## v1.1 Additions`. Files marked **[v2.0 NEW]** are created during the relevant stage in §18.

| File | Contents |
|---|---|
| `docs/philosophy.md` | §1 full text — why Cairn exists, design philosophy, three jobs, voice & tone. |
| `docs/design-system.md` | Colors, typography, spacing, motion, component aesthetics, Discipline Ring. **[v3.0 — 2026-07-10]** — Nvexis "The Almanac": oxblood-on-parchment, Fraunces/Spectral/IBM Plex Mono, flat paper (no neon/glass/glow), Day default + Night, ledger P&L convention, responsive-modal law. Brand bible: `DESIGN-GUIDELINES.md`. Earlier glassmorphism + v2.1 Neon HUD retained for history. |
| `docs/data-model.md` | All SQLite tables, columns, types, indexes, migration strategy, seed data. **[v1.1 updated]** — leverage column, partial_closes table, screenshot_path column, trade duration fix. **[v2.0]** — sync columns (UUIDv7, updated_at, deleted_at, device_id, version, dirty), vault_meta, sync_queue tables. |
| `docs/rules-engine.md` | Rule/RuleContext/RuleEvaluation interfaces, all built-in rules, evaluation flow, cooldown system, override system, hard locks, session lock state. **[v1.1 updated]** — daily trade limit, max daily loss circuit breaker. |
| `docs/features-v1.md` | Full feature specs: onboarding, dashboard, session bias, new trade panel, post-trade log, trade log, accounts, settings, playbook. **[v1.1 updated]** — risk calculator, draft activation, partial close, screenshot, win/loss streak, keyboard shortcuts, PDF export, trade duration fix. |
| `docs/analytics.md` | All 6 analytics tabs in detail, filter bar, chart standards. |
| `docs/ui-flows.md` | Key user journeys: happy path, rule-block path, tilt flow, backup flow, migration-fail state. |
| `docs/customization.md` | What's customizable globally vs per-account, custom pair/setup forms. **[v1.1 updated]** — timezone (default America/New_York), leverage (default 100:1), default pairs, daily trade limit, max daily loss %, R-target alert levels. |
| `docs/integrations-future.md` | v2 broker adapter interface, adapter list, never-features. **[updated]** — points to `docs/broker-integration.md` for the decided live design. |
| `docs/broker-integration.md` | **[Wave 4 NEW]** — binding spec for live MT5 (EA→localhost socket bridge) + cTrader (Open API) integration: `BrokerEvent` contract, configurable auto-log model (draft-awaiting-context vs fully-auto), real-time rule detection, dedupe with statement imports, read-only/never-execute boundary, security posture. Source of truth for `prompts.md` §8.7 and `docs/roadmap-v1.2.md` §6.1. |
| `docs/testing.md` | Unit, integration, E2E test requirements, manual QA checklist. |
| `docs/conventions.md` | Code style, naming, commits, branching, git hooks, error handling, logging, performance budgets, accessibility, self-healing practices, build order. |
| `docs/backend-architecture.md` | **[v2.0 NEW]** — Fastify API design, endpoint surface, deployment topology, multi-region considerations. |
| `docs/sync-protocol.md` | **[v2.0 NEW]** — Vector clocks, push/pull protocol, conflict resolution, op-log shape, device enrollment, recovery phrase. |
| `docs/security.md` | **[v2.0 NEW]** — Crypto primitives, KDF params, data-key wrap/unwrap, recovery phrase, KEK rotation, OS keychain usage. |
| `docs/threat-model.md` | **[v2.0 NEW]** — STRIDE per component, attacker classes, mitigations matrix mapped to code. |
| `docs/asvs-checklist.md` | **[v2.0 NEW]** — OWASP ASVS Level 2 row-by-row tracking with evidence links. |
| `docs/billing.md` | **[v2.0 NEW]** — Plan/feature matrix, entitlement service contract, grace period policy, how to add a new BillingProvider. |
| `docs/runbook.md` | **[v2.0 NEW]** — Incident response, key rotation, GDPR/DPDP export & deletion procedures, backup restore drill, code signing/notarization & release pipeline (§7). |
| `docs/launch-checklist.md` | **[Stage 7 NEW]** — 30-item public-launch gate (legal/product/tech/comms) and the soft-launch plan (invite list, 14-day stability window, daily-log template, public-launch trigger condition). |
| `docs/adr/` | **[v2.0 NEW]** — Architecture Decision Records. ADR-0001 is the local-first + E2E sync decision. |
| `docs/roadmap-v1.2.md` | **[v1.2 NEW]** — Friction-reduction & free-parity roadmap that sits between v1.1 and v2.0. Five-wave plan (Foundation → Friction quick-wins → Automations → File import + two-phase logging → Live broker integration), automation deployment schedule, TradeZella positioning, and v1.2 end-state criteria. Source of truth for §17.5 and §16.c below. |
| `docs/glossary.md` | Extracted §15 — ICT/SMC terms plus v2.0 crypto/billing vocabulary. |
| `docs/end-state.md` | Extracted §16 — full "done" checklists for v1.1 (§16.a), v2.0 (§16.b), v1.2 (§16.c). |
| `docs/roadmap-v2.0.md` | Extracted §18 — eight-stage cloud/sync/billing delivery plan with per-stage prompts and model table. |
| `docs/engineering-quality.md` | Extracted §19 — the binding "no slop" engineering standard. |
| `docs/subscription-contract.md` | Extracted §20 — subscription-readiness contract (entitlements, billing provider, webhook/state machine). |
| `docs/build-status.md` | Extracted §17.6 — the build/verification progress log: what is actually built vs planned, per-item commit hashes, five-gate tables, resolved review issues, repo-hygiene notes. **Update at the end of every wave.** CLAUDE.md §17.6 keeps only a current-status headline. |

---

## 14. APPENDIX — DECISIONS LOCKED

The following decisions are **locked** and should not be revisited without explicit user confirmation:

1. Electron, not Tauri.
2. Manual entry in v1, broker adapters in v2.
3. Local SQLite remains the canonical store on every desktop install.
4. Cloud backup via existing desktop sync services (user points to a synced folder), not via cloud APIs. **In v2.0, additionally:** optional end-to-end-encrypted cloud sync via Cairn's own backend.
5. No news integration, ever (per user direction).
6. No prop firm names hardcoded in UI.
7. No user-history references in UI (founding document context only).
8. App name: **Cairn**.
9. Attribution: "Designed & built by Jai Akash" in sidebar bottom-left, nowhere else.
10. **Design language: Nvexis "The Almanac"** — **Day (parchment) default / Night (ink) available**. _Amended 2026-07-10: user-directed adoption of the Nvexis brand bible (`DESIGN-GUIDELINES.md`), superseding the 2026-07-09 Neon Cockpit HUD, which had itself overridden the original glassmorphism decision._ Two inks on aged paper — **oxblood (`--info`/`--primary`/`--ring`/`--ox`) on parchment**; flat editorial paper with **no neon, glass, gradient, glow, or blur**. Ledger P&L semantics: gains/clean = ink (`--accent-a`, "in the black"), loss/violation = signal red (`--danger`), caution = gilt (`--warning`), secondary data = umber (`--accent-b`). Numbers stay mono (IBM Plex Mono) and WCAG-AA legible. Token names were preserved so the whole app re-skinned through the token layer. Full spec + token table: `docs/design-system.md` § "v3.0 Nvexis 'The Almanac' (2026-07-10)".
11. Fonts: Fraunces (display) + Spectral (body) + IBM Plex Mono (numbers). _(Amended 2026-07-10; was Inter + JetBrains Mono.)_
12. v1 feature scope as listed in §7 (plus v1.1 additions in §17). v2 additions in §11. v2.0 cloud/sync/billing scope in §18.
13. Rule-gating is blocking by default; overrides require typed acknowledgment; hard locks cannot be overridden.
14. Prevention over detection is the app's north star.
15. Screenshot attachment on trade entry is **always optional** — never required, never blocks trade submission.
16. Default timezone is **America/New_York**. User can change it in Settings.
17. All behavioral preferences (timezone, leverage, daily trade limit, max loss %, R-target alerts, default pairs) are user-configurable in Settings.

### v2.0 additions to locked decisions

18. **Local-first remains canonical.** The desktop app works fully offline forever, with or without an account.
19. **Cloud sync is end-to-end encrypted.** Server is incapable of reading user content. No "admin override," no backdoor.
20. **Surfaces in v2.0:** desktop (Electron) and web (browser). No mobile in v2.0.
21. **Backend stack:** Node.js LTS + TypeScript strict + Fastify + Postgres (managed: Supabase or Neon) + Drizzle. Same ORM as the client.
22. **Auth stack:** Argon2id + pepper, JWT access ≤ 15 min + opaque rotating refresh, refresh-reuse detection, email verification required for sync, magic-link supported, OAuth (Apple/Google) stubbed.
23. **Payments:** Dodo Payments (default Merchant-of-Record gateway — India GST + international tax), with Stripe (global) + Razorpay (India) as fallbacks, all behind a generic `BillingProvider` interface.
24. **Entitlements:** single source of truth via `EntitlementService`. No scattered plan checks.
25. **No slop. Ever.** §19 is binding. TypeScript strict, no `any`, every input validated, every promise awaited, money in decimal types, every migration tested, every secret out of source.
26. **Security baseline:** OWASP ASVS Level 2. `gitleaks`, `trivy`, `npm audit` in CI. Threat model in `docs/threat-model.md`, refreshed quarterly.
27. **Telemetry is opt-in and defaults to off.** Crash reports, usage analytics — all opt-in. The server logs its own operation, never user content.
28. **Cancellation never deletes local data.** A user who cancels Cairn Pro keeps everything on their machine, indefinitely.
29. **No mobile in v2.0.** Mobile is explicitly out of scope. If added later, it gets its own version.

### v1.2 additions to locked decisions

30. **Strategic positioning vs TradeZella.** Cairn does not chase TradeZella feature-for-feature on reports, replay, backtesting and education. The moat is **real-time, broker-aware prevention** — the rule engine, hard locks, circuit breakers, and (eventually) live broker detection of SL widening / over-trading. TradeZella, by their own positioning, does not prevent trades or enforce rules in real time. That is the gap Cairn is built into.
31. **The v1.2 cycle is local-only and zero new infra cost.** It sits between v1.1 (now) and the v2.0 cloud/sync/billing rebuild in §18, and is delivered in five waves: Foundation → Friction quick-wins → Automations → File import + two-phase logging → Live broker integration. Detail in `docs/roadmap-v1.2.md`.
32. **Two-phase logging is the structural pattern for trade entry/close.** The pre-trade *gate* stays in the moment (rule check is non-negotiable, target ≤ 20 s). The post-trade *journal* is deferred into a batched reflection queue surfaced on the Review screen. The gate protects discipline; the queue captures honest reflection without front-loading it onto the close click. Hard locks and override-acknowledgement remain unchanged.
33. **File-based statement import (free) is the first import path, not live broker API (paid).** MT5 / cTrader / TradingView all export HTML/CSV statements at no cost. A file-parsing adapter eliminates most double-entry friction without paid data or connector fees. Live broker integration is Wave 4 and is optional; the project must remain useful even if Wave 4 never ships.
34. **The "local insight engine" is local heuristics, not an LLM call.** Wave 2's insight surfacing — "win-rate ↓ when urgency > 7", tilt-cycle detection, expectancy-by-setup callouts — runs as deterministic statistical rules on-device. No paid model, no network round-trip, no telemetry. Preserves the privacy-first posture from §2.4.
35. **Review screen completion is a foundation deliverable, not an enhancement.** It is the home for Wave 2 insights and Wave 3's deferred-reflection queue. v1.2 cannot be called done while it remains a stub.
36. **The two partial-close tables (`trade_partials` integer, `partial_closes` real) must be reconciled to a single integer-encoded table before any Wave 2 analytics work.** Storing money or pips as `real`/`float` contradicts §2.5 and §19.5 and will surface as silent disagreement between reports.

### Wave 4 additions to locked decisions (live broker integration)

Full spec: `docs/broker-integration.md`. Build prompts: `prompts.md` §8.7.

37. **Cairn is read-only against brokers, forever.** Live integration reads fills, modifications and closes; it NEVER places, modifies, or closes a broker order. No adapter or EA contains an order-execution code path; a test enforces this. This is a hard safety boundary and reinforces the existing never-feature (§14 #6 / `docs/integrations-future.md` §11.3). It also satisfies the financial-action policy: Cairn does not execute trades or move money.
38. **MT5 connects via a local Expert Advisor → `127.0.0.1` socket bridge; cTrader via the official Open API.** The MT5 EA is read-only, token-authenticated, and the Cairn listener is loopback-only (binds `127.0.0.1`, never `0.0.0.0`) — the most local-first option, instant enough for real-time detection. The MT5 Python package (Windows-only, poll-based) is explicitly NOT the chosen path. cTrader uses OAuth 2.0 with read-only scopes; tokens live in the OS keychain. cTrader is the one place events transit a third party (Spotware) — disclosed in Settings; no vault content is ever sent.
39. **Auto-log is configurable; the default never fabricates honesty data.** Both transports normalise to one internal `BrokerEvent` stream. Default mode is **draft-awaiting-context** (mechanical fields prefilled, trade enters the Wave 3 reflection queue, honesty fields stay `unreviewed`); a Settings toggle enables **fully-auto** (complete record, never queued). `unreviewed` is never counted as `clean` in any analytic (composite score, A–F grade, clean-rate). Auto-log is capture (job #2), not pre-trade prevention (job #1); Settings copy says so.
40. **Live detection is the realisation of prevention for trades placed outside Cairn — but it warns, it does not block.** The rule engine watches the live position and raises non-blocking, mentor-voice warnings (recorded as `rule_violations`) on SL-widen / size-up / TP-cut / over-trade / post-circuit-breaker / outside-killzone. Non-blocking because Cairn cannot stop a broker order (see #37). Live trades dedupe against Wave 3 statement imports via `external_ref`. Wave 4 stays optional and isolated (§14 #31/#33); nothing in Waves 0–3 or v2.0 may depend on it.


## 15. GLOSSARY

Moved to [`docs/glossary.md`](docs/glossary.md). All ICT/SMC terms and v2.0 crypto/billing vocabulary live there. Load on demand.

---

## 16. END STATE DEFINITION

Moved to [`docs/end-state.md`](docs/end-state.md). Contains the full "v1.1 done" (§16.a), "v2.0 done" (§16.b), and "v1.2 done" (§16.c) checklists. Load when verifying completion criteria.

---

## 17. V1.1 CHANGE LOG

Shipped in v1.1. Full detail in the `## v1.1 Additions` section at the bottom of each relevant doc file.

- **Design:** Nvexis "The Almanac" visual language across all surfaces (`docs/design-system.md § v3.0`, brand bible `DESIGN-GUIDELINES.md`) — oxblood on parchment, Fraunces/Spectral/IBM Plex Mono, flat paper, Day default + Night; WCAG-AA text contrast; responsive modals (cap to viewport + scroll body); Framer Motion retained but flourishes de-glowed. *(Supersedes the earlier glassmorphism and v2.1 Neon Cockpit HUD.)*
- **Bug fixes:** discipline score updates in real time after each trade; dashboard account card shows current balance; P&L uses actual exit × lot × pip value × leverage; trade duration shows correct elapsed time.
- **New features:** risk calculator (risk $/% → auto lot size); per-account leverage used in all math; draft activation from trade log; partial close (% + partial exit); optional screenshot attachment; 19-instrument default pairs; daily-trade-limit rule; max-daily-loss circuit breaker; R-target alerts; win/loss streak on dashboard; PDF trade-review export; configurable keyboard shortcuts; timezone setting (default America/New_York). See `docs/features-v1.md`, `docs/rules-engine.md`, `docs/customization.md` (§ v1.1 each).

---

## 17.5 V1.2 CHANGE LOG — FRICTION REDUCTION & FREE PARITY

v1.2 is the local-only, zero-infra-cost cycle between v1.1 and the v2.0 rebuild (§18). **Binding plan: [`docs/roadmap-v1.2.md`](docs/roadmap-v1.2.md); this is the headline index.** It attacks *bad* friction (double entry, re-selection, self-reporting violations the engine already knows) while protecting *good* friction (rule blocks, override acknowledgement, invalidation honesty gate), and closes the zero-cost TradeZella feature gaps (calendar, notebook, playbooks, expanded reports, local insight engine, file import).

| Wave | What | Cost |
|---|---|---|
| 0 | Foundation: commit v1.1, Review screen, reconcile partial-close tables, smoke E2E | Free |
| 1 | Friction quick-wins: remember last trade, invalidation chips, one-tap emotion, clean-close, ⌘K, calendar | Free |
| 2 | Automations: auto-refresh, derived analytics, local insight engine, auto-detect rules broken, composite score, A–F grade, Notebook | Free |
| 3 | File import (MT5 / cTrader / TradingView) + two-phase logging + playbooks | Free |
| 4 | Live broker integration: MT5 (read-only EA→localhost socket bridge) + cTrader (Open API), configurable auto-log, live SL-move/over-trade detection | Optional |

Waves 0–3 are complete (see §17.6 pointer / `docs/build-status.md`). **Wave 4 is in progress (built, uncommitted on `feat/vault-enrollment-server`)** — binding spec `docs/broker-integration.md`, build prompts `prompts.md` §8.7, end-state `docs/roadmap-v1.2.md` §6.1 (#30–#36). The MT5 bridge, cTrader adapter, live detection and configurable auto-log are built; statement↔live dedupe + the conflict rule (#35, statement wins money / live wins timing) and the `enqueueSyncOp` sync-gap (#36) are now done & tested. Two production seams remain before live end-to-end: the account-map UI (`resolveAccount()` returns `null`) and the cTrader protobuf codec. It is isolated so the project stays useful even if it never ships; nothing in Waves 0–3 or v2.0 depends on it. Locked decisions: §14 #30–#36 (v1.2) and #37–#40 (Wave 4 broker). End-state criteria: §16.c (#49–#56) + `docs/roadmap-v1.2.md` §6/§6.1. Long-form rationale: `Cairn_Report_Working_Friction_vs_TradeZella.html` in the project root.

---

## 17.6 BUILD & VERIFICATION STATUS (progress log)

Full per-wave progress log moved to [`docs/build-status.md`](docs/build-status.md) — what is actually built/verified vs planned, per-item commit hashes, the five-gate tables, resolved review issues, and repo-hygiene notes. Update that file at the end of every wave.

**Current status (2026-07-12):** **P4 Dodo Payments billing COMPLETE — gates GREEN on `feat/rules-engine`** (typecheck / lint / test:unit / build / e2e / `@cairn/server` full suite all PASS with Postgres up; only the pre-existing, unrelated `docs routes smoke` red — the `ENABLE_API_DOCS=false` path, failed identically before/after P4). Dodo is an **additive** `BillingProvider` (Stripe/Razorpay untouched) and the **default gateway for every country** when configured (`selectBillingProvider`): Merchant-of-Record handling India GST + international tax. Price **$15/mo · $150/yr** (₹1,299 / ₹12,990 GST-incl.). Shipped: `billing/dodo-signature.ts` (Standard Webhooks HMAC, 5-min replay tolerance), `billing/dodo-provider.ts`, migration `0005_dodo_webhook_provider.sql` (widen `webhook_event.provider` CHECK), `POST /webhooks/dodo` + `dispatchDodoEvent` (verify→dedupe→§20.5→invalidate), `DODO_*` env + `.env.example`, price copy, `docs/billing.md`/`docs/deployment.md`/§14 #23. Mandatory §2.13 signature + idempotency + refund tests pass. Full detail: `docs/build-status.md` § "2026-07-12 — P4 Dodo Payments billing COMPLETE". _Prior status retained below._

**Prior status (2026-07-12):** **P3 (breadth/opportunity) COMPLETE — all 5 candidates shipped + committed on `feat/rules-engine`**, each with five desktop gates GREEN. (1) Live in-trade warnings surfaced as mentor-voice toasts + a Dashboard "Live Discipline" card (`13807cd`); (2) pre-trade psychology nudges — tilt + urgency, non-blocking, configurable (`13807cd`); (3) data-backed weekly review digest that pre-fills the reflection form (`e4fe4e9`); (4) embedded TradingView review chart via a sandboxed iframe, CSP `frame-src` only — P1 hardening intact (`99ea713`); (5) multi-asset contract-spec instruments — migration 0019 `tick_size`/`tick_value_cents`, `derivePipValueFromTick`, a **tick-native P&L path with a property test proving tick-path ≡ pip-path** (existing pip pairs unchanged, §2.5 preserved), and a PairsTab "Configure by Pip value | Contract spec" toggle (`aee8f76`/`5b35a28`/`da72bb7`/`bb482ea`). Full detail: `docs/build-status.md` § "2026-07-12 — P3 … COMPLETE". **Followed by a UI/design-polish round (committed + build-green):** fixed a tab-switch blank-page bug (Shell lazy-route Suspense × AnimatePresence deadlock), removed the decorative stat-card waves, added floating/embossed cards + a textured `.app-canvas` paper backdrop (grain + ambient light + vignette, day & night) and fixed the empty Discipline ring — a user-directed amendment to the flat §14 #10 aesthetic (texture/light/depth, not neon/glass); commits `75b7cc4`/`2c86ca5`/`7d51b6e`. **Lesson:** CSS/`globals.css` changes must be validated with `.\run-host-gates.ps1` (the `build` gate compiles CSS) — the husky pre-commit (typecheck/lint/format only) does NOT catch a CSS compile failure (a bad grain data-URI in `2c86ca5` broke the whole stylesheet; fixed by base64-encoding it in `7d51b6e`). Deferred: TradingView embed render QA; P4 Dodo billing. _Prior status retained below._

**Current status (2026-07-11):** P0 broker work is code-complete and the moat last-mile is built. **P0.1** compiled `CairnBridge.ex5` is bundled/installable; **P0.2** the MT5 read-only bridge is VERIFIED LIVE (heartbeats to Cairn on a MetaQuotes demo) — fill-capture QA waits for market open, and the paid on-chart gate needs an entitlement to test; **P0.4** the Spotware app (id 33053, read-only `accounts` scope, redirect `http://127.0.0.1:53129/ctrader/callback`) is registered and its Client ID/Secret are in the keychain, but cTrader connect is BLOCKED on Spotware KYC (~3 business days — OAuth requires app status "Active"). **P1 security hardening A–E DONE + committed** — `7b65faf` (A–D: backup zip-slip guard, https-in-packaged, `settings:set` key allow-list, `safeStorage`-encrypted MT5 token, renderer `sandbox:true`, strict build-time CSP) and `68bc47d` (E: keytar → `safeStorage` migration for all secrets via `secure-store.ts`). **P2 hygiene:** 13 tracked `.fuse_hidden` orphans removed + gitignored (`ffa4aec`); test-DB migrations are now journal-driven (`tests/helpers/test-migrations.ts` `applyAllMigrations`) — the ~20-file hardcoded-migration-list drift is RETIRED (adding a migration no longer touches tests); P2.C closed no-op. All five desktop gates GREEN (typecheck/lint/test:unit **1148**/build/e2e) on `feat/rules-engine`. **Deferred to P4:** Dodo Payments billing (plan + 7 slices scoped in memory `cairn-p1-security-and-billing`; needs the deferred Fastify backend running + WinNAT reset). **NEXT: P3 (breadth/opportunity)** — surface Wave-4 live in-trade warnings as a headline, psychology-driven pre-trade nudges, high-signal reports + weekly-review, TradingView replay embed, optional multi-asset. Full detail: `docs/build-status.md` § "2026-07-11 — P0 live QA + P1 security (A–E) + P2 hygiene (A–B)". _Prior 2026-07-10 status retained below for history._

**Current status (2026-07-10):** **Both broker-connectivity P0s from the 2026-07-10 full review are CLOSED, committed on `feat/rules-engine`** — the MT5 EA is now bundled into the installer with a one-click "Install Cairn EA" button (`ab7be8c`), and cTrader gained a keychain-first credential-paste UI so a stock build connects with no env vars (`feat(broker)` commit); a security pass (`fix(security)` commit) added a `will-navigate` deny + `openExternal` scheme allow-list and fixed the `paths:openFile` / `trades:addScreenshot` path sinks. All five desktop gates GREEN (111 files / 1086 tests); detail in `docs/build-status.md` § "Connectivity P0s + security hardening (2026-07-10)". v1.2 feature-complete; v2.0 cloud rebuild committed through Stage 18.6 (client crypto `e812589`; server auth/vault/billing/webhooks/docs `91c0fb2`+`15299b3`; full multi-table sync slice + enrollment/recovery + conflict UI; OpenAPI/Scalar docs). **Wave 4 (live broker) is now committed** — the two former seams landed: Settings → Integrations account-map UI (`16e22af`) and the vendored cTrader protobuf codec (`b238fdd`, `44dc9b6`); manual live-terminal QA (spec §10) is still unexercised. Stage 7 release pipeline is committed (`.github/workflows/release.yml`, signing config inert until certs exist); signing secrets, security/legal prompts, and soft launch not started. Server go-live (hosting/domain/email) deliberately deferred until the app is done. **2026-07-09 functional round + Neon Cockpit HUD (v2.1, §14 #10 amended) is now COMMITTED — `c87d209` on `feat/rules-engine` (156 files), 2026-07-10.** Landed: per-phase prop-firm accounts (migration 0016, `accounts:advancePhase`/`updatePhases`, per-phase onboarding + Accounts editing), draft-trade lifecycle fixes D1–D8 (drafts excluded from limits, activation re-runs the rules gate + re-links today's session), advanced metrics (Sharpe/Sortino/maxDD/recovery/Kelly/SQN/consistency on Dashboard + Metrics tab), and guardrail hardening (`guardrail.degraded` banner, `daily_locks` migration 0017 so the circuit breaker needs no session row, hard locks fail closed on bad config, `broker:diagnostics` + Connection-health card). The same commit fixed the gate fallout from the parallel-agent edits: `0017_daily_locks` wired into the hardcoded test-DB migration lists (draft-activation, analytics `_fixtures`, migrations.test), `accounts.ts`/`context-builder.ts` types, 4 lint fixes, and `prettier --write` across the tree. **All five desktop gates GREEN** (`run-host-gates.ps1`, 2026-07-10); installer `Cairn Setup 0.2.0.exe` rebuilt. Backend gates (postgres / `@cairn/server` / docs-smoke) stay RED — Windows WinNAT port exclusion, not code; an elevated `net stop/start winnat` + dynamicport reset frees them; deferred v2.0 backend. Full detail + host-env gotchas (Electron cache-extract fix, WinNAT reset): `docs/build-status.md` § "Functional round + Neon HUD (2026-07-09)". **Next actions:** build the MT5 on-chart pre-trade gate (`plan.md`, user-approved). Open follow-ups: web `/auth/me` restore fix, broader E2E journeys, demo mode, web read-only dashboard, release dry-run tag, and a shared journal-driven test-DB helper to retire the ~13 hardcoded migration lists. **Deferred security hardening** (need runtime/e2e verification): strict renderer CSP (externalise the inline theme script first), `sandbox:true`, `settings:set` key allow-list, keytar→safeStorage. **Broker follow-ups:** ship a pre-compiled `CairnBridge.ex5` + a Cairn-owned cTrader OAuth app, and add historical backfill for both brokers.

---

## 18. V2.0 ROADMAP — CLOUD, SYNC, SUBSCRIPTIONS, WEB

Moved to [`docs/roadmap-v2.0.md`](docs/roadmap-v2.0.md). The eight-stage delivery plan (Stage 0 quality baseline → Stage 7 launch), per-stage Claude prompts, model-selection table, and the one-paragraph architecture summary. Load when working on any v2.0 cloud/sync/billing stage.

---

## 19. ENGINEERING QUALITY STANDARD — "NO SLOP"

Moved to [`docs/engineering-quality.md`](docs/engineering-quality.md). Binding standard for type safety, boundary validation, async/error handling, money/time, migrations, deps, secrets, logging, tests, reviews, perf budgets, and the definition of "done". Referenced by §2.12 and locked in §14 #25. Load before writing or reviewing code.

---

## 20. SUBSCRIPTION-READINESS CONTRACT

Moved to [`docs/subscription-contract.md`](docs/subscription-contract.md). The `EntitlementService`/`BillingProvider` abstractions, plan-feature matrix, webhook + state-machine contracts, tax/refund/local-data guarantees. Binding from Stage 18.5 onward. Load when working on billing or entitlements.

---

*A cairn is a stack of stones placed on a trail to mark the way. Each stone is deliberate. Each stone stays where it's placed.*

*Build the stack.*
