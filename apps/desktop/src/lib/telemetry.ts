import * as Sentry from '@sentry/electron/renderer'
import { SENTRY_USER_ID_SALT } from '@shared/telemetry'
import { ipc } from './ipc'

/**
 * Renderer-side opt-in crash telemetry (CLAUDE.md §2.4, §2.13).
 *
 * Mirrors the main-process gate in electron/services/telemetry.ts: Sentry is
 * initialised ONLY when the user has explicitly enabled telemetry
 * (`telemetry.optIn === true`). When the flag is absent or false this is a
 * no-op. The renderer SDK attaches to the main-process Sentry instance, so if
 * the main process did not initialise (opt-out), nothing is reported.
 */
const TELEMETRY_OPT_IN_KEY = 'telemetry.optIn'

let initialized = false
let initPromise: Promise<void> | null = null

/** Idempotent — safe to call from multiple places (startup, session changes). */
export function initRendererTelemetry(): Promise<void> {
  initPromise ??= (async () => {
    try {
      const res = await ipc.settings.get<boolean>(TELEMETRY_OPT_IN_KEY)
      if (!res.ok || res.data !== true) return
      Sentry.init({})
      initialized = true
    } catch {
      // Telemetry must never break app startup. Stay silent and disabled.
    }
  })()
  return initPromise
}

/**
 * Salted HMAC-SHA256 of `email` via Web Crypto (no Node `crypto` in the renderer),
 * lowercased + trimmed first so the same address always hashes the same way. Must
 * match `hashUserId` in `electron/services/telemetry.ts` — same salt, same input
 * normalization — so main- and renderer-originated events correlate to one user.id.
 */
async function hashUserId(email: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SENTRY_USER_ID_SALT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(email.trim().toLowerCase()))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Attach (or clear) the Sentry `user.id` for the active session, so support can
 * correlate crash reports from the same user without ever seeing their email. Waits
 * for {@link initRendererTelemetry} so a session change racing app startup still
 * lands once telemetry is known to be enabled (or stays a no-op if disabled).
 */
export async function setTelemetryUser(email: string | null): Promise<void> {
  await initRendererTelemetry()
  if (!initialized) return
  Sentry.setUser(email === null ? null : { id: await hashUserId(email) })
}
