# docs/billing.md — Billing, Entitlements & Subscriptions

**Status:** v2.0 Stage 6 (server slice). Binding companion to **CLAUDE.md §2.14, §3.1d, §20** and the locked decisions §14 #23–#24.
**Source of truth** for the plan matrix, the entitlement contract, the §20.5 state machine, tax handling, retention, and the "how to add a provider" recipe.

A subscription's canonical state always lives in the Postgres `subscription` table, written by the webhook receivers. No hot path ever calls a provider API (§2.14). The renderer only ever speaks `Feature` strings and a country code — it never names a provider (§20.9).

---

## 1. Plan / feature matrix (§20.3)

Plans are defined in `apps/server/src/billing/plans.ts`. Features are plain strings; a gate is one line — `await entitlements.canUse(userId, 'cloud_sync')` — never `if (plan === 'pro')`.

| Feature string       | Free | Pro | Notes                                              |
| -------------------- | :--: | :-: | -------------------------------------------------- |
| `local_journal`      |  ✅  | ✅  | Local-first journaling — free forever (§2.4).      |
| `rule_engine`        |  ✅  | ✅  | Real-time rule blocks / hard locks — the moat.     |
| `analytics_basic`    |  ✅  | ✅  | Core dashboards.                                   |
| `analytics_advanced` |  ❌  | ✅  | Expanded reports / insight surfacing.              |
| `cloud_sync`         |  ❌  | ✅  | E2E-encrypted vault push/pull. **Gated at /vault.** |
| `multi_device`       |  ❌  | ✅  | More than one enrolled device.                     |

`pro` holds the wildcard `['*']`, so adding a new feature string grants it to Pro automatically; decide explicitly whether Free gets it. Adding a SKU **extends this matrix and nothing else** (§20.9) — no per-feature priced add-ons that bypass the matrix.

The single purchasable plan today is `pro`, in two intervals: **monthly** and **annual**.

---

## 2. Entitlement service (§20.1)

`apps/server/src/billing/entitlement-service.ts` is the **only** way code learns a user's plan.

```ts
interface EntitlementService {
  canUse(userId, feature): Promise<boolean>       // the one gate
  currentPlan(userId): Promise<PlanSnapshot>      // { plan, state, currentPeriodEnd, trialEndsAt }
  trialDaysRemaining(userId): Promise<number | null>
  state(userId): Promise<'free'|'trial'|'active'|'past_due'|'canceled'>
  invalidate(userId): Promise<void>               // called by webhooks on every state change
}
```

It reads the `subscription` row and runs it through the pure `deriveSubscription()` (`billing/derive.ts`) — the **same** function the auth-token path (`auth/entitlement.ts`) and `GET /billing/status` use, so the token, the gates, and the status endpoint can never disagree.

**Caching.** Reads are cached for 60 s through an injectable `EntitlementCache`. The default `MemoryEntitlementCache` is all the tests need; a Redis (Upstash) implementation drops in for multi-instance production without touching callers (mirrors the rate-limit store, §3.1b). On every webhook state change the receiver calls `invalidate(userId)` so entitlement is consistent **immediately** rather than after the TTL. In a multi-node deployment the Redis cache implements `invalidate` as a pub/sub publish that evicts the key on every node.

**Lazy expiry.** `deriveSubscription` decays a lapsed trial / grace / cancelled-period to `free` the moment the window closes — so a user loses access even before the grace-sweep job (below) persists the terminal `canceled` status.

---

## 3. Subscription state machine (§20.5)

A subscription is always in one of `trial | active | past_due | canceled` (column `subscription.status`, distinct from the gating `entitlement`). Transitions are explicit and total in `billing/state-machine.ts`; the DB mutation runs through `billing/apply.ts` inside a transaction with a row lock, and writes a `billing.state_change` audit row.

