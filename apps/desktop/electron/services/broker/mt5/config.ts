/**
 * MT5 bridge configuration (Wave 4 — `docs/broker-integration.md` §2.1 / §8).
 *
 * Owns the per-install pairing token, the loopback port, and best-effort
 * discovery of the terminal's `MQL5/Experts` folder — the three things Settings →
 * Integrations → MT5 shows the user (token to paste into the EA, where to drop
 * the `.mq5`, and the connection indicator).
 *
 * Main-process only: reads/writes the SQLite `settings` table and scans the
 * filesystem. The token is generated once on first read and persisted
 * JSON-encoded, matching how the renderer's `ipc.settings` round-trips values.
 */

import { randomBytes } from 'crypto'
import { existsSync, readdirSync } from 'fs'
import { homedir, platform } from 'os'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../db/index'
import * as schema from '../../../db/schema'
import type { Mt5BridgeConfig } from '@cairn/shared-types'

/** Default loopback port for the bridge. Configurable via the settings key below. */
export const DEFAULT_MT5_PORT = 53127

const TOKEN_SETTING_KEY = 'broker.mt5.pairing_token'
const PORT_SETTING_KEY = 'broker.mt5.port'

function readSetting(key: string): string | null {
  const row = getDb()
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get()
  return row?.value ?? null
}

function writeSetting(key: string, jsonValue: string): void {
  const now = Date.now()
  getDb()
    .insert(schema.settings)
    .values({ key, value: jsonValue, updatedAt: now })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: jsonValue, updatedAt: now } })
    .run()
}

/**
 * The per-install pairing token, generated and persisted on first read. 24 random
 * bytes → 48 hex chars; ample entropy for a loopback-only secret.
 */
export function getOrCreatePairingToken(): string {
  const stored = readSetting(TOKEN_SETTING_KEY)
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored)
      if (typeof parsed === 'string' && parsed.length > 0) return parsed
    } catch {
      // fall through and regenerate
    }
  }
  const token = randomBytes(24).toString('hex')
  writeSetting(TOKEN_SETTING_KEY, JSON.stringify(token))
  return token
}

/** The configured loopback port, falling back to {@link DEFAULT_MT5_PORT}. */
export function getMt5Port(): number {
  const stored = readSetting(PORT_SETTING_KEY)
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored)
      if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
        return parsed
      }
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_MT5_PORT
}

/**
 * Existing `MQL5/Experts` folders for installed MT5 terminals (best effort).
 *
 * MetaTrader 5 stores each terminal's data under a per-install hashed folder, so
 * the exact path can't be hardcoded — we enumerate the terminals that exist. May
 * be empty (no MT5 installed, or a portable install elsewhere); the UI then falls
 * back to {@link getMt5ExpertsHint}.
 */
export function findMt5ExpertsPaths(): string[] {
  const roots: string[] = []
  if (platform() === 'win32') {
    const appData = process.env['APPDATA']
    if (appData) roots.push(join(appData, 'MetaQuotes', 'Terminal'))
  } else if (platform() === 'darwin') {
    // MT5 on macOS runs under a Wine prefix inside the app bundle's container.
    roots.push(
      join(
        homedir(),
        'Library',
        'Application Support',
        'net.metaquotes.wine.metatrader5',
        'drive_c',
      ),
    )
  } else {
    roots.push(join(homedir(), '.wine', 'drive_c'))
  }

  const found: string[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const candidate = join(root, entry.name, 'MQL5', 'Experts')
        if (existsSync(candidate)) found.push(candidate)
      }
    } catch {
      // unreadable root — skip
    }
  }
  return found
}

/** Human-readable hint for where the `MQL5/Experts` folder lives on this OS. */
export function getMt5ExpertsHint(): string {
  switch (platform()) {
    case 'win32':
      return '%APPDATA%\\MetaQuotes\\Terminal\\<id>\\MQL5\\Experts (open it from MT5: File → Open Data Folder)'
    case 'darwin':
      return 'In MetaTrader 5: File → Open Data Folder → MQL5 → Experts'
    default:
      return 'In MetaTrader 5: File → Open Data Folder → MQL5 → Experts'
  }
}

/** The full bridge config Settings → Integrations → MT5 renders. */
export function getMt5BridgeConfig(): Mt5BridgeConfig {
  return {
    token: getOrCreatePairingToken(),
    port: getMt5Port(),
    expertsPaths: findMt5ExpertsPaths(),
    expertsHint: getMt5ExpertsHint(),
  }
}
