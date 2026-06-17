import { trace } from '@opentelemetry/api'
import type { Logger } from 'drizzle-orm/logger'

/**
 * Drizzle query spans (CLAUDE.md §18.9 — "spans from incoming request → Drizzle
 * queries → outbound webhooks/email").
 *
 * The `postgres` (porsager) driver speaks the wire protocol directly over `node:net`,
 * so there is no official OTel auto-instrumentation for it (unlike `pg`). Drizzle's
 * `Logger` interface is called synchronously for every executed query with the
 * parameterized SQL text (placeholders, not literal values) — `params` is
 * deliberately not recorded as a span attribute, since it may carry user data.
 *
 * `logQuery` has no "query finished" counterpart, so spans here are zero-duration
 * markers nested under the active request span — enough to see which queries ran
 * during a request, not to measure individual query latency.
 */

const tracer = trace.getTracer('cairn-api-db')

const MAX_STATEMENT_ATTR_LENGTH = 1000

export class OtelDrizzleLogger implements Logger {
  logQuery(query: string, _params: unknown[]): void {
    const span = tracer.startSpan('db.query')
    span.setAttribute('db.system', 'postgresql')
    span.setAttribute('db.statement', query.slice(0, MAX_STATEMENT_ATTR_LENGTH))
    span.end()
  }
}
