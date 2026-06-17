import { startOtel } from './otel'
import { initSentry } from './sentry'
import type { Env } from '../env'

export { captureException, flushSentry, isSentryEnabled } from './sentry'
export { isOtelEnabled, shutdownOtel } from './otel'

/**
 * Initialize observability (CLAUDE.md §18.9). Call once, as early as possible in
 * `server.ts`. Both halves are independently no-op unless their env var is set:
 *   - Sentry: `SENTRY_DSN` (always-on error reporting, no opt-in — server-only).
 *   - OpenTelemetry: `OTEL_EXPORTER_OTLP_ENDPOINT` (traces + metrics).
 */
export function initTelemetry(env: Env): void {
  initSentry(env)
  startOtel(env)
}
