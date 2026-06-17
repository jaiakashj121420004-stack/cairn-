import { metrics } from '@opentelemetry/api'

/**
 * OTel metric instruments (CLAUDE.md §18.9).
 *
 * Recording these is always safe: with no `OTEL_EXPORTER_OTLP_ENDPOINT` configured,
 * `startOtel` (see `telemetry/otel.ts`) never runs, so `metrics.getMeter` returns the
 * no-op API meter and every `.add`/`.record` call below is a cheap no-op.
 *
 * Naming and label cardinality follow OTel semantic-convention style: route patterns
 * (e.g. `/vault/push`, not the literal request URL) keep label cardinality bounded.
 */

const meter = metrics.getMeter('cairn-api')

/** Total HTTP requests, by `route`, `method`, and `status_code`. */
export const httpRequestsTotal = meter.createCounter('http_requests_total', {
  description: 'Total HTTP requests, by route/method/status',
})

/** HTTP request duration in milliseconds, by `route` and `method`. Used for p95 latency. */
export const httpRequestDurationMs = meter.createHistogram('http_request_duration_ms', {
  description: 'HTTP request duration in milliseconds, by route/method',
  unit: 'ms',
})

/** Vault ops accepted via `POST /vault/push`. */
export const syncPushOpsTotal = meter.createCounter('sync_push_ops_total', {
  description: 'Vault ops accepted via /vault/push',
})

/** Billing webhook deliveries received, by `provider` and `outcome` (`accepted` | `duplicate`). */
export const webhookReceivedTotal = meter.createCounter('webhook_received_total', {
  description: 'Billing webhook deliveries received, by provider and outcome',
})

/** Account signups started, via `POST /auth/signup`. */
export const signupTotal = meter.createCounter('signup_total', {
  description: 'Account signups started',
})

/** Email verifications completed, via `POST /auth/verify`. */
export const signupVerifiedTotal = meter.createCounter('signup_verified_total', {
  description: 'Email verifications completed',
})
