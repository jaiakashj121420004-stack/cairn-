<!-- Extracted from CLAUDE.md (v2.0). Loaded on demand per CLAUDE.md §0/§4 — not part of the always-in-context root. -->

## 20. SUBSCRIPTION-READINESS CONTRACT

This contract makes it possible to add or change pricing, providers, and entitlements without rewrites. It is binding from Stage 18.5 (Backend Core) onward — the abstractions exist before there's a single paid feature.

### 20.1 Single source of truth for "is user X entitled to feature Y"

```ts
// apps/server/src/billing/entitlement-service.ts
export interface EntitlementService {
  canUse(userId: string, feature: Feature): Promise<boolean>;
  currentPlan(userId: string): Promise<PlanSnapshot>;
  trialDaysRemaining(userId: string): Promise<number | null>;
  state(userId: string): Promise<'free' | 'trial' | 'active' | 'past_due' | 'canceled'>;
}
```

All paid-feature checks in the codebase route through this. There is no other way to learn a user's plan. The renderer talks to this through a `Transport` call, not a Stripe SDK call.

### 20.2 Generic provider interface

```ts
// apps/server/src/billing/provider.ts
export interface BillingProvider {
  readonly name: 'stripe' | 'razorpay' | string;
  createCustomer(input: CreateCustomerInput): Promise<ProviderCustomer>;
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  openPortal(input: PortalInput): Promise<{ url: string }>;
  cancelSubscription(subscriptionId: string, when: 'now' | 'period_end'): Promise<void>;
  verifyWebhook(body: Buffer, headers: IncomingHttpHeaders): WebhookEvent;
}
```

Adding Paddle, LemonSqueezy, or any other provider is a class that implements this. The `EntitlementService` reads from the `subscription` table; it does not care which provider populated it.

### 20.3 Plan / feature matrix

```ts
// packages/billing-types/src/plans.ts
export const PLANS = {
  free: { features: ['local_journal', 'rule_engine', 'analytics_basic'] },
  pro:  { features: ['*'] },
} satisfies Record<PlanId, Plan>;
```

Features are strings. A feature gate is one line: `await entitlements.canUse(userId, 'cloud_sync')`. Never `if (user.plan === 'pro')`.

### 20.4 Webhook contract
- Every webhook is signature-verified before any DB read.
- Every webhook is deduped via `webhook_event(provider, external_id)` unique constraint.
- Every state change writes an `audit_log` row.
- A webhook that arrives before the matching `/billing/checkout` callback must reconcile correctly — the test suite includes this race.

### 20.5 State machine
A subscription is always in one of: `trial`, `active`, `past_due`, `canceled`. Transitions are explicit:
- `trial → active` on first successful payment.
- `active → past_due` on `invoice.payment_failed`.
- `past_due → active` on `invoice.paid`.
- `past_due → canceled` after 14-day hard grace.
- `* → canceled` on explicit user cancellation, taking effect at `period_end`.

Tests cover every edge of this graph.

### 20.6 Tax & receipts
- Stripe Tax handles VAT/sales-tax for non-India regions.
- Razorpay handles GST for India.
- Receipts and invoices are delivered by the provider directly; Cairn never generates a tax document itself.

### 20.7 Refunds & disputes
- All refunds initiated by support — never in-app.
- A refund webhook revokes the entitlement immediately and writes an `audit_log` row.
- Disputes (chargebacks) write an `audit_log` row at warning severity but do not auto-revoke; ops decides.

### 20.8 Local-data guarantee
- Cancelling a subscription stops sync. It does not delete the user's local SQLite. It does not delete the user's vault from the server immediately either — vault retention follows a documented retention policy in `docs/billing.md` (default: 90 days after cancellation, then crypto-shredded by deleting the wrapped data key).

### 20.9 What can never be added under this contract
- Per-feature priced add-ons that bypass `EntitlementService`. If a future SKU exists, it adds to the matrix in §20.3, period.
- Hard-coded provider IDs in renderer or feature code. The renderer only knows about `Feature` strings.
- Trial extensions outside the state machine. If you need to extend, you do it via a typed admin action that produces an `audit_log` row.
