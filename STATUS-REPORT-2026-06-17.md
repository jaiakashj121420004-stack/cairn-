# Cairn — Status Report (2026-06-17)

Branch: `feat/rules-engine` (now the origin default) · Version in `package.json`: **0.1.0**
Installed app on your machine: **`Cairn Setup 0.1.0.exe`** built **2026-06-07** from the early-June `d53be8d` baseline.

---

## 1. The headline

Since the installer you currently have, an enormous amount has landed: the whole **v2.0 cloud layer** (crypto, Fastify backend, E2E-encrypted sync engine, billing) and **Wave 4 live broker integration**. Most of it is now **committed**; a large final slice — **Stage 7 production hardening (telemetry, runbook, launch checklist, release pipeline, server hardening)** — is **built but uncommitted** (172 changed files in the working tree).

Your installed app is **behind by ~14 commits plus all the uncommitted work**. To actually see any of it you must rebuild the installer (section 6).

---

## 2. What is committed now (newer than your installer)

In commit order, everything above the `d53be8d` baseline your installer was built from:

| Commit | What it added |
|---|---|
| `2a44317` | Converted repo to a pnpm workspace **monorepo** (`apps/desktop`, `apps/web`, `apps/server`, `packages/*`) |
| `8f4e60c` | Moved all P&L math to **decimal.js** + property tests (correctness to the cent/pip) |
| `9c73422` | Shared result/error/crypto/auth **types + Zod schemas** |
| `e812589` | **Client-side E2E crypto** (Argon2id KDF, XChaCha20-Poly1305, recovery phrase) + OS keychain |
| `91c0fb2` | **Fastify backend** — auth, billing, vault, devices, webhooks (server stores ciphertext only) |
| `363f8c8` | Sync engine **client slice** (encryption-on-write + push/pull/merge, trades table) |
| `15299b3` | Server vault key-material endpoints + password reset |
| `9ed7eee` | **Vault-enrollment client** — auth store, session service, account tab |
| `3ce6d67` | OpenAPI 3.1 spec + self-hosted Scalar API docs |
| `9c00715` | **Full Sync Engine** — all syncable tables, durable vector clocks, enrollment/recovery, conflict-resolution UI |
| `cfb8114` | **Wave 4 live broker integration** (MT5 loopback EA bridge + cTrader adapter, live detection, configurable auto-log) |
| `5afd106` | **Billing** — §20.5 state machine, EntitlementService, country-routed checkout (Stripe/Razorpay), vault 402 gate |

The two Wave 4 "production seams" the docs flagged as open are now **closed in code**:
- **Account mapping** — `resolveAccount()` now looks up a real binding (`broker-account-map.ts` + Settings UI), no longer a hardcoded `null`.
- **cTrader protobuf codec** — `loadProtobufCodec()` now loads `protobufjs` against the vendored `.proto` schema (`ctrader/codec.ts` + `resources/ctrader-proto/`).

---

## 3. What is uncommitted (in your working tree right now)

172 files. This is the **Stage 7 / production-hardening** batch and was **not yet captured by the build-status log**:

- **Telemetry** (opt-in, default off): `apps/desktop/shared/telemetry.ts`, `src/lib/telemetry.ts`, server `telemetry/` + OpenTelemetry/Sentry/sampling tests, `apps/server/src/lib/redact.ts` (PII scrubbing).
- **Release & security pipeline**: `.github/workflows/release.yml`, `.github/workflows/security.yml`, `.github/workflows/backup-verify.yml`, `.zap/rules.tsv`, `apps/desktop/build/entitlements.mac.plist`, code-signing/notarization config in `electron-builder.yml`.
- **Docs**: `docs/runbook.md`, `docs/launch-checklist.md`, `WAVE4-CLOSEOUT-RUNBOOK.md`.
- **Server hardening**: edits across `auth/routes.ts`, `vault/routes.ts`, `webhooks/routes.ts`, `app.ts`, `env.ts`, `server.ts`.
- **Desktop wiring**: `main.ts`, session service/store, `auth-store.ts`.

Net: the code exists but is uncommitted and unverified-by-gates at this combination.

---

## 4. Problems & risks (what needs attention)

