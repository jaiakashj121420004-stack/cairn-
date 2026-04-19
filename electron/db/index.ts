import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle> | null = null

export function getDb(): ReturnType<typeof drizzle> {
  if (_db) return _db

  const dataDir = app.getPath('userData')
  const dbPath = join(dataDir, 'cairn.db')

  log.info(`Opening database at: ${dbPath}`)

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  _db = drizzle(sqlite, { schema })
  return _db
}
