<!-- v2.0 NEW — created in Stage 7 (Production Hardening & Launch).
     Referenced by CLAUDE.md §4 docs map and §18.9. Companion to docs/runbook.md
     (operations) and docs/asvs-checklist.md (security). This is the public-launch
     gate: every item must be ✅ before the soft-launch access list (§2 below) is
     converted to a public launch. -->

# Cairn — Launch Checklist & Soft-Launch Plan

**Last reviewed:** 2026-06-11. **Owner:** Jai Akash (solo operator — see `docs/runbook.md` §0).

**Legend:** ✅ **Done** — evidence linked · ⏳ **Outstanding** — not yet done.

---

## 1. The 30-item launch checklist

### Legal

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Privacy policy published, covering local-first storage, optional E2E-encrypted sync, telemetry (opt-in/off by default), and payments | ⏳ | Must reflect CLAUDE.md §2.4/§2.13 — server is architecturally incapable of reading vault content; say so explicitly |
| 2 | Terms of Service published | ⏳ | Cover subscription terms, acceptable use, no-advice disclaimer (CLAUDE.md §1 "what Cairn is NOT") |
| 3 | Data Processing Agreement (DPA) executed or accepted with every sub-processor | ⏳ | Stripe, Razorpay, Resend/Postmark, Supabase/Neon, Sentry, hosting provider (Fly.io/Railway/Render) |
| 4 | Cookie banner / consent on the web app, if any non-essential cookies or analytics are set | ⏳ | Desktop app has no cookies; web app `__Host-` refresh cookie is essential (no consent needed), but any analytics script does need one |
| 5 | Subprocessor list published (linked from privacy policy) and kept current | ⏳ | Same list as item 3 |
| 6 | Article 30 "records of processing activities" documented | ⏳ | Can start as a single internal doc; references docs/runbook.md §4/§5 for the export/deletion procedures it describes |
| 7 | GDPR/DPDP data export & deletion procedures (`docs/runbook.md` §4–§5) tested end-to-end at least once against a real (non-prod) account | ⏳ | Dry-run with a throwaway account before relying on it for a real request |

### Product