```
                      payment_succeeded
        ┌───────────────────────────────────────────┐
        │                                            ▼
   ┌────────┐  payment_succeeded   ┌────────┐   (renewal, no-op)
   │ trial  │ ───────────────────► │ active │ ◄─────────────────┐
   └────────┘                      └────────┘                   │
     │  │  │ canceled                 │   │ canceled            │ payment_succeeded
     │  │  └──────────────┐           │   └──────────┐          │ (recovery)
     │  │ grace_expired   │           │ payment_failed│         │
     │  ▼                 ▼           ▼               ▼         │
     │ ┌──────────┐   ┌──────────┐  ┌─────────┐   ┌──────────┐ │
     │ │ canceled │ ◄─┤ canceled │  │past_due │ ──┤ past_due │─┘
     │ └──────────┘   └──────────┘  └─────────┘   └──────────┘
     │  ▲                              │  │ grace_expired (14-day hard grace)
     │  │ refunded (from any state)    │  └──────────────► canceled
     └──┘                              │ canceled ───────► canceled
```

Named edges (§20.5):

- `trial → active` on first successful payment.
- `active → past_due` on `invoice.payment_failed`.
- `past_due → active` on `invoice.paid`.
- `past_due → canceled` after the **14-day hard grace** (the sweep job, below).
- `* → canceled` on explicit cancellation (takes effect at `period_end` when one is in the future) **or** on any refund (immediate).
- `canceled → active` on a new successful payment (reactivation of the same subscription).

Self-loops (e.g. a second `payment_succeeded` while already `active`) are **idempotent no-ops** — providers redeliver, so a repeat event must never error. Any edge the graph does not name (e.g. `payment_failed` on a `canceled` subscription) throws **`ILLEGAL_STATE`**, rolls the transaction back, and the webhook receiver records a `billing.illegal_transition` warning audit row and still acks `200` (re-delivering a structurally-impossible event will never succeed).

### Grace windows

- **Soft grace (3 days):** dunning only. On the first failed renewal the user is `past_due` but keeps Pro; transactional dunning emails go out over ~3 days inviting them to fix their card. No access change. (Dunning email cadence is a provider/automation concern; access is governed by the hard grace.)
- **Hard grace (14 days):** the access cutoff. `past_due` keeps Pro features until `grace_until = failure + 14 days`; after that the sweep transitions `past_due → canceled` and the entitlement decays to `free`. Constant: `HARD_GRACE_DAYS` in `billing/apply.ts`.

### The grace sweep

Time-based transitions (`past_due → canceled`, lapsed-`trial → canceled`) are not webhook-driven. `sweepExpiredGrace(db, now)` finds every row whose `grace_until` (or `trial_ends_at`) has elapsed and runs each through `grace_expired`. A cron calls it on a schedule; the integration suite calls it after advancing the clock. Lazy expiry in `deriveSubscription` means gating is already correct between sweeps — the sweep just makes the terminal state durable and auditable.

---

## 4. Country routing & checkout (§3.1d, §20.6)

`POST /billing/checkout` accepts `{ country, plan, interval }`:

- `country` — ISO-3166 alpha-2, normalised upper-case. Geo-detected client-side (Cloudflare `CF-IPCountry` header on web; a country dropdown on desktop). The **server** chooses the gateway: `country === 'IN'` → **Razorpay**, else → **Stripe**. The client never names a provider (§20.9). The chosen region is stored on the `subscription` row (`billing_region`); the gateway is implied by `provider`.
- `plan` — `pro` (default).
- `interval` — `monthly` (default) or `annual`. The provider selects the matching price/plan id (`STRIPE_PRICE_ID` / `STRIPE_PRICE_ID_ANNUAL`, `RAZORPAY_PLAN_ID` / `RAZORPAY_PLAN_ID_ANNUAL`). When an annual id is not configured, checkout falls back to the monthly price.

### Free → Trial → Active

