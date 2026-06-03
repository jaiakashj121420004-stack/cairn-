import {
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  mkdtempSync,
  rmSync,
  cpSync,
} from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { count } from 'drizzle-orm'
import { app } from 'electron'
import log from 'electron-log'
import { v7 as uuidv7 } from 'uuid'
import { getDb, vacuumInto } from '../db/index'
import * as schema from '../db/schema'
import type { BackupLogEntry, BackupResult, RestoreInfo } from '../../shared/types/index'

function getDataDir(): string {
  return join(app.getPath('userData'), 'cairn')
}

function getLocalBackupsDir(): string {
  return join(getDataDir(), 'backups', 'local')
}

function getPreOpBackupsDir(): string {
  return join(getDataDir(), 'backups', 'pre-op')
}

export function createBackup(kind: 'auto_local' | 'manual', destinationDir: string): BackupResult {
  mkdirSync(destinationDir, { recursive: true })

  const dataDir = getDataDir()
  const screenshotsDir = join(dataDir, 'screenshots')
  const exportsDir = join(dataDir, 'exports')

  const db = getDb()
  const [{ value: tradeCount }] = db.select({ value: count() }).from(schema.trades).all()
  const [{ value: accountCount }] = db.select({ value: count() }).from(schema.accounts).all()

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `cairn-backup-${ts}.zip`
  const destPath = join(destinationDir, filename)

  const zip = new AdmZip()

  // Hot-backup the DB via VACUUM INTO (safe while DB is open)
  const tmpDir = mkdtempSync(join(app.getPath('temp'), 'cairn-bk-'))
  const tmpDbPath = join(tmpDir, 'journal.db')
  try {
    vacuumInto(tmpDbPath)
    zip.addLocalFile(tmpDbPath, '', 'journal.db')
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  if (existsSync(screenshotsDir)) zip.addLocalFolder(screenshotsDir, 'screenshots')
  if (existsSync(exportsDir)) zip.addLocalFolder(exportsDir, 'exports')

  zip.addFile(
    'metadata.json',
    Buffer.from(
      JSON.stringify({
        version: app.getVersion(),
        createdAt: Date.now(),
        tradeCount,
        accountCount,
        platform: process.platform,
      }),
      'utf-8',
    ),
  )

  zip.writeZip(destPath)
  const filesizeBytes = statSync(destPath).size

  appendBackupLog({
    kind,
    destination: destPath,
    filesizeBytes,
    status: 'success',
    errorMessage: null,
  })
  log.info(`[backup] Created backup: ${destPath} (${filesizeBytes} bytes)`)

  return { path: destPath, filesizeBytes, tradeCount, accountCount }
}

export function createPreOpBackup(): string | null {
  try {
    const dir = getPreOpBackupsDir()
    mkdirSync(dir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const destPath = join(dir, `journal_${ts}.db`)
    vacuumInto(destPath)
    log.info(`[backup] Pre-op backup: ${destPath}`)
    return destPath
  } catch (err) {
    log.warn('[backup] Pre-op backup failed (non-fatal):', err)
    return null
  }
}

export function readRestoreInfo(zipPath: string): RestoreInfo {
  const zip = new AdmZip(zipPath)
  const entry = zip.getEntry('metadata.json')
  if (!entry) throw new Error('Not a valid Cairn backup: missing metadata.json')
  const meta = JSON.parse(entry.getData().toString('utf-8')) as {
    version: string
    createdAt: number
    tradeCount: number
    accountCount: number
  }
  if (!meta.version || !meta.createdAt) throw new Error('Backup metadata is corrupt.')
  return {
    version: meta.version,
    createdAt: meta.createdAt,
    tradeCount: meta.tradeCount ?? 0,
    accountCount: meta.accountCount ?? 0,
  }
}

export function restoreFromBackup(zipPath: string): void {
  const dataDir = getDataDir()

  // Validate before touching anything
  readRestoreInfo(zipPath)

  // Auto-backup current state
  try {
    createPreOpBackup()
  } catch {
    /* non-fatal */
  }

  const tmpDir = mkdtempSync(join(app.getPath('temp'), 'cairn-restore-'))
  try {
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(tmpDir, true)

    const newDbPath = join(tmpDir, 'journal.db')
    if (!existsSync(newDbPath)) throw new Error('Backup archive missing journal.db')

    cpSync(newDbPath, join(dataDir, 'journal.db'), { force: true })

    const srcScreenshots = join(tmpDir, 'screenshots')
    if (existsSync(srcScreenshots)) {
      const targetScreenshots = join(dataDir, 'screenshots')
      rmSync(targetScreenshots, { recursive: true, force: true })
      cpSync(srcScreenshots, targetScreenshots, { recursive: true })
    }

    log.info(`[backup] Restored from: ${zipPath}`)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

export function getBackupLog(): BackupLogEntry[] {
  try {
    const db = getDb()
    return db
      .select()
      .from(schema.backupLog)
      .all()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((r) => ({
        id: r.id,
        kind: r.kind as BackupLogEntry['kind'],
        destination: r.destination,
        filesizeBytes: r.filesizeBytes,
        status: r.status as BackupLogEntry['status'],
        errorMessage: r.errorMessage ?? null,
        createdAt: r.createdAt,
      }))
  } catch {
    return []
  }
}

export function cleanupOldLocalBackups(): void {
  const dir = getLocalBackupsDir()
  if (!existsSync(dir)) return
  const cutoff = Date.now() - 30 * 86_400_000
  try {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.zip'))) {
      const p = join(dir, f)
      if (statSync(p).mtimeMs < cutoff) {
        unlinkSync(p)
        log.info(`[backup] Pruned: ${f}`)
      }
    }
  } catch (err) {
    log.warn('[backup] Old backup cleanup failed (non-fatal):', err)
  }
}

export function runScheduledLocalBackup(): void {
  try {
    createBackup('auto_local', getLocalBackupsDir())
    cleanupOldLocalBackups()
  } catch (err) {
    log.error('[backup] Scheduled backup failed:', err)
    appendBackupLog({
      kind: 'auto_local',
      destination: getLocalBackupsDir(),
      filesizeBytes: 0,
      status: 'failed',
      errorMessage: String(err),
    })
  }
}

function appendBackupLog(entry: {
  kind: 'auto_local' | 'manual'
  destination: string
  filesizeBytes: number
  status: 'success' | 'failed'
  errorMessage: string | null
}): void {
  try {
    getDb()
      .insert(schema.backupLog)
      .values({
        id: uuidv7(),
        kind: entry.kind,
        destination: entry.destination,
        filesizeBytes: entry.filesizeBytes,
        status: entry.status,
        errorMessage: entry.errorMessage,
        createdAt: Date.now(),
      })
      .run()
  } catch (err) {
    log.warn('[backup] Failed to write backup log:', err)
  }
}
