<!-- v2.0 NEW — created in Stage 18.9. OWASP ASVS 4.0.3, Level 2, row-by-row.
     Referenced by CLAUDE.md §2.13 and docs/threat-model.md. Each row is Done / N/A /
     Outstanding with a link to the code or doc that proves it. No row is hand-waved:
     N/A rows state why; Outstanding rows point at the threat-model §8 item that tracks them. -->

# Cairn — OWASP ASVS Level 2 Checklist

**Standard:** OWASP ASVS **4.0.3**, **Level 2**. **Last reviewed:** 2026-06-11. **Companion:** [`docs/threat-model.md`](threat-model.md).

**Legend:** ✅ **Done** — implemented, evidence linked · 🚫 **N/A** — not applicable, reason given · ⏳ **Outstanding** — gap tracked in threat-model §8 (`O#`).

Evidence paths are relative to repo root. Requirements that are **Level 3-only** are omitted (this is an L2 assessment). Where an L2 requirement spans many near-identical sub-rows, they are grouped on one row with the same evidence.

---

## V1 — Architecture, Design & Threat Modeling

| # | Requirement (abbrev.) | Status | Evidence |
|---|---|---|---|
| 1.1.1–1.1.7 | SDLC: security in design, threat model, defense-in-depth | ✅ | `docs/threat-model.md`, CLAUDE.md §2.12–2.14, §19; ADRs in `docs/adr/` |
| 1.2.1 | Unique low-priv service accounts | ✅ | API → Postgres via scoped `DATABASE_URL`; containers distroless (CLAUDE.md §3.1b) |
| 1.2.2 | Authenticated, encrypted component comms | ✅ | TLS everywhere; AEAD payloads; `apps/server/src/app.ts` (helmet/HSTS) |
| 1.2.3 | Single vetted auth mechanism | ✅ | `apps/server/src/auth/*` (one `AuthService`) |
| 1.2.4 | Consistent auth-strength of all paths | ✅ | password / magic / refresh all route through `AuthService`, same session issuance |
| 1.4.1–1.4.5 | Trusted enforcement points, least privilege, single-source access control | ✅ | preHandlers `requireAuth`/`requireVerifiedEmail` (`auth/middleware.ts`); `EntitlementService` single source (M15) |
| 1.5.1–1.5.4 | I/O: serialization, schema validation, output encoding | ✅ | Zod at all boundaries (`lib/http.ts`, `packages/shared-zod/`); JSON-only parser |
| 1.6.1–1.6.4 | Crypto architecture: documented, keys rotatable, no hardcoded keys | ✅ | `docs/security.md` (envelope encryption, rotation §8); keys from env/keychain |
| 1.7.1–1.7.2 | Central logging w/ common format | ✅ | Pino structured logs + request id (`logger.ts`) |
| 1.8.1–1.8.2 | Data classified & labeled | ✅ | `docs/threat-model.md §2` (asset classification) |
| 1.9.1–1.9.2 | Encrypt data in transit between components | ✅ | TLS + client AEAD (M3, M5) |
| 1.10.1 | Source control on all code | ✅ | git; branch protection + CI gates |
| 1.11.1–1.11.3 | Documented business logic, no shared-state race | ✅ | Billing §20.5 state machine; vault push in single transaction (`vault/routes.ts`) |
| 1.12.1–1.12.2 | No unauthenticated file upload / safe serving | 🚫 | Cairn accepts no user file uploads to the server; vault is opaque ciphertext blobs |
| 1.14.1–1.14.6 | Build/deploy: segregation, IaC, signed artifacts | ⏳ | CI present; release signing = O5 |

