import * as Sentry from '@sentry/electron/main'
import { eq } from 'drizzle-orm'
import log from 'electron-log'
import { getDb } from '../db/index'
import * as schema from '../db/schema'

/**
 * Opt-in crash telemetry (CLAUDE.md §2.4, §2.13, §27 in §14).
 *
 * Telemetry defaults to OFF. Sentry is initialised ONLY when BOTH:
 *   1. the user has explicitly enabled it — settings key `telemetry.optIn`
 *      holds the JSON value `true`; and
 *   2. a DSN is provided via env (`SENTRY_DSN` / `CAIRN_SENTRY_DSN`).
 *
 * When the flag is absent or false, this function is a no-op — Sentry is never
 * imported-and-initialised behind the user's back, and no network endpoint is
 * contacted. There is no code path that initialises without the flag.
 */
const TELEMETRY_OPT_IN_KEY = 'telemetry.optIn'

let initialized = false

/** Reads the persisted opt-in flag. Defaults to FALSE on any error. */
function isTelemetryEnabled(): boolean {
  try {
    const db = getDb()
    const row = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, TELEMETRY_OPT_IN_KEY))
      .get()
    // Settings are persisted JSON-encoded, so the boolean true is the string 'true'.
    return row?.value === 'true'
  } catch {
    return false
  }
}

export function initMainTelemetry(): void {
  if (initialized) return
  const dsn = process.env['SENTRY_DSN'] ?? process.env['CAIRN_SENTRY_DSN']
  if (!dsn) return
  if (!isTelemetryEnabled()) return

  Sentry.init({
    dsn,
    // Crash diagnostics only — never user content or PII (§19.9).
    sendDefaultPii: false,
    tracesSampleRate: 0,
  })
  initialized = true
  log.info('[telemetry] Crash reporting enabled (user opted in).')
}
