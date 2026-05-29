<!-- Extracted from CLAUDE.md (v2.0). Loaded on demand per CLAUDE.md §0/§4 — not part of the always-in-context root. -->

## 18. V2.0 ROADMAP — CLOUD, SYNC, SUBSCRIPTIONS, WEB

v2.0 is delivered in eight stages. Each stage is a coherent shippable increment; the work order is enforced because each stage depends on the one before. Stages are written so they can be handed to Claude Code, one prompt per stage, with a recommended model.

### 18.0 The architecture in one paragraph

Each user has a **vault**. The vault contains all their trades, accounts, and settings. The vault is encrypted on the client with a data key. The data key is wrapped by a key derived from the user's password via Argon2id. The server stores only the wrapped data key and ciphertext blobs — it can authenticate the user but cannot read their trades. Free users don't have a vault on the server at all; their SQLite stays local. Paid users get sync: the desktop app pushes ciphertext deltas, the web app pulls them and decrypts in-browser. Cancelling a subscription stops sync but never deletes the user's local data.

### 18.1 When to use which model

| Use case | Model |
|---|---|
| Architecture, crypto, auth, billing, sync, anything money- or correctness-critical | **Claude Opus 4.6** |
| Feature implementation, refactors, UI, tests, docs | **Claude Sonnet 4.6** |
| Mass renames, codemods, file moves, snippet generation, one-line fixes | **Claude Haiku 4.5** |
| Code review and security review of work done by a cheaper model | **Claude Opus 4.6** |

Pattern to use throughout v2.0: have Sonnet write a feature, then in a separate session feed the diff to Opus and ask it to find bugs. Two models with fresh context catch more than one model doing both jobs.

### 18.2 Stage 0 — Engineering Quality Baseline

**Goal:** lock in §19 (no-slop standard) before adding any new code.

**Scope:** Strict ESLint (`@typescript-eslint/strict`, `no-floating-promises`, `no-explicit-any` as error). Husky + lint-staged pre-commit hooks. GitHub Actions CI (`typecheck`, `lint`, `test`, `build`) blocking merge. commitlint with Conventional Commits. `npm audit` + Renovate weekly. License-check script (fail on GPL/AGPL transitives). ADR folder + ADR-0001 (this architecture). Coverage gate at 70 % rising to 85 %. Sentry wired into both processes behind opt-in.

**Prompt (Claude Opus 4.6):**
> Read `CLAUDE.md` and `docs/conventions.md`. Implement the Stage 18.2 engineering quality baseline. Set up strict ESLint, Husky + lint-staged pre-commit hooks, GitHub Actions CI (`typecheck`, `lint`, `test`, `build`), commitlint with Conventional Commits, `npm audit` in CI, Renovate config, license-check script, ADR folder with ADR-0001 explaining the local-first + E2E sync architecture, and Sentry wired into main + renderer behind an opt-in setting that defaults to off. Do NOT add any new features. CI must currently pass before you finish — fix any existing lint or type errors you encounter. TypeScript strict mode everywhere. No `any`, no `// @ts-ignore`, no `eslint-disable` without a comment explaining why and a linked issue.

### 18.3 Stage 1 — Finish & Stabilize v1.1 Desktop

**Goal:** deliver the existing v1.1 spec to a polished, shippable state.

**Scope:** Cross-check every item in §16.a against the live app. Convert monetary math in `electron/services/pnl-calculator.ts` to `decimal.js` if needed. Verify the three existing migrations are idempotent and tested forward + backward. Verify rule engine enforces "prevention over detection" (no `console.warn` in place of a hard block). Property-based tests for P&L math via `fast-check`. Snapshot tests for analytics queries. Manual QA pass against `docs/testing.md`. Move `electron/` + `src/` to `apps/desktop/` via `git mv`.