When checkout starts, the server **immediately** seeds a `subscription` row in `trial` state with `trial_ends_at = now + 14 days` and `provider_subscription_id = null` — *before* redirecting to the hosted page. This lets the user use Pro features during the redirect without racing the webhook. The row is seeded only for users with no live entitlement (new / lapsed / cancelled), so an active subscription is never downgraded back to trial. The provider's `customer.subscription.created` / `invoice.paid` webhook later fills the real `provider_subscription_id` and converts `trial → active`.

Other endpoints:

- `POST /billing/portal` — Stripe customers get the Stripe Customer Portal; Razorpay has no hosted portal, so management happens in-app / via support (its `openPortal` returns `NOT_IMPLEMENTED`).
- `POST /billing/cancel` — calls the provider; the resulting webhook is the source of truth that flips state. We do not optimistically mutate.
- `GET /billing/status` — canonical `{ plan, state, features, current_period_end }` read; no provider call.

---

## 5. Cloud-sync gate (§2.14, §20)

`/vault/push` and `/vault/pull` call `entitlements.canUse(userId, 'cloud_sync')`. A blocked caller receives **HTTP 402** with the envelope:

```json
{ "ok": false, "error": { "code": "UPGRADE_REQUIRED",
  "message": "cloud sync requires Cairn Pro",
  "details": { "code": "UPGRADE_REQUIRED", "upgrade_url": "<APP_URL>/pricing" } } }
```

