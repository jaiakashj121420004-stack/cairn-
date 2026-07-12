# docs/go-live-checklist.md — the wiring-day runbook

**Purpose.** Everything that must be done by a human (accounts, secrets, one deploy) to take
Cairn from "code complete" to "live and taking payments." Do it top to bottom — each step is
a few minutes. Companion to `docs/deployment.md` (reference), `docs/runbook.md` (ops), and
`docs/launch-checklist.md` (the public-launch gate that comes after this).

The app code is done and gate-green. Nothing here needs more coding. Budget ~1–2 hours end
to end, most of it waiting on account signups and DNS.

> Decided constraint (§14, launch-checklist §3): **no free trials** — real paid plans and a
> permanent free tier only. Cloud/email/domain are deferred to this day on purpose.

---

## 0. Prerequisites you create accounts for (do these first, in parallel)

| # | Account | Why | Cost |
|---|---|---|---|
| 0.1 | **Domain** (Cloudflare Registrar / Porkbun / Namecheap) | API URL + verified email sender | ~$10/yr |
| 0.2 | **Railway** | hosts the Fastify API + managed Postgres | ~$5–15/mo |
| 0.3 | **Resend** | transactional email (verify / reset / magic-link) | free tier, permanent |
| 0.4 | **Dodo Payments** | the payment gateway (default MoR) | per-transaction |
| 0.5 | **Sentry** (optional but recommended) | server error tracking | free tier |
| 0.6 | **Cloudflare Pages** or **Vercel** | hosts the web app | free tier |

---

## 1. Generate the server secrets (1 min, local)

```
node -e "console.log('PASSWORD_PEPPER=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ADMIN_TOKEN=' + require('crypto').randomBytes(32).toString('hex'))"
```

Keep these three. `ADMIN_TOKEN` also gates the grace-sweep cron (step 7).

## 2. Dodo Payments — key + products

1. In the Dodo dashboard, create an API key and a **webhook signing secret** (Developer →
   Webhooks). Note `DODO_ENVIRONMENT` = `test` while testing, `live` for real charges.
2. Create two **subscription** products: **Cairn Pro (Monthly) $15/mo** and **Cairn Pro
   (Annual) $150/yr** (India GST-inclusive equivalents ₹1,299 / ₹12,990).
   - Shortcut: `export DODO_API_KEY=... DODO_ENVIRONMENT=test` then
     `pnpm --filter @cairn/server dodo:setup` — it validates the key, finds your products,
     and prints a paste-ready `DODO_PRODUCT_ID` / `DODO_PRODUCT_ID_ANNUAL` block.

## 3. Railway — deploy the API + Postgres

1. New project → **Deploy from GitHub repo** (this repo). Railway reads `railway.json` and
   builds `apps/server/Dockerfile`. The server **auto-migrates on boot** (no separate
   migrate step needed).
2. Add the **PostgreSQL** plugin; copy its connection string into `DATABASE_URL`.
3. Set service variables (Railway → Variables):
   ```
   NODE_ENV=production
   APP_URL=https://<your-domain>          # web app origin
   CORS_ORIGINS=https://<your-domain>
   COOKIE_SECURE=true
   PASSWORD_PEPPER=...    JWT_SECRET=...    ADMIN_TOKEN=...   # from step 1
   DATABASE_URL=...                                          # from 3.2
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=...                                        # step 5
   HIBP_CHECK=on
   DODO_API_KEY=...   DODO_WEBHOOK_SECRET=...   DODO_ENVIRONMENT=live
   DODO_PRODUCT_ID=...   DODO_PRODUCT_ID_ANNUAL=...          # step 2
   # optional: SENTRY_DSN=...
   ```
4. Point `api.<your-domain>` at the Railway service (Railway → Settings → Networking →
   Custom Domain). TLS is automatic.

## 4. Preflight the server config (before trusting it)

With the production env exported locally (or via Railway's shell):

```
pnpm --filter @cairn/server preflight
```

Fix every ✗ before continuing. It checks HTTPS, secure cookies, a configured billing
provider, the admin token, email, and DB reachability.

## 5. Resend — email

Verify your sending domain in Resend, set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (already
in step 3). The server has **no SMTP path** — Resend is the production sender.

## 6. Register the Dodo webhook

In the Dodo dashboard, add a webhook endpoint: `https://api.<your-domain>/webhooks/dodo`,
subscribe to `subscription.active`, `subscription.renewed`, `subscription.on_hold`,
`subscription.failed`, `subscription.cancelled`, `subscription.expired`, `refund.succeeded`.
Its signing secret is `DODO_WEBHOOK_SECRET` (step 2).

## 7. Turn on the grace-sweep cron

Set two **GitHub repo secrets** so `.github/workflows/billing-sweep.yml` runs (every 6h):
```
CAIRN_API_URL=https://api.<your-domain>
CAIRN_ADMIN_TOKEN=<the ADMIN_TOKEN from step 1>
```
(Until set, the workflow skips loudly; lazy expiry keeps gating correct meanwhile.)

## 8. Verify billing end-to-end

```
pnpm --filter @cairn/server verify:billing https://api.<your-domain>
```
Expect: `/health` 200, `/webhooks/dodo` rejects unsigned (400), `/billing/status` requires
auth (401). Then do one real test-mode checkout from the app and confirm the `subscription`
row appears (webhook fires within seconds).

## 9. Web app — deploy

Deploy `apps/web` to Cloudflare Pages (or Vercel): build `pnpm --filter @cairn/web build`,
set the API base to `https://api.<your-domain>`, and set the `cf-country` middleware if using
Cloudflare (see `apps/web`). Point `app.<your-domain>` at it.

## 10. Desktop app — re-release pointing at the cloud

Bake `CAIRN_API_URL=https://api.<your-domain>` into the build, run
`pnpm --filter @cairn/desktop run dist:local`, and upload the new installer to a GitHub
release. Without this, a downloaded desktop app talks to the user's own localhost and cloud
features silently no-op. (Code signing needs certs — see `docs/runbook.md` §7; unsigned is
fine for the soft-launch cohort.)

---

## 11. Then: the launch gate

Everything above makes the product *work*. `docs/launch-checklist.md` is the gate to a
**public** launch — publish the legal docs (`docs/legal/`), wire the support email + status
page, run `backup-verify.yml` green for 3 days, and complete the 14-day soft launch with
~50 testers. cTrader live connect is a separate track (Spotware KYC).