1. **Nothing is committed for the latest batch.** 172 files sit uncommitted, mixing finished Stage 7 work with WIP. One bad file can break a build. Commit (or stash) in reviewed chunks before packaging.
2. **Gates have not been run on this exact tree.** The last green five-gate run on the Windows host was **2026-06-11** (`gate-logs/gates-20260611-070632.log`), *before* the billing commit and the uncommitted Stage 7 work. Treat the current tree as **unverified** until you re-run them.
3. **I could not run the gates from here.** This Linux sandbox can't resolve the Windows-symlinked `node_modules`/`@cairn` workspace packages, so typecheck/lint/test/build must be run on your Windows host (`run-host-gates.ps1` does this).
4. **Cloud features need a running backend.** Sync, billing, vault enrollment, and cloud login will appear in the UI but **do nothing useful unless `apps/server` is deployed and reachable**. The desktop app stays fully usable offline (journal, rules, analytics, imports) — these are additive.
5. **Wave 4 live broker still needs runtime proof.** The code seams are closed, but live MT5/cTrader streaming has only been verified at the service/unit level, not against a live terminal (see `WAVE4-CLOSEOUT-RUNBOOK.md`).
6. **Version string is stale.** `package.json` still says `0.1.0` even though the migration hotfix was called v0.1.1. Bump it before a new release so users can tell builds apart (section 6).
7. **Repo hygiene.** Stray `_tmp_*` zero-byte files, `CLAUDE.md.bak`, and three near-duplicate `Cairn_Report_Working_Friction_vs_TradeZella*.html` copies are sitting in the root. Harmless but worth cleaning.

---

## 5. What you'll actually SEE in the app after rebuilding

Offline desktop functionality is unchanged-but-improved (decimal-correct P&L). The **new visible surfaces** are:

- **Settings → Billing tab** — plan/entitlement view, upgrade/checkout (needs server).
- **Settings → Account / sign-in + vault enrollment** — create account, set sync password, **24-word recovery phrase**, recover-from-phrase (needs server).
- **Settings → Integrations** — broker account-map UI for MT5/cTrader linking.
- **Sync status + upgrade prompt** (`SyncUpgradePrompt.tsx`, sync toasts).
- **Conflict-resolution modal** — appears when two devices edit the same record (needs sync active).

Without the backend running, the journaling cockpit (pre-trade gate, rules engine, circuit breakers, calendar, notebook, playbooks, analytics, statement imports) works exactly as before, now with decimal-precise money math.

---

## 6. How to build a new installer

Run on your **Windows host** from the repo root (`C:\Users\jaiak\Desktop\JOR_CLAUDE`):

```powershell
# 0. Commit or stash the 172 uncommitted files first (don't package a dirty WIP tree)
git status

# 1. Prove the build is green (do NOT weaken any gate)
.\run-host-gates.ps1
#    or manually:
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint --max-warnings 0
pnpm test:unit
pnpm build

# 2. (recommended) bump the version so the new build is identifiable
#    edit apps/desktop/package.json  "version": "0.1.0"  ->  "0.2.0"

# 3. Package the installer
pnpm --filter @cairn/desktop run dist
```

The new installer lands at **`apps/desktop/dist/Cairn Setup <version>.exe`**. Install it over the old one; your local SQLite data is preserved (the v0.1.1 packaged-migrations fix is already in).

Notes:
- `pnpm dist` = `electron-vite build` then `electron-builder` (NSIS installer). The vendored cTrader `.proto` files ship automatically via `extraResources`.
- **Code-signing/notarization is inert** until certs are supplied (config is in `electron-builder.yml`); the build still produces a working unsigned installer — Windows SmartScreen will warn on first run, which is normal for unsigned apps.
- You do **not** need the backend to build or run the desktop app. You only need it if you want sync/billing to function.

---

## 7. Done vs to-do (one glance)

**Done & committed:** v1.1, v1.2 Waves 0–3, monorepo, decimal P&L, client crypto, Fastify server, full sync engine, vault enrollment, OpenAPI docs, Wave 4 broker (incl. both seams), billing.

**Built but uncommitted:** Stage 7 telemetry, release/security/backup CI workflows, runbook, launch checklist, server hardening, code-signing config.

**Not done / to-do:** re-run the five gates on this tree; commit the Stage 7 batch; deploy `apps/server` (for sync/billing to work); supply signing certs; live MT5/cTrader runtime proof; the soft-launch window in `docs/launch-checklist.md`; bump the version string.
