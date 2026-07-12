# docs/deployment.md — Cairn server & billing deployment runbook

**Status:** P4 planning artifact. Cloud go-live was previously deferred (local Docker only); this runbook is the plan to take the Fastify backend + billing webhooks live when you choose to. It documents steps — running it is a deliberate, separate action. Companion to **docs/billing.md** and **CLAUDE.md §18 (architecture), §19.6 (migrations), §19.8 (env)**.

Nothing here changes the desktop app's local-first guarantee: the journal runs fully offline with no account (§2.4). Only **Cairn Pro** (web app + E2E-encrypted sync + the pre-trade gate entitlement) needs this server.

---

## 1. What ships

| Component | What it is | Where |
| --- | --- | --- |
| API server | Fastify (`apps/server`), stateless, horizontally scalable | container / VM / PaaS |
| Postgres 16 | canonical store (users, subscriptions, vault ops, webhook ledger) | managed Postgres |
| Entitlement cache | in-memory by default; Redis (Upstash) for multi-instance | optional |
| Billing webhooks | `/webhooks/dodo`, `/webhooks/stripe`, `/webhooks/razorpay` | public HTTPS |

No Redis is required for a single instance (the cache defaults in-memory; `invalidate` is a local eviction). Add Redis only when you run more than one API node — it drops in behind the same interface (docs/billing.md §2).

---

## 2. Prerequisites

- A managed **Postgres 16** with a private connection string.
- A host that terminates **TLS** and forwards to the API (webhook signatures assume HTTPS; never expose the API over plain HTTP).
- A public hostname, e.g. `https://api.cairn.app`, and the web app origin, e.g. `https://app.cairn.app`.
- Provider dashboards: **Dodo Payments** (default), and optionally Stripe / Razorpay.

---

## 3. Configuration (secrets)

Set every secret via the platform's secret manager — never a committed `.env` (§2.13, §19.8). The full list is in `apps/server/.env.example`. Minimum for a Dodo-only production deploy:

```
NODE_ENV=production
DATABASE_URL=postgres://…                 # managed Postgres, TLS
PASSWORD_PEPPER=<64 hex>                   # min 32 chars, high entropy
JWT_SECRET=<64 hex>                        # min 32 chars
APP_URL=https://app.cairn.app
CORS_ORIGINS=https://app.cairn.app
COOKIE_SECURE=true                         # required behind TLS
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_…

# Billing — Dodo (default gateway)
DODO_API_KEY=<live key>
DODO_WEBHOOK_SECRET=whsec_…
DODO_PRODUCT_ID=prod_…                     # monthly Pro product
DODO_PRODUCT_ID_ANNUAL=prod_…             # annual Pro product
DODO_ENVIRONMENT=live

# Redirect targets (default under APP_URL if unset)
BILLING_SUCCESS_URL=https://app.cairn.app/billing/success
BILLING_CANCEL_URL=https://app.cairn.app/billing/cancel
BILLING_UPGRADE_URL=https://app.cairn.app/pricing
```

`gitleaks` runs in CI (§2.13) — no secret should ever reach source. A provider is only activated when **all** its secrets are present (`billing/registry.ts`), so you can ship Dodo-only and add Stripe/Razorpay later without code changes.

---

## 4. Database migrations

The forward-only runner applies `apps/server/drizzle/NNNN_*.sql` in order, each in a transaction, recording applied ids in `schema_migration` (§19.6). Migrations are idempotent (`IF NOT EXISTS`, guarded constraints).

```
pnpm --filter @cairn/server run migrate
```

P4 adds **`0005_dodo_webhook_provider.sql`** — it widens the `webhook_event.provider` CHECK to include `'dodo'`. Run migrations **before** the new server build starts taking Dodo webhooks, or those inserts will fail the old constraint.

---

## 5. Deploy sequence

1. **Provision** Postgres; capture `DATABASE_URL`.
2. **Set secrets** (section 3) in the platform.
3. **Migrate**: `pnpm --filter @cairn/server run migrate` against the production DB.
4. **Build & start** the API (`pnpm --filter @cairn/server run build` then the platform start command). Health-check: `GET /health` should return `200`.
5. **Register webhook endpoints** (section 6) in each provider dashboard.
6. **Smoke test** a checkout in each configured provider's test mode, then flip Dodo to `live`.

Zero-downtime: the API is stateless, so roll instances behind the load balancer. Because migration 0005 only *widens* a constraint, old and new server builds are compatible during the rollover.

---

## 6. Webhook endpoint registration

Register the public HTTPS URL and copy the signing secret into the matching env var. Signature verification (§2.13, docs/billing.md §8) rejects anything unsigned, so the secret must match exactly.

| Provider | Endpoint | Signing secret env |
| --- | --- | --- |
| Dodo | `https://api.cairn.app/webhooks/dodo` | `DODO_WEBHOOK_SECRET` |
| Stripe | `https://api.cairn.app/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` |
| Razorpay | `https://api.cairn.app/webhooks/razorpay` | `RAZORPAY_WEBHOOK_SECRET` |

**Dodo events to subscribe:** `subscription.active`, `subscription.renewed`, `subscription.on_hold`, `subscription.failed`, `subscription.cancelled`, `subscription.expired`, `refund.succeeded`. The receiver dedupes on `webhook-id` and acks `200` on duplicates (providers retry with backoff), so subscribing to extra events is harmless.

**Local development:** `dodo wh listen` forwards test-mode deliveries to `http://localhost:3000/webhooks/dodo` with real signature headers (analogous to `stripe listen`). Requires a test-mode key and `dodo login`.

---

## 7. The grace sweep (cron)

Time-based transitions (`past_due → canceled` after the 14-day hard grace; lapsed `trial → canceled`) are not webhook-driven — `sweepExpiredGrace(db, now)` makes the terminal state durable (docs/billing.md §3). Schedule it (e.g. hourly) via the platform scheduler or a cron container. Lazy expiry in `deriveSubscription` keeps gating correct between sweeps, so the exact cadence is not safety-critical.

---

## 8. Local backend (current default)

Until go-live, the backend runs locally against Docker Postgres:

```
cd apps/server
docker compose up -d           # Postgres 16 + Mailpit
pnpm --filter @cairn/server run migrate
pnpm --filter @cairn/server run dev
```

**Windows note (host gates):** the server integration gates need Postgres reachable on the published port; if `postgres up` / `@cairn/server run test` / `docs routes smoke` fail with a bind error, run an elevated `net stop winnat && net start winnat` (or reset the dynamic-port range) to free the port, then re-run `.\run-host-gates.ps1`.

---

## 9. Post-deploy verification

- `GET /health` → `200`.
- A test checkout in each configured provider returns a hosted URL and, on completion, a `subscription.active`/`customer.subscription.created`/`subscription.activated` webhook flips the row to `pro` (check `GET /billing/status`).
- A deliberately bad webhook signature returns `400` and writes **no** `subscription`/`webhook_event` row (the single most important security check, §2.13).
- `GET /admin/audit-log` (with `ADMIN_TOKEN`) shows `webhook.<provider>.*` receipt rows.
