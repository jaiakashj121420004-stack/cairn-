import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, copyFileSync } from 'fs'
import log from 'electron-log'
import * as schema from './schema'
import { runSeed } from './seed'

export type CairnDb = BetterSQLite3Database<typeof schema>

let _db: CairnDb | null = null
let _sqlite: Database.Database | null = null

export function getDb(): CairnDb {
  if (_db) return _db

  const dataDir = app.getPath('userData')
  const dbDir = join(dataDir, 'cairn')
  const dbPath = join(dbDir, 'journal.db')

  mkdirSync(dbDir, { recursive: true })

  const isNewDb = !existsSync(dbPath)

  log.info(`[db] Opening database at: ${dbPath}`)

  const sqlite = new Database(dbPath)
  _sqlite = sqlite
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  if (!isNewDb) {
    const result = sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>
    const ok = result.every((r) => r.integrity_check === 'ok')
    if (!ok) {
      log.error('[db] Integrity check failed:', result)
      sqlite.close()
      throw new Error('Database integrity check failed. Restore from backup via Settings.')
    }
    log.info('[db] Integrity check: OK')

    createPreMigrationBackup(dbPath, dbDir)
  }

  const db = drizzle(sqlite, { schema })
  // _db is set AFTER migrate() so a failed migration never caches an un-migrated DB.

  const migrationsFolder = app.isPackaged
  ? join(process.resourcesPath, 'app.asar', 'electron', 'db', 'migrations')
  : join(__dirname, '..', '..', 'electron', 'db', 'migrations')

  migrate(db, { migrationsFolder })
  log.info('[db] Migrations applied')

  _db = db

  if (isNewDb) {
    runSeed(db)
    log.info('[db] Seed complete')
  }

  return db
}

export function getDbStatus(): { integrityOk: boolean; migrationCount: number; tradeCount: number } {
  const db = getDb()
  if (!_sqlite) throw new Error('Database not open')
  const sqlite = _sqlite

  const integrityResult = sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>
  const integrityOk = integrityResult.every((r) => r.integrity_check === 'ok')

  const migrationRow = sqlite
    .prepare('SELECT COUNT(*) as count FROM __drizzle_migrations')
    .get() as { count: number }
  const migrationCount = migrationRow?.count ?? 0

  const tradeRow = sqlite
    .prepare('SELECT COUNT(*) as count FROM trades WHERE deleted_at IS NULL')
    .get() as { count: number }
  const tradeCount = tradeRow?.count ?? 0

  void db

  return { integrityOk, migrationCount, tradeCount }
}

export function vacuumInto(destPath: string): void {
  if (!_sqlite) throw new Error('Database not open')
  _sqlite.prepare(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`).run()
}

export function getRawSqlite(): Database.Database {
  if (!_sqlite) throw new Error('Database not open')
  return _sqlite
}

export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
    _db = null
    log.info('[db] Database closed')
  }
}

function createPreMigrationBackup(dbPath: string, dbDir: string): void {
  try {
    const backupDir = join(dbDir, 'backups', 'pre-migration')
    mkdirSync(backupDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(backupDir, `journal_${ts}.db`)
    copyFileSync(dbPath, backupPath)
    log.info(`[db] Pre-migration backup: ${backupPath}`)
  } catch (err) {
    log.warn('[db] Pre-migration backup failed (non-fatal):', err)
  }
}
