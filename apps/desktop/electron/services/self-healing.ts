/**
 * Self-healing behaviors — run on app launch.
 * Each item maps to §13.11 of the conventions spec.
 * Items 1 (integrity check) and 2 (pre-migration backup) are handled in db/index.ts.
 * Items 11 (transactions) and 12 (idempotent IPC) are structural, handled in trades IPC.
 */

import { existsSync, readdirSync, mkdirSync, renameSync, statSync } from 'fs'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { isNull, lt, and, eq } from 'drizzle-orm'
import { app } from 'electron'
import log from 'electron-log'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type { BrowserWindow } from 'electron'

const SETTINGS_KEY_TIMEZONE = 'last_known_timezone'
const SETTINGS_KEY_VERSION = 'last_known_version'

// ── Item 3: Crash log capture ─────────────────────────────────────────────────
export function installCrashHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    log.error('[crash] Uncaught exception:', error)
    writeCrashSnapshot(error.stack ?? error.message)
  })
  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
    log.error('[crash] Unhandled rejection:', reason)
    writeCrashSnapshot(msg)
  })
}

function writeCrashSnapshot(errorText: string): void {
  try {
    const crashDir = join(app.getPath('userData'), 'cairn', 'crashes')
    mkdirSync(crashDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    writeFileSync(
      join(crashDir, `crash_${ts}.log`),
      `${new Date().toISOString()}\n\n${errorText}`,
      'utf-8',
    )
  } catch {
    /* cannot crash in crash handler */
  }
}

// ── Item 5: Settings schema validation ────────────────────────────────────────
const KNOWN_BOOLEAN_SETTINGS = ['onboarding_completed', 'backup_on_close']
const KNOWN_STRING_SETTINGS = ['theme', 'backup_folder', 'backup_schedule', 'backup_daily_time']

export function validateSettings(): void {
  try {
    const db = getDb()
    const rows = db.select().from(schema.settings).all()
    for (const row of rows) {
      if (KNOWN_BOOLEAN_SETTINGS.includes(row.key)) {
        const parsed = JSON.parse(row.value)
        if (typeof parsed !== 'boolean') throw new Error(`Invalid boolean: ${row.key}`)
      } else if (KNOWN_STRING_SETTINGS.includes(row.key)) {
        const parsed = JSON.parse(row.value)
        if (typeof parsed !== 'string' && parsed !== null)
          throw new Error(`Invalid string: ${row.key}`)
      }
    }
    log.info('[self-healing] Settings validation: OK')
  } catch (err) {
    log.warn('[self-healing] Invalid settings detected, resetting affected keys:', err)
    try {
      const db = getDb()
      const affected = [...KNOWN_BOOLEAN_SETTINGS, ...KNOWN_STRING_SETTINGS]
      for (const key of affected) {
        db.delete(schema.settings).where(eq(schema.settings.key, key)).run()
      }
    } catch (e2) {
      log.error('[self-healing] Settings reset failed:', e2)
    }
  }
}

// ── Item 6: Orphaned screenshot cleanup ───────────────────────────────────────
export function cleanupOrphanedScreenshots(): void {
  try {
    const screenshotsDir = join(app.getPath('userData'), 'cairn', 'screenshots')
    if (!existsSync(screenshotsDir)) return

    const db = getDb()
    const dbFilenames = new Set(
      db
        .select({ filename: schema.tradeScreenshots.filename })
        .from(schema.tradeScreenshots)
        .all()
        .map((r) => r.filename),
    )

    const orphanDir = join(screenshotsDir, '_orphaned')
    let movedCount = 0

    const scanDir = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '_orphaned') continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(fullPath)
        } else if (!dbFilenames.has(entry.name)) {
          mkdirSync(orphanDir, { recursive: true })
          try {
            renameSync(fullPath, join(orphanDir, `${Date.now()}_${entry.name}`))
            movedCount++
          } catch {
            /* non-fatal */
          }
        }
      }
    }

    scanDir(screenshotsDir)
    if (movedCount > 0) log.info(`[self-healing] Moved ${movedCount} orphaned screenshot(s)`)
  } catch (err) {
    log.warn('[self-healing] Orphaned screenshot cleanup failed (non-fatal):', err)
  }
}