| # | Item | Status | Notes |
|---|---|---|---|
| 8 | Pricing page live, plan/feature matrix matches `EntitlementService` exactly | ⏳ | `docs/billing.md` plan matrix is the source of truth — pricing page must not drift from it |
| 9 | Refund policy published and matches the actual Stripe/Razorpay configuration | ⏳ | Razorpay (India) and Stripe (global) may have different statutory minimums — check both |
| 10 | Support email live and monitored (e.g. `support@cairn.app`, forwarding to Akash) | ⏳ | This is the "second responder" placeholder until one exists (`docs/runbook.md` §1) |
| 11 | Status page live at `status.cairn.app` | ⏳ | Even a static page is fine pre-launch; should reflect API health |
| 12 | Onboarding tested end-to-end on a clean install: no-account (fully offline) path AND create-account-and-enable-sync path | ⏳ | Both paths must work — local-first is non-negotiable (CLAUDE.md §14 #18) |
| 13 | Free tier confirmed fully usable offline with zero account/network dependency | ⏳ | Re-verify after Wave 4 broker work — broker adapters must remain optional |
| 14 | Cancellation flow tested: sync stops, local data is untouched, vault retained 90 days then crypto-shredded (`docs/billing.md` §7, `docs/runbook.md` §5.1) | ⏳ | |
| 15 | In-app feedback / bug-report path wired (e.g. mailto link or form to support email) | ⏳ | Critical for the soft-launch cohort (§2 below) — they are the bug-finding mechanism |

### Tech

| # | Item | Status | Notes |
|---|---|---|---|
| 16 | Sentry production project configured for `apps/server` (always-on per §2.13) with DSN set in production env | ⏳ | Desktop Sentry remains opt-in/off by default — do not flip that default |
| 17 | OpenTelemetry traces flowing from the API to Grafana Tempo/Honeycomb in production | ⏳ | `ops/dashboards/api-health.json` etc. should show real data |
| 18 | `backup-verify.yml` green for 3 consecutive scheduled runs against production PITR | ⏳ | This is CLAUDE.md §16.b #47's literal completion condition — see `docs/runbook.md` §6 |
| 19 | Rate limiting verified live on every auth endpoint (per-IP and per-identifier) | ⏳ | Hit `/auth/login` etc. past the limit in a staging environment and confirm 429s |
| 20 | Security headers verified on a live response: `helmet` headers, strict CSP, `__Host-` cookies (`Secure`, `HttpOnly`, `SameSite=Strict`) | ⏳ | `curl -i` the production API and check headers directly — don't trust config alone |
| 21 | `release.yml` produces artifacts for Windows, macOS, and Linux; Windows/macOS are signed (and macOS notarized) per `docs/runbook.md` §7 | ⏳ | At minimum, a draft release with all three platforms must succeed once before the public launch tag |
| 22 | Auto-update feed configured and tested: install an old version, confirm the update prompt fires and applies | ⏳ | Exercises `latest.yml`/`latest-mac.yml` published by `release.yml` |
| 23 | Production Postgres has PITR enabled and `BACKUP_VERIFY_DATABASE_URL` secret configured (prerequisite for item 18) | ⏳ | |

### Comms

| # | Item | Status | Notes |
|---|---|---|---|
| 24 | `CHANGELOG.md` started and current through the latest tag | ⏳ | One entry per release tag, written for users not for git history |
| 25 | Blog announcement post drafted | ⏳ | Positioning per CLAUDE.md §17.5 #30 — "real-time, broker-aware prevention," not feature parity |
| 26 | Launch post drafted for X / Hacker News / Reddit (r/Forex, r/algotrading, etc.) | ⏳ | Hold until the soft-launch window (§2) has produced a "no critical bugs" result |
| 27 | Soft-launch invite (email or DM template) drafted for the ~50-trader access list | ⏳ | See §2.1 |
| 28 | Public-launch announcement email drafted for the eventual full access list | ⏳ | Send only after §2.4's trigger condition is met |
| 29 | Documentation reachable from the app and/or marketing site (at minimum: privacy policy, ToS, support email, status page links) | ⏳ | |
| 30 | Post-launch monitoring cadence documented and pointed at from this checklist | ✅ | `docs/runbook.md` §1 (paging policy) — already covers this; no new doc needed |

---

## 2. Soft-launch plan

### 2.1 Invite-only access list (~50 traders)

- Build the list from existing trading-community contacts (ICT/SMC Discord servers,
  prop-firm communities Akash is already part of) — people who will actually use the
  rule engine daily, not just kick the tires.
- Invite mechanism: a signed access code or magic-link sent via the template from
  checklist item 27. The desktop app works fully without an account (CLAUDE.md §14
  #18); the invite is specifically for testers who will exercise **sync** and
  **billing** (the new v2.0 surfaces), since those are what the soft-launch window is
  validating.
- Cap at ~50. The goal is signal density (active daily users reporting real issues),
  not reach.

### 2.2 Two-week stability window

- Starts the day the first invite batch goes out. Length: 14 days, fixed — do not
  shorten it even if early signal looks good (sync/billing edge cases tend to surface
  on day 5–10, after testers have accumulated real trade history and at least one
  billing cycle event).
- During the window: monitor `ops/dashboards/api-health.json`,
  `ops/dashboards/sync-throughput.json`, and `ops/dashboards/billing-state.json` daily
  (per `docs/runbook.md` §1 — no alerting yet, manual checks).
- Every P1/P2 reported during the window is fixed and re-verified before the window's
  trigger condition (§2.4) is evaluated — a P1 fix does not reset the 14-day clock,
  but the fix must ship and be observed stable for at least 48h before launch.

### 2.3 Daily standup-with-myself note template

Kept as a dated entry (e.g. in a `soft-launch-log.md` scratch file, not committed —
this is operational, not specification):

```
## YYYY-MM-DD

- Active testers today: N / ~50
- New issues reported: <list, with severity P1/P2/P3>
- 5xx rate (last 24h): X.XX%
- Sync errors (last 24h): N
- Billing webhook failures (last 24h): N
- Open P1s: <list or "none">
- Open P2s: <list or "none">
- Anything that changes the launch-date estimate?
```

### 2.4 Public-launch trigger condition

The soft-launch window converts to a public launch (checklist items 26 + 28 fire)
**only when, over the full 14-day window:**

- **5xx error rate < 0.1%**, measured from `ops/dashboards/api-health.json`, AND
- **No P1 (critical) bugs open** — per the severity scale in `docs/runbook.md` §1.

If either condition fails at the 14-day mark, the window extends in 7-day increments
(re-measuring the trailing 14 days) until both hold simultaneously. There is no
override — "ship anyway" is explicitly out of scope per CLAUDE.md §2.12 (no slop,
ever) and §19's "if a change cannot meet this bar, it does not ship."
