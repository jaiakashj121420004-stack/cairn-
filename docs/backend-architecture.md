<!-- v2.0 NEW (CLAUDE.md §4, §18.5). Backend API architecture. This first cut covers
the auth subsystem delivered in Stage 3; vault/sync/billing sections are appended in
their own stages. -->

# Backend Architecture — Cairn Server

**Status:** Stage 3 (Backend Core) — **auth subsystem** implemented. Vault storage,
device registry, and billing webhooks are scaffolded in the roadmap but not in this slice.

The server lives in `apps/server/` (Fastify + TypeScript strict + Drizzle/Postgres) and
shares types/validators with the desktop and web clients via `@cairn/shared-types` and
`@cairn/shared-zod`. It never decrypts user vault content — for auth it only stores
identity, password hashes, sessions, and audit records.

## 1. Layout

```
apps/server/
├── docker-compose.yml         # Postgres + Mailpit for local dev / integration tests
├── drizzle/0000_init.sql      # idempotent initial schema (CREATE … IF NOT EXISTS)
├── src/
│   ├── env.ts                 # Zod-validated env, read once at boot, frozen
│   ├── logger.ts              # pino + centralized PII redaction
│   ├── app.ts                 # buildApp(deps) — DI for tests; security middleware
│   ├── server.ts              # entrypoint: load env → migrate → listen → graceful shutdown
│   ├── db/{schema,client,migrate}.ts
│   ├── lib/{errors,http,crypto-random,rate-limit,audit}.ts
│   ├── auth/                  # password, tokens, sessions, email-tokens, entitlement,
│   │                          # cookies, service, routes, middleware
│   ├── email/                 # EmailProvider: resend (prod) / console (dev) / memory (test)
│   ├── vault/routes.ts        # guarded /vault/manifest stub
│   └── routes/index.ts        # central route registration
└── tests/integration/auth.test.ts   # real Postgres, real Argon2id/JWT
```

## 2. The boundary contract

Every HTTP response is a `Result<T>` (`{ ok: true, data } | { ok: false, error: { code, message } }`,
`@cairn/shared-types`). Internal helpers throw a typed `AppError(code)`; the route
boundary catches it and maps the **code** (the source of truth) to an HTTP status via
`HTTP_STATUS_BY_CODE`. Raw lower-layer error strings are never sent to clients; an
unknown throwable becomes a generic `INTERNAL` 500. Inputs are validated with shared
Zod schemas before any handler logic runs.

## 3. Auth design