// ── Item 8: Stale cooldown recovery ───────────────────────────────────────────
export function clearStaleCooldowns(): void {
  try {
    const db = getDb()
    const now = Date.now()
    const stale = db
      .select({ id: schema.cooldowns.id })
      .from(schema.cooldowns)
      .where(and(lt(schema.cooldowns.expiresAt, now), isNull(schema.cooldowns.clearedAt)))
      .all()

    if (stale.length === 0) return

    for (const { id } of stale) {
      db.update(schema.cooldowns)
        .set({ clearedAt: now, clearedBy: 'auto_heal' })
        .where(eq(schema.cooldowns.id, id))
        .run()
    }
    log.info(`[self-healing] Auto-cleared ${stale.length} stale cooldown(s)`)
  } catch (err) {
    log.warn('[self-healing] Stale cooldown recovery failed (non-fatal):', err)
  }
}

// ── Item 9: Timezone change detection ─────────────────────────────────────────
export function checkTimezoneChange(mainWindow: BrowserWindow | null): void {
  try {
    const db = getDb()
    const current = Intl.DateTimeFormat().resolvedOptions().timeZone

    const stored = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, SETTINGS_KEY_TIMEZONE))
      .get()

    if (stored) {
      const prev = JSON.parse(stored.value) as string
      if (prev !== current) {
        log.warn(`[self-healing] Timezone changed: ${prev} → ${current}`)
        mainWindow?.webContents.send('app:timezoneChanged', { from: prev, to: current })
      }
    }

    db.insert(schema.settings)
      .values({ key: SETTINGS_KEY_TIMEZONE, value: JSON.stringify(current), updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: JSON.stringify(current), updatedAt: Date.now() },
      })
      .run()
  } catch (err) {
    log.warn('[self-healing] Timezone check failed (non-fatal):', err)
  }
}

// ── Item 10: Version mismatch guard ───────────────────────────────────────────
export function checkVersionMismatch(): void {
  try {
    const db = getDb()
    const current = app.getVersion()

    const stored = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, SETTINGS_KEY_VERSION))
      .get()

    if (stored) {
      const prev = JSON.parse(stored.value) as string
      if (isDowngrade(prev, current)) {
        log.error(`[self-healing] Version downgrade detected: ${prev} → ${current}`)
        throw new Error(
          `Cannot open a database created with Cairn v${prev} using v${current}. ` +
            `Please reinstall the correct version or restore from backup.`,
        )
      }
    }

    db.insert(schema.settings)
      .values({ key: SETTINGS_KEY_VERSION, value: JSON.stringify(current), updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: JSON.stringify(current), updatedAt: Date.now() },
      })
      .run()
  } catch (err) {
    // Re-throw version errors; swallow others
    if (String(err).includes('Cannot open a database')) throw err
    log.warn('[self-healing] Version check failed (non-fatal):', err)
  }
}

function isDowngrade(prev: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [pMaj = 0, pMin = 0, pPat = 0] = parse(prev)
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current)
  if (pMaj !== cMaj) return cMaj < pMaj
  if (pMin !== cMin) return cMin < pMin
  return cPat < pPat
}

// ── Run all self-healing behaviors on launch ──────────────────────────────────
export function runSelfHealing(mainWindow: BrowserWindow | null): void {
  // Items 1 & 2 already handled in db/index.ts (integrity check + pre-migration backup)
  installCrashHandlers() // Item 3
  checkVersionMismatch() // Item 10 (run early to catch downgrade before any data access)
  validateSettings() // Item 5
  clearStaleCooldowns() // Item 8
  checkTimezoneChange(mainWindow) // Item 9
  // Item 6 is I/O heavy — run async after window is ready
  setImmediate(() => cleanupOrphanedScreenshots())
  // Items 7 (dup prevention), 11 (transactions), 12 (idempotent IPC) are structural
}

void statSync
void existsSync
