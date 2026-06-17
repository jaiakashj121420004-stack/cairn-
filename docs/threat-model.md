<!-- v2.0 NEW — created in Stage 18.9 (Production Hardening & Launch).
     Source of truth for the STRIDE-per-component threat model. Referenced by CLAUDE.md
     §2.13, §18.9, and the ASVS checklist (docs/asvs-checklist.md). The cryptographic
     design lives in docs/security.md; this file maps attackers → components → mitigations →
     code. Review cadence: quarterly (next review due 2026-09-11) and on any change to an
     auth, crypto, billing, or vault code path. -->

# Cairn Threat Model (STRIDE)

**Status:** Living document. Last full pass: **2026-06-11**. Next scheduled review: **2026-09-11** (quarterly per CLAUDE.md §2.13).
**Second-model review:** required before this document is considered ratified (CLAUDE.md §2.12 / §19.11). See [§9](#9-review-log).
**Companion docs:** [`docs/security.md`](security.md) (cryptographic design), [`docs/asvs-checklist.md`](asvs-checklist.md) (OWASP ASVS L2 evidence), [`docs/backend-architecture.md`](backend-architecture.md), [`docs/sync-protocol.md`](sync-protocol.md).

This document does not contain any "TODO." Anything not yet mitigated is an explicit row in [§8 Outstanding](#8-outstanding-items) with an owner and a deadline.

---

## 1. Scope and method

Cairn is a local-first trading journal (desktop Electron app, canonical local SQLite) with an **optional** end-to-end-encrypted cloud sync and subscription layer (web client + Fastify API + Postgres). The privacy contract (CLAUDE.md §2.4, locked decisions §14 #18–#19) is the spine of this model: **the server is architecturally incapable of reading user trading content.** Every component is assessed against that contract.

Method: STRIDE (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege) per component, after enumerating assets ([§2](#2-assets)), trust boundaries ([§3](#3-trust-boundaries)), and attacker classes ([§4](#4-attacker-classes)). Each identified threat is tied to a concrete mitigation in code ([§6](#6-mitigations-matrix-mapped-to-code)) or carried as an Outstanding item ([§8](#8-outstanding-items)).

---

## 2. Assets

| # | Asset | Where it lives | Classification | Compromise impact |
|---|---|---|---|---|
| A1 | **User vault content** (trades, accounts, journals, settings) | Plaintext: local SQLite + decrypted in renderer/IndexedDB. Ciphertext only: `vault_ops.payload_ciphertext`, `apps/server/src/vault/routes.ts` | **Most sensitive.** Trading psychology + positions. | Catastrophic privacy breach; violates the core contract. |
| A2 | **Data key (DK)** — 32-byte AEAD key that encrypts A1 | Client memory while unlocked; OS keychain (`keytar`) at rest; **wrapped** form in `vault_meta.wrapped_data_key` | **Most sensitive.** Holds A1. | Full vault decryption. |
| A3 | **KEK** (password-derived) + **recovery KEK** (phrase-derived) | Derived client-side on unlock; **never persisted, never transmitted** | **Most sensitive.** Unwraps A2. | Unwraps the DK. |
| A4 | **Password** (and recovery phrase) | Entered client-side; only Argon2id+pepper hash stored (`user_credentials`) | High | Account takeover + (password) unlock. |
| A5 | **Password hash** | `user_credentials.password_hash` (Argon2id, peppered) | High | Offline cracking target if DB leaks. |
| A6 | **Session tokens** — access JWT (≤15 min), opaque rotating refresh | Access: client memory. Refresh: `__Host-refresh` cookie + SHA-256 in `user_sessions.refresh_hash` | High | Session hijack. |
| A7 | **Payment data** | **Not stored by Cairn.** Held by Stripe/Razorpay; we keep only provider IDs + status in `subscriptions` | High (by reference) | Billing fraud / entitlement abuse. |
| A8 | **Sync / audit log** | `vault_ops` (metadata: table, record id, op type, timestamps — ciphertext payload), `audit_log` | Medium | Traffic-analysis metadata leak; tamper hides abuse. |
| A9 | **Recovery phrase** | Shown once client-side; **never stored** (only the phrase-wrapped DK copy is, in `vault_meta.recovery_wrapped_data_key`) | **Most sensitive.** Unwraps A2. | Full vault decryption. |
| A10 | **Server secrets** — `PASSWORD_PEPPER`, `JWT_SECRET`, webhook secrets, DB URL, `ADMIN_TOKEN` | Env only, validated at boot (`apps/server/src/env.ts`) | **Most sensitive (server-side).** | Pepper+DB ⇒ crack hashes; JWT secret ⇒ forge sessions. |

---

## 3. Trust boundaries

```
                          ┌─────────────────────────── USER DEVICE (trusted) ───────────────────────────┐
                          │                                                                              │
 ┌──────────────┐  IPC    │  ┌──────────────────┐   keytar   ┌───────────┐    file    ┌──────────────┐  │
 │  Renderer    │◀───────▶│  │  Main process    │◀──────────▶│ OS keychn │            │ local SQLite │  │
 │ (React UI)   │ [TB-1]  │  │  crypto + sync   │            │ (DK at rst)│           │ (plaintext)  │  │
 └──────────────┘         │  └────────┬─────────┘            └───────────┘            └──────────────┘  │
                          │           │ encrypts BEFORE leaving device                                   │
                          └───────────┼──────────────────────────────────────────────────────────────┘
                                      │  ciphertext only          [TB-2: device ↔ network]
                                      ▼  HTTPS (TLS) + AEAD
 ┌──────────────┐                ╔════╧═══════════════════════════════════════════════════╗
 │ Web browser  │  HTTPS/cookie  ║                 CAIRN BACKEND (semi-trusted)            ║
 │ (web client) │◀══════════════▶║  Fastify API  ──▶  Postgres (ciphertext + hashes)      ║
 │ decrypts in  │  [TB-2]        ║  [TB-3: API ↔ DB]   audit_log                          ║
 │ browser only │                ╚════╤═══════════════════════╤════════════════════════════╝
 └──────────────┘                     │ [TB-4]                │ [TB-5]
                                       ▼ webhooks (signed)     ▼ REST (read-only billing)
                              ┌─────────────────┐     ┌─────────────────────────────┐
                              │ Stripe / Razorpay│    │ Email (Resend) · Sentry · CI │
                              │ (3rd-party,      │    │ (3rd-party, untrusted)        │
                              │  untrusted)      │    └─────────────────────────────┘
                              └─────────────────┘
```

| Boundary | Between | Control |
|---|---|---|
| **TB-1** | Renderer ↔ Main | Context isolation on, no `remote`, narrow typed preload, Zod-validated IPC (`apps/desktop/electron/ipc/`). |
| **TB-2** | Device ↔ Network | TLS **plus** client-side AEAD: plaintext never crosses. CORS allowlist, `__Host-` cookies, helmet/CSP. |
| **TB-3** | API ↔ Postgres | API authn'd to DB; DB stores ciphertext + hashes only. Server cannot decrypt A1. |
| **TB-4** | API ↔ Payment providers | Inbound webhooks signature-verified + idempotent (`apps/server/src/webhooks/routes.ts`); outbound over TLS. |
| **TB-5** | API ↔ Email/Sentry/CI | Transactional only; PII-scrubbed; secrets in env. |

The **critical** boundary is TB-2/TB-3: everything past the device is treated as *able to read its own storage*. The encryption design (docs/security.md) assumes the server operator is an attacker (A-Admin below).

---

## 4. Attacker classes

| ID | Attacker | Capability assumed | Primary targets |
|---|---|---|---|
| **A-Admin** | Curious / compromised server admin (or anyone with full DB + backup access) | Reads all of Postgres, all backups, server logs, server memory snapshots | A1, A2, A4, A5, A8 |
| **A-Net** | Network attacker / MITM | Observes & tampers with traffic; may attempt TLS-strip | A1, A6 in transit |
| **A-Tab** | Malicious browser tab / hostile web origin / XSS attempt | Runs JS in the user's browser; CSRF from another origin | A1 (web), A6 |
| **A-Device** | Thief with the user's laptop | Has the SQLite file; may have keychain if app is unlocked | A1, A2 |
| **A-Dep** | Compromised dependency / supply-chain | Ships malicious code in a transitive package; build-time or runtime | All — runs with app privileges |
| **A-Tenant** | Hostile co-tenant on the hosting platform | Shares physical/virtual hosting; attempts cross-tenant read, side-channel | A1 (ciphertext), A10 |
| **A-User** | Authenticated but malicious user | Valid account; attempts to read *other* users' data or escalate entitlement | A1 (other users), A7 |
| **A-Phys** | Curious bystander / coerced unlock | Shoulder-surf, coercion | A4, A1 (out of scope — see below) |

**Explicit non-goals** (documented, not hand-waved): malware running with the user's OS privileges while the app is unlocked; a coerced password; a malicious OS or hardware implant; rubber-hose cryptanalysis. The crypto layer cannot defend a device whose OS is already owned (docs/security.md §1).

---

## 5. STRIDE per component

Components: **C1** Desktop renderer · **C2** Desktop main (IPC/SQLite/keychain/sync runner) · **C3** Client crypto · **C4** Web client · **C5** Transport (IPC + HTTPS) · **C6** Fastify core (headers/CORS/rate-limit/error) · **C7** Vault storage · **C8** Auth & sessions · **C9** Billing & webhooks · **C10** Admin & audit · **C11** CI/CD & dependencies.

### C1 — Desktop renderer (React UI)
| STRIDE | Threat | Mitigation (→ [§6](#6-mitigations-matrix-mapped-to-code)) |
|---|---|---|
| S | Renderer impersonates main / loads remote code | Context isolation + no `nodeIntegration`; preload exposes only typed channels. → M1 |
| T | UI tampers with money math | Money math is in main/crypto-adjacent services with decimal types + property tests, not the renderer. → M12 |
| I | Plaintext leaked to logs | No `console.log` in prod (`no-console` lint); electron-log never handed key material. → M11 |
| E | Renderer reaches Node APIs | No `remote`; narrow preload. → M1 |

### C2 — Desktop main process
| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Forged IPC sender | Single trusted renderer; Zod-validated handler map. → M2 |
| T | Tampered local DB rows desync silently | Records AEAD-bound to `table:id` as associated data; tamper ⇒ decrypt refusal. → M5 |
| R | No record of security-relevant local actions | Sync ops are append-only (`vault_ops`); server audit on auth events. → M9 |
| I | DK written to disk/logs | DK only in OS keychain (encrypted at rest) + memory; never SQLite/logs/temp. → M6 |
| D | Sync runner hammers API | Leaky-bucket-rate-limited interval client-side; server rate limits too. → M8 |
| E | Native module loads malicious code | Pinned deps, `onlyBuiltDependencies` allowlist (better-sqlite3/keytar/electron). → M13 |

### C3 — Client crypto (`packages/shared-crypto/src/`, re-exported via `apps/desktop/electron/services/crypto/`; web `vault-crypto`)
| STRIDE | Threat | Mitigation |
|---|---|---|
| T | Ciphertext tamper / row substitution | XChaCha20-Poly1305 AEAD + `table:id` associated data; Poly1305 tag check. → M5 |
| I | Weak KDF ⇒ offline crack | Argon2id (64 MiB, t=3), per-vault salt, domain-separated recovery config. → M4 |
| I | Nonce reuse | 24-byte XChaCha nonce, fresh random per encrypt; collision margin ~2⁹⁶. → M5 |
| D | — | (DoS on a local lib is the user's own machine; n/a) |
| E | Wrong key silently "succeeds" | `unwrapDataKey` throws typed `WRONG_KEY` on tag mismatch — no maybe-path. → M5 |

### C4 — Web client (browser)
| STRIDE | Threat | Mitigation |
|---|---|---|
| S | CSRF on cookie-auth'd refresh | **Primary:** `SameSite=Strict` on the `__Host-refresh` cookie + strict CORS allowlist — a cross-site `/auth/refresh` does not carry the cookie. Access token is in memory (not a cookie), so other endpoints carry no ambient auth. The client also sends a double-submit `csrf` header, but it is **not currently validated server-side** (client-side defence-in-depth only — see O12). → M3, M7 |
| T | Injected inline script (XSS) | Strict per-response **nonce** CSP, no `unsafe-inline`/`unsafe-eval`, everything bundled (empty SRI surface). → M3 |
| I | Token theft from storage | No token in `localStorage`/`sessionStorage`; refresh cookie `HttpOnly`; DK zeroed on lock. → M3, M7 |
| I | SW caches plaintext | Service worker is read-only, caches app shell only; never API/cross-origin/non-GET. → M3 |
| E | Subdomain overwrites cookie | `__Host-` prefix forbids `Domain`, forces `Path=/`+`Secure`. → M7 |

### C5 — Transport (IPC + HTTPS)
| STRIDE | Threat | Mitigation |
|---|---|---|
| S | MITM impersonates API | TLS + HSTS (prod, `includeSubDomains`); CORS allowlist. → M3 |
| T | In-transit tamper | AEAD payload + TLS; tamper fails tag or TLS. → M3, M5 |
| I | Eavesdrop | Ciphertext-only payloads; TLS defence-in-depth. → M5 |

### C6 — Fastify core
| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Header spoofing for rate-limit bypass | Per-IP **and** per-identifier limits (M8). ⚠️ `trustProxy: true` is set **unconditionally** (`app.ts:53`), so `req.ip` is derived from `X-Forwarded-For`; if the origin is ever reachable not behind the trusted LB, the per-IP key is spoofable — tracked as O14. → M8 |
| T | Oversized/malformed body | JSON-only parser, `BODY_LIMIT_BYTES` (64 KB default, 5 MB vault), Zod on every route. → M2, M8 |
| R | — | Pino structured logs w/ request id. → M11 |
| I | Error leaks internals | Uniform `Result` envelope; never echoes raw error/stack; helmet hides `X-Powered-By`. → M10 |
| D | Request flood | Global 300/min per-IP limit + per-endpoint auth limits. → M8 |
| E | Missing security headers | helmet: CSP `default-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`, HSTS. → M3 |

### C7 — Vault storage (server)
| STRIDE | Threat | Mitigation |
|---|---|---|
| S | User pushes ops for another user's device | Device ownership + not-revoked check scoped to `userId` before insert. → M14 |
| T | Op tamper at rest | Payload is opaque AEAD ciphertext; server never the integrity authority — client AEAD is. → M5 |
| R | Deny having pushed an op | Append-only `vault_ops` with device id + timestamps. → M9 |
| I | **A-Admin reads trades** | Server stores ciphertext + wrapped DK only; cannot derive KEK. **Core contract.** → M4, M5 |
| I | Cross-user pull | Every pull/manifest query filters `eq(vaultOps.userId, userId)`. The `notInArray` catch-all in `buildPullWhere` is nested **under** that user filter (`vault/routes.ts:351`), so it can only return the *same user's* never-synced tables — never another user's ops. → M14 |
| D | Push flood / huge blob | 5 MB body limit, single transaction, pagination (500/page) on pull. → M8 |
| E | Free user uses paid sync | `requireCloudSync` → `EntitlementService.canUse`; 402 `UPGRADE_REQUIRED`. → M15 |

### C8 — Auth & sessions
| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Credential stuffing / brute force | Argon2id+pepper, per-IP+per-email rate limits, generic responses. → M4, M8 |
| S | Account enumeration | Identical signup/login/magic/forgot responses + `dummyVerify` timing equalizer. → M16 |
| T | JWT forgery / alg confusion | HS256 only, `algorithms:[ALG]` pinned on verify, issuer+audience checked. → M17 |
| R | Refresh token theft replay | Opaque rotating refresh, **reuse detection** revokes whole family + `critical` audit. → M18 |
| I | Token leak in logs | Only SHA-256 of tokens stored; redaction list covers token/secret/cookie/authz. → M11 |
| D | Auth endpoint flood | Tight per-endpoint per-IP + per-identifier limits (signup 5/IP·15m, login 5/IP·15m, magic/forgot 3/email·1h). Token-**consuming** endpoints (`/auth/verify`, `/auth/magic-consume`) rely on 256-bit single-use TTL'd tokens + the global 300/min/IP rather than a tight per-endpoint cap. All limits are **per-process** today (in-memory store) — multi-instance prod multiplies them until O6 lands. → M8 |
| E | Unverified email reaches sync | `requireVerifiedEmail` preHandler gates `/vault/*`; fails closed. → M14 |
| E | Stale session after password reset | `revokeAllUserSessions` on reset; no session issued by reset. → M18 |

### C9 — Billing & webhooks
| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Forged webhook ⇒ free Pro | Stripe `constructEvent` signature; Razorpay HMAC-SHA256 **constant-time** compare. → M19 |
| S/E | Webhook attributes a subscription to **another user** via `cairn_user_id` metadata | `cairn_user_id` is read from provider metadata/notes (`webhooks/routes.ts:249,347,382`). Safe **only** because that metadata is set exclusively by our own server-side checkout-session creation, never from client input. Invoice/refund paths additionally resolve the user via stored `providerSubscriptionId/customerId` (`resolveStripeUser`). Hardening (cross-check metadata vs. the existing `subscriptions` row before trusting it) tracked as O13. → M15, M19 |
| T | Replayed delivery double-applies | Idempotency via `webhook_event(provider, external_id)` unique + `onConflictDoNothing`. Stripe keys on `event.id`. ⚠️ Razorpay falls back to `parsed.event` when no payment entity is present (`webhooks/routes.ts:140`), which can **over-dedup** distinct subscription events of the same type — correctness gap tracked as O15. → M19 |
| R | Disputed state change | `audit_log` row per receipt + per illegal transition. → M9 |
| I | Provider payload in logs | Stored in `webhook_event.payload`; logs carry only event id/type. → M11 |
| D | Webhook flood | Rate-limit disabled on webhooks (providers retry); idempotency caps real work; signature gate first. → M19 |
| E | Illegal state transition | §20.5 state machine rejects (`ILLEGAL_STATE`); entitlement is single-source (`EntitlementService`). → M15 |

### C10 — Admin & audit
| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Unauthorized audit read | `ADMIN_TOKEN` (≥32 char) Bearer; **404** when unset (route hidden). → M20 |
| T | Audit tamper | Append-only; no update/delete path in code. → M9 |
| I | Audit leaks secrets | Audit rows carry ids/counts/event names only — never plaintext/keys. → M9 |
| E | Token guessing | Min-length (≥32) env secret; **constant-time** compare via `timingSafeEqualUtf8` (`admin/routes.ts`, `lib/crypto-random.ts`). → M20 |

### C11 — CI/CD & dependencies
| STRIDE | Threat | Mitigation |
|---|---|---|
| T | Malicious dep introduced (A-Dep) | Pinned exact versions, `pnpm audit` (high+ blocks), Trivy fs/image, Socket.dev PR gate, license gate. → M13, M21 |
| I | Secret committed | `gitleaks` on every push/PR. → M22 |
| D | — | n/a |
| E | Unsigned release | Code signing + notarization (Outstanding O5). → §8 |

---

## 6. Mitigations matrix (mapped to code)

| ID | Mitigation | Evidence (code / config) | Attackers countered |
|---|---|---|---|
| **M1** | Context isolation, no `remote`, narrow preload | `apps/desktop/electron/preload.ts`, CLAUDE.md §3.4 | A-Dep, A-Tab |
| **M2** | Zod validation at every IPC + HTTP boundary | `apps/server/src/lib/http.ts` (`parseBody`/`sendValidated`), `packages/shared-zod/`, all `routes.ts` | A-User, A-Net |
| **M3** | Helmet strict CSP / HSTS (server) + per-response nonce CSP (web) + read-only SW | `apps/server/src/app.ts:58-69`, `apps/web/functions/_middleware.ts`, `apps/web/index.html`, `apps/web/public/sw.js` | A-Tab, A-Net |
| **M4** | Argon2id (64 MiB, t=3) + server pepper (password) / per-vault salt (KEK) | `apps/server/src/auth/password.ts`, `docs/security.md §3` | A-Admin, A-User |
| **M5** | XChaCha20-Poly1305 AEAD, fresh 24-B nonce, `table:id` associated data, typed `WRONG_KEY` | AEAD primitive: `packages/shared-crypto/src/aead.ts` (re-exported via `apps/desktop/electron/services/crypto/index.ts` shim). The `table:id` associated data is bound one layer up by the sync engine (`apps/desktop/electron/services/sync/serialize.ts` `adFor()`, applied in `sync/pull.ts`), not by the AD-agnostic crypto primitive. Design: `docs/security.md §4` | A-Admin, A-Net, A-Tenant |
| **M6** | DK only in OS keychain (encrypted at rest) + memory; cleared on lock/logout | `apps/desktop/electron/services/keychain.ts`, `docs/security.md §6` | A-Device |
| **M7** | `__Host-refresh` cookie: HttpOnly+Secure+SameSite=Strict+Path=/; access token in memory only | `apps/server/src/auth/cookies.ts`, `apps/web/SECURITY.md §1` | A-Tab |
| **M8** | Rate limiting: global 300/min/IP + per-endpoint per-IP & per-identifier; body-size limits; pull pagination | `apps/server/src/app.ts:84-94`, `apps/server/src/auth/routes.ts:30-38`, `apps/server/src/lib/rate-limit.ts`, `apps/server/src/vault/routes.ts:40-41` | A-Net, A-User |
| **M9** | Append-only `audit_log` + `vault_ops`; audit on auth & billing events | `apps/server/src/lib/audit.ts`, `apps/server/src/db/schema.ts` (`auditLog`, `vaultOps`) | repudiation (all) |
| **M10** | Uniform `Result` error envelope; no stack/internal leak; not-found/413/4xx/5xx mapped | `apps/server/src/app.ts:109-132`, `apps/server/src/lib/errors.ts`, `apps/server/src/lib/http.ts` | A-Net, A-User |
| **M11** | Pino PII redaction (password/token/secret/ciphertext/email/authz/cookie); no `console.log` | `apps/server/src/logger.ts:14-35`, `no-console` lint | A-Admin |
| **M12** | Money in decimal types + property tests | `apps/desktop/electron/services/pnl-calculator.ts`, `apps/server/src/billing/*` (CLAUDE.md §19.5) | data-integrity |
| **M13** | Exact-pinned deps + native-build allowlist + audit/license gates | `package.json` (`pnpm.overrides`, `onlyBuiltDependencies`), `scripts/check-licenses.ts` | A-Dep |
| **M14** | Per-user/-device authorization scoping; verified-email gate on sync | `apps/server/src/vault/routes.ts` (device check, `eq(userId)`), `apps/server/src/auth/middleware.ts` | A-User |
| **M15** | Single-source entitlement gate (`EntitlementService.canUse`); 402 upgrade payload | `apps/server/src/billing/entitlement-service.ts`, `apps/server/src/vault/routes.ts:59-66` | A-User |
| **M16** | Account-enumeration resistance (identical responses + `dummyVerify`) | `apps/server/src/auth/password.ts:66-84`, `apps/server/src/auth/service.ts`, `apps/server/src/auth/routes.ts` (magic/forgot constant reply) | A-User, A-Net |
| **M17** | JWT alg pinned (HS256), issuer+audience verified, claims type-checked | `apps/server/src/auth/tokens.ts:51-75` | A-User |
| **M18** | Refresh rotation + reuse detection (family revoke + critical audit); revoke-all on reset | `apps/server/src/auth/sessions.ts:103-148, 83-90` | A-Net, A-Device |
| **M19** | Webhook signature verify (Stripe `constructEvent` / Razorpay HMAC via `timingSafeEqualHex`, constant-time over hex digests) + idempotency table | `apps/server/src/webhooks/routes.ts:70-96, 126-156`, `apps/server/src/lib/crypto-random.ts` (`timingSafeEqualHex`) | A-Net, A-User |
| **M20** | Admin audit endpoint: env Bearer token (≥32), **constant-time** compare, 404 when unconfigured | `apps/server/src/admin/routes.ts`, `apps/server/src/lib/crypto-random.ts` (`timingSafeEqualUtf8`) | A-Net |
| **M21** | Trivy (fs + image) + Socket.dev supply-chain gate in CI | `.github/workflows/security.yml`, `socket.yml` | A-Dep, A-Tenant |
| **M22** | gitleaks secret scan on every push/PR | `.github/workflows/gitleaks.yml` | A-Dep |
| **M23** | ZAP baseline DAST against staging API in CI | `.github/workflows/security.yml` (`zap-baseline` job) | A-Net |

---

## 7. Verification performed this pass (2026-06-11)

- **Dependency audit (real run):** `pnpm audit --prod` initially reported **11 advisories (2 critical, 4 high, 5 moderate)** — `protobufjs` (DoS) and `shell-quote` (command injection, transitive via `drizzle-orm>gel`). Fixed by bumping `protobufjs` 7.4.0 → 7.5.8 and adding `pnpm.overrides` for `shell-quote>=1.8.4` and `brace-expansion>=5.0.6`. Re-run: **`No known vulnerabilities found`** (see `package.json`, `apps/desktop/package.json`).
- **CSP static verification:** server CSP locks to `default-src 'none'` (JSON API); web CSP uses a per-response nonce with no `unsafe-inline`/`unsafe-eval`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, and an empty SRI surface (all scripts bundled). The single entry `<script>` is nonce-gated. See [§8 O3](#8-outstanding-items) for the live report-only Playwright sweep that must run in CI.
- **Secret scan / Trivy / Socket / ZAP:** wired into CI (`.github/workflows/security.yml`, `gitleaks.yml`, `socket.yml`). These execute on CI runners against built images and the staging API — not reproducible in the authoring sandbox; tracked as O1–O4 until the first green CI run is recorded here.

---

## 8. Outstanding items

Every gap is a row here — never a silent omission. Owner + deadline are mandatory.

| ID | Gap | Risk | Owner | Deadline | Status |
|---|---|---|---|---|---|
| **O1** | First green run of the `trivy-fs` + `trivy-image` jobs must be recorded (job wired, not yet run on CI). | Med | Jai Akash | 2026-06-25 | Wired; awaiting CI run |
| **O2** | Socket.dev GitHub App must be **installed** on the repo (config `socket.yml` committed; app install is a GitHub UI action only the owner can perform). | Med | Jai Akash | 2026-06-18 | Config done; install pending |
| **O3** | Full Playwright run with CSP in **report-only** mode to confirm **zero** violations end-to-end, then flip to enforce. Static pass done; live sweep pending (web build needs host workspace junctions — `apps/web/SECURITY.md §6`). | Med | Jai Akash | 2026-06-25 | Static ✓; live pending |
| **O4** | First `zap-baseline` run against a live **staging** API; triage & fix any Medium+. Job wired; no staging API deployed yet. | Med | Jai Akash | 2026-07-02 | Wired; awaiting staging |
| **O5** | Code signing (Windows EV) + macOS notarization in `release.yml` (CLAUDE.md §18.9 Prompt C). | Med | Jai Akash | 2026-07-09 | Not started |
| **O6** | Redis-backed rate-limit store for multi-instance prod (today: in-process `MemoryRateLimitStore`, single-instance only). | Med | Jai Akash | 2026-07-09 | Interface ready; impl pending |
| **O7** | Backup-restore drill + PITR verification job (CLAUDE.md §18.9 Prompt B → `docs/runbook.md`). | Med | Jai Akash | 2026-07-09 | Not started |
| **O8** | Sentry PII-scrubbing config verified on **both** ends with a live test event (CLAUDE.md §18.9 Prompt B). | Low | Jai Akash | 2026-07-09 | Opt-in wired; scrub test pending |
| **O9** | OAuth (Apple/Google) endpoints are stubs returning `NOT_IMPLEMENTED` — no auth risk today, but document the deferred CSRF/state design before enabling. | Low | Jai Akash | When Stage 5 OAuth lands | Stubbed |
| **O10** | Metadata minimization review of `vault_ops` (table/record-id/timestamps are plaintext metadata; assess traffic-analysis exposure for A-Admin). | Low | Jai Akash | 2026-09-11 (next quarterly) | Accepted risk, to review |
| **O11** | Breached-password check (HIBP k-anonymity range query) at signup + password reset (ASVS 2.1.7). | Low | Jai Akash | 2026-07-09 | Not started |
| **O12** | Enforce the double-submit `csrf` token **server-side** on `/auth/refresh` (today it is sent by the web client but not validated; CSRF is currently closed by `SameSite=Strict` + CORS alone). | Low | Jai Akash | 2026-07-09 | Client sends; server enforce pending |
| **O13** | Harden webhook user-resolution: cross-check `cairn_user_id` metadata against the existing `subscriptions` row (by `providerCustomerId/SubscriptionId`) before trusting it; document that checkout metadata is server-set only. | Med | Jai Akash | 2026-07-02 | Accepted (server-set metadata); harden pending |
| **O14** | Replace unconditional `trustProxy: true` with a trusted hop/CIDR from env so `X-Forwarded-For` can't be spoofed if the origin is ever directly reachable. | Med | Jai Akash | 2026-07-02 | Not started |
| **O15** | Use Razorpay's own delivery/event id (`x-razorpay-event-id`) as the idempotency key instead of the `parsed.event` fallback, to stop over-dedup of distinct same-type subscription events. | Low | Jai Akash | 2026-07-09 | Not started |
| **O16** | Secret-rotation design: JWT key-ring with `kid` + dual-verify window; pepper versioning. Today `JWT_SECRET`/`PASSWORD_PEPPER` are single values — rotation invalidates all live tokens / all hashes. | Med | Jai Akash | 2026-07-16 | Not started |

---

## 9. Review log

| Date | Reviewer | Model/Context | Outcome |
|---|---|---|---|
| 2026-06-11 | Authoring pass | Opus 4.8 (primary) | Draft complete; deps fixed; O1–O11 opened. |
| 2026-06-11 | **Second-model review (mandatory, §2.12)** | Fresh-context Opus session | **NEEDS REWORK** → resolved. Findings actioned below; document re-issued. |
| 2026-06-11 | **Second-model review — re-run (mandatory, §2.12)** | Fresh-context Opus 4.8 session | **APPROVED WITH CHANGES**. 3 minor evidence-path corrections (crypto restructure); no security gap, no over-claim. Applied — see below. |

> The second-model review is a hard gate (CLAUDE.md §19.11). A fresh-context Opus session adversarially reviewed this model against the code and returned **NEEDS REWORK** with the findings below. All have been actioned; the verdict moves to **APPROVED WITH CHANGES**.

### Second-model re-run findings and resolution (2026-06-11)

A fresh-context Opus 4.8 session re-reviewed this model against the live code after the `crypto/` → `packages/shared-crypto` restructure. Verdict: **APPROVED WITH CHANGES** — every mitigation M1–M23 and every spot-checked STRIDE cell matched the code; no mitigation claimed Done was missing; all O6/O12/O13/O14/O15 caveats were judged honest and accurate. Three minor evidence-path corrections, all applied:

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | minor | M5/C3 cited `crypto/index.ts`, now a re-export shim; real AEAD lives in `packages/shared-crypto/src/aead.ts`. | M5 evidence + C3 component path repointed to `packages/shared-crypto/src/`. |
| 2 | minor | M5 implied the crypto primitive binds `table:id` AD; it is AD-agnostic — binding is in the sync layer (`serialize.ts`/`pull.ts`). | M5 reworded to attribute the `table:id` AD binding to the sync engine. |
| 3 | minor | M19 said "Razorpay constant-time compare" without naming the helper; code uses `timingSafeEqualHex` (distinct from M20's `timingSafeEqualUtf8`). | M19 now names `timingSafeEqualHex` and cites `lib/crypto-random.ts`. |

Reviewer confirmed solid (unchanged): client AEAD design + typed `WRONG_KEY`/`DECRYPT_FAILED` fail-closed, JWT alg/iss/aud pinning, refresh rotation + family-revoke reuse detection, webhook signature+idempotency with accurate O13/O15 caveats, const-time admin compare + 404-when-unset, per-process rate-limit (O6) + unconditional `trustProxy` (O14) caveats, cross-user-pull `notInArray` user-scoping, helmet/web-nonce CSP, Pino redaction, append-only audit. §8 Outstanding: every row O1–O16 carries an owner + concrete deadline — no blanks, no TODO.

### Second-model findings and resolution (2026-06-11)

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | blocker | C4 claimed the double-submit `csrf` token is enforced on `/auth/refresh`; the server never validates it (web client sends it only). | Reworded C4: CSRF is closed by `SameSite=Strict` + CORS; csrf header noted as non-enforced DiD. Server enforcement opened as **O12**. |
| 2 | major | C10/M20 claimed a "constant" admin-token compare; `admin/routes.ts` used `!==` (early-exit). | **Code fixed** — added `timingSafeEqualUtf8` and used it; M20/C10 updated to match. |
| 3 | major | No STRIDE cell for webhook user-resolution trusting `cairn_user_id` metadata. | Added C9 S/E row documenting the server-set-metadata assumption; hardening opened as **O13**. |
| 4 | major | C6 said `trustProxy` is "only behind trusted LB"; code sets `trustProxy: true` unconditionally → XFF spoofing if origin directly reachable. | Reworded C6 with the ⚠️ caveat; remediation opened as **O14**. |
| 5 | major | Rate-limit cells read as production-effective; store is in-memory/per-process. | Added per-process caveat to the C8 flood cell and to M8 (cross-refs O6). |
| 6 | minor | `/auth/verify` + `/auth/magic-consume` lack tight per-endpoint limits. | Noted in C8 (protected by 256-bit single-use TTL'd tokens + global limit). |
| 7 | minor | Razorpay idempotency falls back to `parsed.event` → over-dedup of distinct same-type events. | Added ⚠️ to the C9 replay cell; fix opened as **O15**. |
| 8 | minor | No rotation story for `JWT_SECRET` / `PASSWORD_PEPPER`. | Opened as **O16**. |
| 9 | minor | Confirm `notInArray` catch-all is user-scoped (it is). | Added explicit note to the C7 cross-user-pull cell. |
| 10 | minor | §8 incomplete by omission of #1/#2/#3/#4. | Resolved by O12–O16 above. |

Items the reviewer confirmed solid (left unchanged): envelope crypto design, JWT alg/iss/aud pinning, refresh rotation + reuse detection, `__Host-` cookie flags, account-enumeration resistance, error envelope, helmet/web-nonce CSP, fail-closed env validation.