### 3.1 Passwords (`auth/password.ts`)
Argon2id only (bcrypt/SHA banned, locked decision #25). The password is
HMAC-SHA256-ed with a server-side `PASSWORD_PEPPER` (env) **before** Argon2id, so a
stolen database is useless without the pepper. Argon2id params: **64 MiB memory,
time cost 3, parallelism 1, 32-byte output**. The unknown-account login path runs a
throwaway verify (`dummyVerify`) so timing can't enumerate accounts.

### 3.2 Tokens (`auth/tokens.ts`, `auth/sessions.ts`)
- **Access token:** HS256 JWT, ≤ 15 min, claims `sub` (userId) + `emailVerified` +
  `entitlement`. Authorization needs no DB hit on the hot path.
- **Refresh token:** opaque 32-byte random string; only its SHA-256 is stored. It is
  **not** a JWT, so it can be revoked server-side. Delivered solely in the
  `__Host-refresh` cookie (`HttpOnly`, `SameSite=Strict`, `Secure`, `Path=/`) — never
  in a JSON body.

### 3.3 Rotation + reuse detection (the security centerpiece)
Refresh tokens belong to a **family**. Each refresh rotates the token: a new session
row is created in the same family (atomically, in a transaction) and the old row's
`replaced_by` is set. Presenting a token that was already replaced or revoked means a
leaked token is being replayed → the **entire family is revoked**, a `critical`
`audit_log` row is written, and the client is forced to re-login. This is covered by
the most important integration test (`refresh-reuse detection`).

### 3.4 Email + magic-link tokens (`auth/email-tokens.ts`)
Single-use, SHA-256-hashed, expiring tokens (verify 24 h, magic 15 min). Consumption
is one atomic conditional `UPDATE … RETURNING`, so a token cannot be redeemed twice
even under a race. Magic-link consumption also marks the email verified (proof of
ownership).

### 3.5 Entitlements (`auth/entitlement.ts`)
`resolveEntitlement(userId)` is the single source of truth read from the
`subscription` table (no row ⇒ `free`; lapsed period/grace ⇒ `free`). The result is
embedded in the access token. No scattered `plan === 'pro'` checks (CLAUDE.md §2.14).

### 3.6 Guards (`auth/middleware.ts`)
`requireAuth` validates the Bearer access token and attaches `req.user`.
`requireVerifiedEmail` additionally demands a verified email and gates sync-bearing
endpoints (e.g. `/vault/manifest` → 403 `EMAIL_NOT_VERIFIED` until verified).

## 4. Endpoint surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/signup` | — | RL 5/15min per IP, 3/h per email. No enumeration leak. |
| POST | `/auth/verify` | — | Consume verify token (24 h, single-use). |
| POST | `/auth/login` | — | RL 5/15min per IP + per email. Sets `__Host-refresh`. |
| POST | `/auth/refresh` | cookie | Rotate; reuse → family revoke + 401. |
| POST | `/auth/logout` | cookie | Revoke family, clear cookie. Best-effort. |
| POST | `/auth/magic-request` | — | RL; always 200 (no leak). |
| POST | `/auth/magic-consume` | — | Single-use 15-min token → session. |
| GET | `/auth/oauth/{apple,google}` | — | 501 `NOT_IMPLEMENTED` (Stage 5 wires). |
| GET | `/vault/manifest` | bearer + verified | Stub; proves the auth gate. |
| GET | `/health` | — | Liveness. |

## 5. Security defaults (`app.ts`)
`@fastify/helmet` with a locked-down CSP (`default-src 'none'`, no frame-ancestors),
HSTS in production; explicit CORS allowlist from `CORS_ORIGINS` with credentials;
JSON-only body parser with a size cap (`BODY_LIMIT_BYTES`); a global per-IP
defense-in-depth rate limit on top of the per-endpoint per-identifier limits; pino
logs with redaction of `password`, `token`, `secret`, `ciphertext`, `email`, and
`Authorization`/`cookie` headers. `trustProxy` is on (deploys behind a trusted LB) so
the rate-limit client IP is accurate.

## 6. Known deviation — `__Host-` cookie path

The Stage 3 prompt asked for the refresh cookie to be both `__Host-`-prefixed **and**
`Path=/auth/refresh`. Those are mutually exclusive: per RFC 6265bis and all browsers,
a `__Host-` cookie **must** have `Path=/` and no `Domain` or it is rejected. CLAUDE.md
§2.13 names `__Host-` cookies as a locked security baseline, so we keep the prefix and
use `Path=/`. The narrower-path benefit is covered by `HttpOnly` + `SameSite=Strict` +
server-side refresh-reuse detection. See the note in `apps/server/src/auth/cookies.ts`.

## 7. Running locally / tests

```bash
# Postgres + Mailpit. Use POSTGRES_PORT=5433 if 5432 is taken locally.
docker compose -f apps/server/docker-compose.yml up -d
pnpm --filter @cairn/server run migrate     # idempotent; harness also migrates on boot
pnpm --filter @cairn/server run test         # integration tests vs real Postgres
```

Tests use the in-memory email provider (to read tokens) and generate JWT/pepper
secrets per run with `crypto.randomBytes` — no production secret appears in tests.
The database is never mocked (CLAUDE.md §19.10).