**Prompt (Claude Sonnet 4.6, escalate to Opus 4.6 for P&L decimal conversion and rule-engine audit):**
> Read `CLAUDE.md`, then `docs/features-v1.md`, `docs/rules-engine.md`, `docs/data-model.md`, and `docs/testing.md`. Cross-check each end-state item in §16.a of `CLAUDE.md` against the current implementation in `electron/` and `src/`. For each unmet item, open a TodoWrite entry, then implement it. Convert all monetary math in `electron/services/pnl-calculator.ts` to `decimal.js`. Add `fast-check` property-based tests for lot-size calc, P&L calc with leverage, and R-multiple. Add a migration test in `tests/integration/migrations.test.ts` that runs all migrations forward + backward on a fresh DB and on a seeded DB. Move `electron/` and `src/` into `apps/desktop/` via `git mv` and update all import paths. Do NOT touch sync, backend, or auth code — that's Stage 18.4+.

### 18.4 Stage 2 — Sync-Ready Local Data Model

**Goal:** every row in the local SQLite is ready to sync, before there's anything to sync to.

**Scope:** Add UUIDv7 ids, `updated_at`, `deleted_at`, `device_id`, `version`, `dirty` columns to every syncable table. New tables: `device`, `vault_meta`, `sync_queue`. Encryption library at `apps/desktop/electron/services/crypto/` using libsodium: Argon2id KDF, XChaCha20-Poly1305 AEAD, data-key wrapping. Exhaustive tests with RFC test vectors and round-trip property tests. No record encryption is actually performed yet — this stage only adds the capability; existing local data continues to work plaintext.

**Prompt (Claude Opus 4.6):**
> Read `CLAUDE.md` (especially §2.4, §2.5, §3 backend section, and §18), `docs/data-model.md`, and the existing migrations in `apps/desktop/electron/db/migrations/`. Implement Stage 18.4: sync-ready local data model. Add UUIDv7 ids, `updated_at`, `deleted_at`, `device_id`, `version`, `dirty` columns to every syncable table (do NOT add to ephemeral / UI-state tables — list them explicitly in the migration commit message). Create `device`, `vault_meta`, and `sync_queue` tables. The `sync_queue` op shape is `{op_id, table, record_id, op_type: insert|update|delete, payload_ciphertext, created_at}`. Implement `apps/desktop/electron/services/crypto/` with libsodium: Argon2id KDF (interactive memlimit, time cost 3, 32-byte output), XChaCha20-Poly1305 AEAD for record encryption, key-wrapping for the data key. Write exhaustive tests with RFC test vectors, round-trip property tests using `fast-check`, and explicit "wrong key fails to decrypt" tests. Document key rotation and recovery-phrase plan in `docs/security.md` (create the file). NO record encryption is performed yet — this stage only adds the capability.

### 18.5 Stage 3 — Backend Core

**Goal:** stand up the API. Auth, vault storage, device registry, billing webhooks. Strong security defaults.

**Scope:** Fastify + TypeScript strict + Drizzle (Postgres) in `apps/server/`. Auth (Argon2id with env pepper, JWT access ≤ 15 min, opaque rotating refresh, refresh-reuse detection, email verification, magic link, OAuth stubs, rate limit 5 attempts / 15 min). Tables: `user`, `user_credential`, `user_session`, `device`, `vault`, `vault_blob`, `audit_log`, `subscription`, `webhook_event`. Endpoints: `/auth/*`, `/devices/*`, `/vault/manifest|push|pull`, `/billing/*`, `/health`. Zod-validate every input. Pino logging with PII redaction. `helmet`, strict CSP, CORS allowlist, JSON body size limit. Docker Compose for local Postgres + API + Mailpit. OpenAPI / Scalar docs auto-generated.

**Prompt (Claude Opus 4.6):**
> Read `CLAUDE.md` §3 backend section and §18, then create the server in `apps/server/`. Use Fastify + TypeScript strict + Drizzle (Postgres). Share types with the client via `packages/shared-types/` and `packages/shared-zod/`. Implement auth (email + password with Argon2id and env pepper, email verification, magic link, JWT access + rotating refresh tokens with refresh-reuse detection, rate limiting), device registry, vault blob storage (server treats payloads as opaque ciphertext — never decrypts, never inspects), billing webhook receivers (Stripe + Razorpay, idempotent via `webhook_event` table), and `/health`. Zod-validate every input. Pino structured logs with request id; redact `Authorization` and any field named `password`, `token`, `secret`, `ciphertext`. Add `helmet`, strict CSP, CORS allowlist from env, JSON-only body parser with size limit. Provide `docker-compose.yml` for local Postgres + API + Mailpit. Add `tests/integration/auth.test.ts` covering signup, signup-existing-email, login-bad-password rate-limit, refresh rotation, refresh-reuse detection (token theft scenario), and email-verify required for sync endpoints. NO real Stripe/Razorpay calls — mock them. NO frontend code in this stage. Write `docs/backend-architecture.md` and extend `docs/security.md` with the threat model.

