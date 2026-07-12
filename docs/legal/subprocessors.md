# Cairn — Sub-processors

> **DRAFT — keep current.** This list must reflect the services you actually deploy with, and
> be linked from the Privacy Policy (launch-checklist #3, #5). Update it whenever a
> sub-processor is added or removed, and notify subscribers of material changes.

**Last updated:** [DATE]

Cairn uses the following sub-processors to provide the paid cloud service. Each is bound by a
data-processing agreement (DPA). The **free local desktop app uses none of these** — it runs
entirely on your device.

| Sub-processor | Purpose | Data processed | Location | DPA |
|---|---|---|---|---|
| **[Hosting — Railway / Fly.io / Render]** | Runs the API server | Encrypted vault blobs, account + billing metadata, server logs | [region] | [link] |
| **[Database — Neon / Supabase]** | Managed Postgres | Same as hosting (ciphertext + metadata) | [region] | [link] |
| **Resend** | Transactional email (verify, reset, magic-link) | Email address, message content | [region] | [link] |
| **Dodo Payments** | Payment processing (Merchant of Record) | Name, email, billing/payment details, tax info | [region] | [link] |
| **[Stripe]** *(if enabled)* | Payment processing (fallback) | Same as above | [region] | [link] |
| **[Razorpay]** *(if enabled, India)* | Payment processing (fallback) | Same as above | [region] | [link] |
| **Sentry** *(if enabled)* | Server error tracking (PII-scrubbed) | Error traces, request ids | [region] | [link] |
| **[Telemetry — Sentry/OTel backend]** *(opt-in, default off)* | Crash/usage analytics only if the user opts in | Aggregated crash/usage events | [region] | [link] |

**Note on encrypted content:** the hosting and database sub-processors store your vault as
ciphertext only. They — and we — cannot read it.

To be notified of changes to this list, email support@cairn.app.
