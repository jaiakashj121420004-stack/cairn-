import * as Sentry from '@sentry/node'
import { redactDeep } from '../lib/redact'
import type { Env } from '../env'
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/node'

/**
 * Server-side error reporting (CLAUDE.md §2.13, §18.9).
 *
 * Unlike the desktop client (opt-in, see `apps/desktop/electron/services/telemetry.ts`),
 * the server holds no user vault content — only operational errors — so reporting is
 * always-on once `SENTRY_DSN` is configured. `SENTRY_DSN` unset = fully disabled, no
 * network calls.
 *
 * `sendDefaultPii: false` plus `beforeSend`/`beforeBreadcrumb` deep-redaction
 * (`redactDeep`) ensure request bodies, cookies, auth headers, tokens, and emails never
 * reach Sentry. `skipOpenTelemetrySetup: true` because tracing is handled by our own
 * OTel SDK (`telemetry/otel.ts`) — Sentry here is error reporting only
 * (`tracesSampleRate: 0`).
 */

let initialized = false

export function initSentry(env: Env): void {
  if (initialized) return
  if (!env.SENTRY_DSN) return

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    skipOpenTelemetrySetup: true,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
  initialized = true
}

/** True once `initSentry` has run with a configured DSN. Tests use this to assert no-op. */
export function isSentryEnabled(): boolean {
  return initialized
}

/** Test-only: drop the initialized flag so a test can re-init with different env. */
export function resetSentryForTests(): void {
  initialized = false
}

/** Deep-redact request, user, context, and extra data before it leaves the process. */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.request) {
    // Cookie values are bearer-equivalent secrets regardless of cookie name —
    // redact the whole map, not just keys matching `redactDeep`'s key list.
    if (event.request.cookies) {
      event.request.cookies = Object.fromEntries(
        Object.keys(event.request.cookies).map((name) => [name, '[redacted]']),
      )
    }
    event.request = redactDeep(event.request)
  }
  if (event.user) event.user = redactDeep(event.user)
  if (event.contexts) event.contexts = redactDeep(event.contexts)
  if (event.extra) event.extra = redactDeep(event.extra)
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumbData)
  return event
}

/** Deep-redact breadcrumb `data` payloads (e.g. HTTP request/response bodies). */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return scrubBreadcrumbData(breadcrumb)
}

function scrubBreadcrumbData(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.data) return breadcrumb
  return { ...breadcrumb, data: redactDeep(breadcrumb.data) }
}

/** Report an unexpected error. No-op (and no network call) when Sentry is disabled. */
export function captureException(err: unknown): void {
  if (!initialized) return
  Sentry.captureException(err)
}

/** Flush buffered events before process exit. No-op when disabled. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return
  await Sentry.flush(timeoutMs)
}