### 18.6 Stage 4 — Sync Engine

**Goal:** the desktop app actually syncs to the backend, end-to-end encrypted.

**Scope:** Sync protocol with vector clocks. Push/pull endpoints. Conflict resolution: last-write-wins per-record, ties bubble up as conflict UI. Background sync runner (interval + on focus + on demand). First-login device enrollment: password → Argon2id → unwrap data key → cache in OS keychain via `keytar`. Recovery phrase (BIP-39 24-word) generated at signup, shown once. Encrypt-at-rest of cached data key.

**Prompt (Claude Opus 4.6):**
> Read `CLAUDE.md`, `docs/security.md`, and write `docs/sync-protocol.md` (first job). Then implement the sync engine on both ends. Client side: `apps/desktop/electron/services/sync/` with `push.ts`, `pull.ts`, `conflict.ts`, `clock.ts`, `runner.ts`. Background runner using a leaky-bucket-rate-limited interval, plus on-focus, plus manual. Server side: complete `/vault/push` and `/vault/pull`, vector-clock merge logic, conflict detection. Implement first-login device enrollment with password → Argon2id → unwrap data key → store in OS keychain via `keytar`. BIP-39 recovery-phrase generated at signup. UI: conflict-resolution modal in `apps/desktop/src/features/sync/`. Tests: simulate two-device offline edits with `vitest`, verify the conflict surfaces; verify wrong-password fails to unwrap; verify recovery phrase recovers the vault when password is lost; verify the server cannot decrypt (write a test that attempts to decrypt as the server and confirms it cannot). Adhere to §19 — every error path tested, no `any`, no swallowed promises.

### 18.7 Stage 5 — Web App

**Goal:** the React UI from `apps/desktop/src/` runs in a browser, authenticated, with vault sync.

**Scope:** Extract `Transport` interface; `ElectronTransport` + `HttpTransport` implementations. Web shell in `apps/web/` (separate Vite config). Login, signup, email-verify, forgot-password, OAuth callback, recovery-phrase prompt on first login on a new device. Client-side decryption only — plaintext never leaves the browser. Service Worker for offline reads. Strict CSP with nonces, SRI on external scripts, `__Host-` refresh cookie with `SameSite=Strict`, access token in memory only.

**Prompt (Claude Sonnet 4.6, escalate to Opus 4.6 for CSP/cookie/refresh-rotation):**
> Read `CLAUDE.md` §18 and `docs/sync-protocol.md`. Extract `apps/desktop/src/lib/ipc.ts` into a `Transport` abstraction with two implementations: `ElectronTransport` (current IPC) and `HttpTransport` (talks to the Stage 18.5 API). Refactor `apps/desktop/src/features/**` and `apps/desktop/src/components/**` to depend on `Transport` only — no direct IPC calls. Create `apps/web/` as a new Vite + React workspace that imports the shared `apps/desktop/src/` features and uses `HttpTransport`. Implement login, signup, email-verify, forgot-password, OAuth callback, recovery-phrase prompt, and a "Cairn Pro required" gate on sync endpoints. Add a Service Worker for offline read of the IndexedDB-cached vault. Apply strict CSP with nonces, SRI on external scripts, `__Host-` refresh cookie with `SameSite=Strict`, access token in memory only, automatic refresh on 401. Tests: Playwright e2e covering signup → verify → recovery-phrase save → sync → multi-device-conflict. NO new feature work — the web app shows exactly what the desktop already shows.

### 18.8 Stage 6 — Billing & Subscriptions