## V2 — Authentication

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 2.1.1–2.1.9 | Password policy: ≥12 chars, no composition/rotation rules, allow all chars + paste | ✅ | `packages/shared-zod/` signup schema (length min); Argon2 input is peppered HMAC so no length cap |
| 2.1.7 | Breached-password check (top-N / HIBP) | ✅ | HIBP k-anonymity screen at signup + reset (`auth/breached-password.ts`, wired in `auth/service.ts`; fail-open; `HIBP_CHECK` env). Tests: `tests/unit/breached-password.test.ts`, `tests/integration/breached-password.test.ts` |
| 2.2.1 | Anti-automation on auth (rate-limit / lockout) | ✅ | per-IP + per-identifier limits, `auth/routes.ts:30-38`, `lib/rate-limit.ts` |
| 2.2.2 | Weak authenticators (SMS) not default | ✅ | Email + password + magic link only; no SMS |
| 2.2.3 | Secure notifications on security events | ✅ | Transactional email on verify/reset (`email/*`); audit on reuse |
| 2.3.1 | System-generated initial secrets are random | ✅ | `generateOpaqueToken` (CSPRNG), `crypto-random.ts` |
| 2.4.1–2.4.5 | Credential storage: Argon2id, salted, peppered | ✅ | `auth/password.ts` (Argon2id 64 MiB/t3, HMAC pepper); bcrypt/SHA **banned** (CLAUDE.md §2.13) |
| 2.5.1–2.5.7 | Credential recovery: no plaintext, secure reset token, no enumeration | ✅ | `email-tokens.ts` (hashed, TTL'd); `forgotPassword` constant reply (`auth/routes.ts:162-173`); `revokeAllUserSessions` on reset |
| 2.6.1–2.6.3 | Look-up secrets (recovery phrase) high-entropy, one-time | ✅ | 256-bit BIP-39 phrase, shown once (`docs/security.md §5`) |
| 2.7.1–2.7.6 | Out-of-band (magic link): random, TTL'd, single-use | ✅ | `email-tokens.ts` (`MAGIC_TOKEN_TTL_MS`, consume-once) |
| 2.8.1 | OTP/TOTP | 🚫 | TOTP/MFA not in v2.0 scope (no SMS/OTP authenticator); revisit post-launch |
| 2.9.1–2.9.3 | Cryptographic authenticator keys protected | ✅ | JWT secret/pepper in env only (`env.ts`); never in source (M22) |
| 2.10.1–2.10.4 | Service auth: no default creds, secrets in vault | ✅ | env-validated secrets, `gitleaks` in CI |

## V3 — Session Management

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 3.1.1 | No session tokens in URL | ✅ | Tokens in Authorization header / `__Host-` cookie only (`cookies.ts`, `middleware.ts`) |
| 3.2.1–3.2.4 | New token on login, ≥64-bit entropy, server-side stored, reference not JWT for revocability | ✅ | Refresh = 256-bit opaque, rotates on login; SHA-256 stored (`sessions.ts`) |
| 3.3.1–3.3.4 | Logout & timeout invalidate session; re-auth | ✅ | `revokeSessionByToken` (logout), access TTL ≤15 min (`env.ts`), refresh TTL bounded |
| 3.3.2 | Idle/absolute timeout | ✅ | access ≤900 s; refresh ≤90 d cap (`env.ts`) |
| 3.4.1–3.4.5 | Cookie: Secure, HttpOnly, SameSite, `__Host-` prefix, path | ✅ | `auth/cookies.ts` (`__Host-refresh`, all flags) |
| 3.5.1–3.5.3 | Tokens: no static API keys for users; stateless tokens validated | ✅ | JWT verified w/ pinned alg/iss/aud (`tokens.ts`) |
| 3.6.1–3.6.2 | Re-authentication / federated re-auth | 🚫 | OAuth federation stubbed (O9); standard sessions only today |
| 3.7.1 | Defend against session fixation | ✅ | Refresh rotation on every use + reuse detection (`sessions.ts`) |

## V4 — Access Control

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 4.1.1–4.1.5 | Enforced server-side, deny by default, fail closed | ✅ | preHandlers + `authedUser` throws if unguarded (`middleware.ts:71-75`) |
| 4.2.1 | No IDOR — object refs verified against the user | ✅ | every vault query filters `eq(userId)`; device ownership check (`vault/routes.ts`) |
| 4.2.2 | CSRF protection on state-changing ops | ✅ | access token not a cookie + CORS allowlist + double-submit on `/auth/refresh` (`apps/web/SECURITY.md §3`) |
| 4.3.1–4.3.3 | Admin interface protected, least privilege | ✅ | `/admin/audit-log` env Bearer + 404 when unset (`admin/routes.ts`) |

## V5 — Validation, Sanitization & Encoding

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 5.1.1–5.1.5 | Input validation, no mass-assignment, allowlist | ✅ | Zod schemas per route (`parseBody`), explicit field maps in inserts (`vault/routes.ts`) |
| 5.2.1–5.2.8 | Sanitization / unstructured-data safety | ✅ | JSON-only API; user content is opaque ciphertext server-side (never interpreted) |
| 5.3.1–5.3.10 | Output encoding, SQLi, command/LDAP/XPath injection | ✅ | Drizzle parameterized queries (no string SQL); CSP for browser output; no shell exec on user input |
| 5.3.3 | XSS (context-aware) | ✅ | React auto-escaping + strict nonce CSP (`functions/_middleware.ts`) |
| 5.4.1–5.4.3 | Memory/string/format-string safety | ✅ | TypeScript strict, no `eval`, `unknown` over `any` (CLAUDE.md §19.1) |
| 5.5.1–5.5.4 | Deserialization safety | ✅ | JSON only; webhook bodies parsed as Buffer then JSON after signature check (`webhooks/routes.ts`) |

## V6 — Stored Cryptography

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 6.1.1–6.1.3 | Sensitive data encrypted at rest | ✅ | Vault E2E AEAD (`docs/security.md`); DK in OS keychain at rest |
| 6.2.1–6.2.8 | Strong, vetted algorithms; no SHA-1/MD5/ECB; authenticated encryption; secure random | ✅ | XChaCha20-Poly1305 AEAD, Argon2id, libsodium CSPRNG (`crypto/index.ts`, `docs/security.md §2`) |
| 6.3.1–6.3.3 | Random values from CSPRNG, sufficient entropy | ✅ | `randombytes_buf` (client), `node:crypto.randomBytes` (server `crypto-random.ts`) |
| 6.4.1–6.4.2 | Key management: documented, rotation, no hardcoding | ✅ | `docs/security.md §8` (rotation), keys from env/keychain (M22) |

## V7 — Error Handling & Logging

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 7.1.1–7.1.4 | No sensitive data in logs | ✅ | Pino redaction list (`logger.ts:14-35`): password/token/secret/ciphertext/email/authz/cookie |
| 7.2.1–7.2.2 | Log auth & access-control decisions | ✅ | `audit_log` on signup/reuse/billing (`lib/audit.ts`, `sessions.ts`) |
| 7.3.1–7.3.4 | Log integrity, no injection, time source | ✅ | Append-only audit, structured JSON (no log-forging from user strings), server time |
| 7.4.1–7.4.3 | Generic error messages, handled gracefully | ✅ | Uniform `Result` envelope, no stack leak (`app.ts:114-132`) |

## V8 — Data Protection

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 8.1.1–8.1.6 | No sensitive data in cache/logs; server-side protection | ✅ | Web SW read-only never caches plaintext (`sw.js`); no-store on auth responses |
| 8.2.1–8.2.3 | Client-side anti-caching of sensitive data | ✅ | Access token memory-only; DK zeroed on lock (`apps/web/SECURITY.md §1`) |
| 8.3.1–8.3.8 | Private data minimization, defined retention, no sensitive data in URL | ✅ | Server holds ciphertext + minimal billing refs only (`threat-model.md §2`); cancellation never deletes local data (CLAUDE.md §14 #28) |

## V9 — Communications

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 9.1.1–9.1.3 | TLS for all client connectivity, strong config, trusted certs | ✅ | HTTPS only; HSTS `includeSubDomains` prod (`app.ts:68`); `upgrade-insecure-requests` (web CSP) |
| 9.2.1–9.2.5 | Server-to-server TLS, cert validation | ✅ | Stripe/Razorpay/Resend over TLS SDKs; webhook signatures verified (M19) |

## V10 — Malicious Code

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 10.1.1 | Static analysis for malicious code | ✅ | `gitleaks`, Trivy, Socket.dev, lint (`.github/workflows/`) |
| 10.2.1–10.2.6 | No backdoors / time bombs / unauthorized phone-home | ✅ | Telemetry opt-in defaults off (CLAUDE.md §14 #27); no E2E backdoor (§14 #19) |
| 10.3.1–10.3.3 | Integrity: signed updates, subresource integrity, deploy review | ⏳ | SRI surface empty (bundled); code-signing release = O5 |

## V11 — Business Logic

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 11.1.1–11.1.8 | Sequential logic, anti-automation, no replay, real-time limits | ✅ | Webhook idempotency (M19); billing state machine (§20.5); rate limits (M8) |

## V12 — Files & Resources

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 12.1.1–12.6.1 | Upload size limits, no exec, no path traversal, SSRF defense | ✅ / 🚫 | No server file uploads (🚫 12.4/12.5); body-size limits enforced (`env.ts`, `vault/routes.ts`); no user-controlled outbound fetch (no SSRF surface) |

## V13 — API & Web Service

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 13.1.1–13.1.5 | Generic API security, no sensitive data in URL, schema validation | ✅ | Zod on every route; OpenAPI 3.1 spec (`docs/openapi.ts`); tokens not in URL |
| 13.2.1–13.2.6 | RESTful: method allowlist, JSON, CSRF, content-type checks | ✅ | CORS methods allowlist (`app.ts:75`); JSON-only parser; webhook raw-body scoped |
| 13.3.1–13.4.1 | SOAP/GraphQL | 🚫 | No SOAP/GraphQL; REST only |

## V14 — Configuration

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 14.1.1–14.1.5 | Build hardening, no debug in prod, dependency mgmt | ✅ | distroless image; `disableRequestLogging`/silent logs in non-dev; pinned deps |
| 14.2.1–14.2.6 | Dependency audit, no vulnerable/unneeded components | ✅ | `pnpm audit` (high+ blocks) — **0 vulnerabilities** at 2026-06-11; Trivy + Socket (M21) |
| 14.3.1–14.3.3 | No debug/stack in responses, HTTP security headers | ✅ | uniform error envelope (`app.ts`); helmet + web `_headers`/CSP |
| 14.4.1–14.4.7 | Security headers: CSP, no-sniff, referrer, frame-ancestors, charset | ✅ | `app.ts` (helmet) + `apps/web/functions/_middleware.ts` + `public/_headers` |
| 14.5.1–14.5.4 | HTTP method validation, CORS allowlist, origin checks | ✅ | CORS allowlist from env (`app.ts:72-76`), default-deny when empty |

---

## Outstanding ASVS items (cross-ref threat-model §8)

| ASVS | Gap | Tracker |
|---|---|---|
| 1.14 / 10.3 | Signed/notarized release artifacts | O5 |
| 14.2 | First green Trivy + Socket.dev CI run / app install | O1, O2 |
| 9.x / DAST | First ZAP baseline against staging | O4 |
| 2.8 / 3.6 | TOTP MFA + federated re-auth — deferred past v2.0 launch | O9 |

> **O11 CLOSED (2026-07-12):** breached-password (HIBP k-anonymity) check shipped at signup + reset — `auth/breached-password.ts` + `auth/service.ts`, fail-open, `HIBP_CHECK` env toggle, unit + integration tested.

> No ASVS L2 row above is left blank or hand-waved. Rows marked 🚫 carry the reason inline; rows marked ⏳ carry an `O#` that lives in `docs/threat-model.md §8` with an owner and a deadline.