The client maps `UPGRADE_REQUIRED` to the upgrade modal with honest copy: **sync is paid; local use is free, forever** (§2.4, §14 #28). Free users never have vault data on the server; cancellation stops sync but never deletes local data.

---

## 6. Tax & receipts (§20.6)

Cairn never generates a tax document itself — the provider delivers receipts and invoices directly.

- **Non-India (Stripe):** Stripe Tax computes VAT / sales tax. Checkout sets `automatic_tax: { enabled: true }`; when an existing customer is reused we set `customer_update: { address: 'auto' }` so Stripe collects the address it needs. Enable Stripe Tax in the dashboard and register tax obligations there. Map the Pro price to the **SaaS / electronically-supplied-services** tax code (Stripe `txcd_10103001` "Software as a service (SaaS) — business use", or the consumer SaaS code as appropriate for the registration); record the chosen code alongside the price in the dashboard. Prices are entered **tax-exclusive**; Stripe adds tax on top at checkout.
- **India (Razorpay):** Razorpay collects **GST**. The INR Pro price is configured **GST-inclusive** on the Razorpay plan (the displayed INR amount already contains 18% GST), so the user sees the final price; Razorpay breaks out the GST line on its invoice. The `plan_id` referenced in the matrix is the same logical Pro plan — only the regional gateway differs, selected by the user's country at checkout.

> Summary: **Stripe price = tax-exclusive (Stripe Tax adds on top); Razorpay INR price = GST-inclusive.** Keep displayed headline prices consistent across regions by setting the INR plan amount to the GST-inclusive equivalent of the USD price.

---

## 7. Refunds, disputes & retention (§20.7, §20.8)

- **Refunds** are initiated by support only, never in-app. A refund webhook (`charge.refunded` / `refund.created` for Stripe; `refund.created` / `refund.processed` for Razorpay) runs `refunded` → `canceled` and revokes the entitlement **immediately**, writing a `warning`-severity audit row.
- **Disputes / chargebacks** write a `warning` audit row but do **not** auto-revoke; ops decides.
- **Local-data guarantee:** cancelling stops sync but never deletes the user's local SQLite (§14 #28).
- **Server vault retention:** after cancellation the server keeps the (still-encrypted, unreadable) vault for a **90-day** retention window, then **crypto-shreds** it by deleting the wrapped data key — rendering the ciphertext permanently undecryptable without a bulk delete. This window covers accidental cancellation and resubscription.

---

## 8. Webhook contract (§20.4)

Every delivery, in order: **(1)** verify the HMAC signature before any DB read — a bad/missing signature is `400` with no state change (the most important security test); **(2)** dedupe via the `webhook_event(provider, external_id)` unique index — `INSERT … ON CONFLICT DO NOTHING`; a duplicate acks `200` without re-applying side effects; **(3)** write a receipt audit row and dispatch through the state machine; **(4)** invalidate the user's entitlement cache. Webhook routes opt out of the per-IP rate limit (provider IPs burst on retries); abuse is contained by signature verification + the idempotency ledger.

| Internal event      | Stripe                                                        | Razorpay                                  |
| ------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| entry / seed        | `customer.subscription.created` (trialing/active)            | `subscription.activated`                  |
| `payment_succeeded` | `invoice.paid` / `invoice.payment_succeeded`                 | `subscription.charged`                    |
| `payment_failed`    | `invoice.payment_failed` (or sub status past_due/unpaid)     | `subscription.halted` / `.pending`        |
| `canceled`          | `customer.subscription.deleted`                              | `subscription.cancelled` / `.expired`     |
| `refunded`          | `charge.refunded` / `refund.created`                         | `refund.created` / `refund.processed`     |

User resolution: Stripe stamps `cairn_user_id` into `subscription_data.metadata` at checkout; invoice/charge events also resolve by `provider_subscription_id` / `provider_customer_id` lookup. Razorpay carries `cairn_user_id` in subscription `notes`.

---

## 9. How to add a new BillingProvider

The Razorpay implementation (`billing/razorpay-provider.ts`) is the **worked example** — copy its shape.

1. **Implement the interface** (`billing/provider.ts`):
   ```ts
   class PaddleBillingProvider implements BillingProvider {
     readonly name = 'paddle'
     createCustomer(input): Promise<ProviderCustomer> { … }
     createCheckout(input): Promise<{ url: string }> { …select price by input.interval… }
     openPortal(input): Promise<{ url: string }> { … }      // or reject NOT_IMPLEMENTED
     cancelSubscription(id, when): Promise<void> { … }
     verifyWebhook(body, headers): WebhookEvent { …HMAC over the raw body, timing-safe… }
   }
   ```
   Stamp `cairn_user_id` into provider metadata at checkout so the webhook can reconcile to a user (§20.4). Never call the provider in a hot path.

2. **Register it** in `billing/registry.ts`, instantiated **only** when all its secrets are present (so a deployment can ship with any subset of providers). Add the secrets to `env.ts` as `.optional()`.

3. **Route to it.** Add the country/condition that selects it in `providerForCountry()` (or generalise the router), and add its name to `billingProviderSchema` if it should appear in any client-visible enum.

4. **Handle its webhook.** Add a `/webhooks/<provider>` receiver: raw-body parser, signature verify, idempotency insert, audit receipt, then map its events to the internal lifecycle events in §8's table via `seedSubscription` / `applyLifecycleEvent`. Reuse the §20.5 machine — never write status transitions by hand.

5. **Mirror the tests.** Signature-mismatch (`400`, no DB write) and replay (one DB write) tests are **mandatory**. Add the lifecycle transitions and a refund-revocation test.

The `EntitlementService` needs **no** changes — it reads the `subscription` table and does not care which provider populated it.

---

## 10. Configuration (env)

| Var | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Stripe (monthly). Required to enable Stripe. |
| `STRIPE_PRICE_ID_ANNUAL` | Optional Stripe annual price; falls back to monthly. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay (monthly). Required to enable Razorpay. |
| `RAZORPAY_PLAN_ID_ANNUAL` | Optional Razorpay annual plan; falls back to monthly. |
| `BILLING_SUCCESS_URL`, `BILLING_CANCEL_URL`, `BILLING_PORTAL_RETURN_URL` | Redirect targets; default under `APP_URL`. |
| `BILLING_UPGRADE_URL` | Where a 402 sends the user; defaults to `APP_URL/pricing`. |

---

*A subscription's truth lives in one table, written by one path, read through one service. Each stone deliberate.*