**Goal:** turn the working free-tier product into something users can pay for.

**Scope:** Generic `BillingProvider` interface. `StripeBillingProvider` + `RazorpayBillingProvider`. `EntitlementService` (single source of truth) with grace period (3-day soft, 14-day hard). Stripe Tax + Razorpay GST. Customer Portal links. Webhook signature verification + idempotency. Trial (14 days, no payment method). In-app entitlement gates on sync, web access, advanced analytics, retention windows. Pricing page, upgrade modals, dunning emails. Tests covering every webhook event, signature mismatch, replay, race conditions, refund flow.

**Prompt (Claude Opus 4.6):**
> Read `CLAUDE.md` §2.14, §3 payments section, §18 and §20, and the Stage 18.5 backend code. Implement billing. Create `apps/server/src/billing/`: a `BillingProvider` interface plus `StripeBillingProvider` and `RazorpayBillingProvider`. Implement `EntitlementService` with single-source-of-truth lookup, 14-day grace period, and a configurable plan/feature matrix in `apps/server/src/billing/plans.ts`. Webhook handlers must verify signatures, dedupe via the `webhook_event` table from Stage 18.5 (extend if needed), and produce an `audit_log` row per state change. Add `/billing/checkout`, `/billing/portal`, `/billing/cancel`, `/billing/status` endpoints. Hook the `EntitlementService` into the sync endpoints from Stage 18.5 and 18.6: free tier → 402 with upgrade payload. Frontend: pricing page, upgrade-required modals, customer-portal redirect. Add tests covering every Stripe event type relevant to subscriptions, every Razorpay equivalent, signature mismatch (must reject), replay (must dedupe), checkout-success-before-webhook race, and refund flow. Write `docs/billing.md` documenting the entitlement matrix, grace-period policy, and how to add a new provider.

### 18.9 Stage 7 — Production Hardening & Launch

**Goal:** go from "works on my machine" to "safe to put in front of strangers in 30 countries."

**Scope:** Threat model in `docs/threat-model.md`. `gitleaks`, `trivy`, `npm audit --production` in CI; high/critical findings block release. OWASP ASVS L2 checklist in `docs/asvs-checklist.md`. Sentry on both ends with PII scrubbing. OpenTelemetry traces from API → DB. Grafana dashboards in `ops/dashboards/`. Daily backup-verification job restores latest Postgres backup into scratch DB and replays migrations. Privacy policy, ToS, DPA, cookie banner (web), Article 30 records, subprocessor list. Code signing (Windows EV cert + macOS notarization). Release workflow. Soft launch (~50 invite-only users, two-week stability window). Status page + incident runbook.

**Prompt A (Claude Opus 4.6 — security):**
> Produce `docs/threat-model.md` for Cairn. Cover assets (user vault, password hash, payment data, sync log), trust boundaries, attackers (curious admin, network attacker, malicious tab, stolen device, compromised dependency), STRIDE per component, and a mitigations matrix mapped to the implemented code. Run `gitleaks`, `trivy fs .`, `npm audit --production`; fix any high/critical findings. Add `socket.dev` GitHub app config. Add OWASP ASVS Level 2 checklist as `docs/asvs-checklist.md` with each row marked Done / N/A / Outstanding and links to evidence.

**Prompt B (Claude Sonnet 4.6 — observability & DR):**
> Wire Sentry into both server and client with PII scrubbing. Add OpenTelemetry traces from `apps/server` to Postgres. Provide Grafana dashboards as JSON in `ops/dashboards/`. Add a daily backup-verification GitHub Action that restores the latest Supabase/Neon backup into a scratch DB and runs migrations. Write `docs/runbook.md` covering paging policy, P1/P2 examples, rollback procedure, key rotation, GDPR/DPDP customer-data-export-on-request, and customer-data-deletion-on-request.

**Prompt C (Claude Sonnet 4.6 — release pipeline):**
> Set up code signing for Windows (signtool + EV cert) and macOS (electron-builder notarization with `notarytool`). Add `.github/workflows/release.yml` that builds, signs, notarizes, and creates a draft GitHub Release with checksums.

