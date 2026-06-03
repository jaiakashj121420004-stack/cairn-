import * as Sentry from '@sentry/electron/renderer'
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

export async function initRendererTelemetry(): Promise<void> {
  if (initialized) return
  try {
    const res = await ipc.settings.get<boolean>(TELEMETRY_OPT_IN_KEY)
    if (!res.ok || res.data !== true) return
    Sentry.init({})
    initialized = true
  } catch {
    // Telemetry must never break app startup. Stay silent and disabled.
  }
}
