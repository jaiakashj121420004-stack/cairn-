/**
 * Allow-list of setting keys the renderer may write through the `settings:set` IPC
 * (P1 security hardening). A compromised or buggy renderer must not be able to inject
 * arbitrary keys into the `settings` table — only these known keys are accepted.
 *
 * Main-process code (backup scheduler, MT5 bridge config, sync cursor, auth resume,
 * telemetry) writes its own keys DIRECTLY to the DB and does not pass through the
 * `settings:set` handler, so those keys are intentionally absent here. If you add a
 * new renderer-written setting, add its key to this set or the write is rejected.
 */
import { BROKER_AUTO_LOG_MODE_SETTING_KEY } from '@cairn/shared-types'

/** Every setting key the renderer is permitted to write via `settings:set`. */
export const SETTING_KEYS: ReadonlySet<string> = new Set<string>([
  'onboarding_completed',
  'onboarding_step',
  'backup_folder_path',
  'r_alerts',
  'theme',
  'week_starts_on',
  'timezone',
  'pre_trade.fast_path_enabled',
  'pretrade_nudges',
  'default_risk_pct',
  'telemetry.optIn',
  BROKER_AUTO_LOG_MODE_SETTING_KEY,
])

/** True when the renderer is allowed to write `key` through `settings:set`. */
export function isAllowedSettingKey(key: string): boolean {
  return SETTING_KEYS.has(key)
}
