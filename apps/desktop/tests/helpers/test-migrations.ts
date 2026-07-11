import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Journal-driven test migrations (P2.B). Tests that just want a fully-migrated DB read
 * every migration in journal order from `meta/_journal.json` via this helper — NOT a
 * hardcoded `readFileSync(...0001...0018...)` list. Adding a migration updates the
 * journal (drizzle-kit does this), and every test using the helper picks it up for
 * free, retiring the migration-list drift that repeatedly broke the suite.
 *
 * NOTE: tests that assert schema state at a SPECIFIC migration (db.test.ts,
 * migrations.test.ts) intentionally keep their own explicit control and must NOT use
 * this helper.
 */
const MIGRATIONS_DIR = join(__dirname, '../../electron/db/migrations')

interface JournalEntry {
  idx: number
  tag: string
}

/** Every migration's SQL, ordered by the journal's `idx`. */
export function loadAllMigrations(): string[] {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: JournalEntry[] }
  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf-8'))
}

/** Apply all migrations to a sql.js database (drizzle `statement-breakpoint` split). */
export function applyAllMigrations(sqlite: { run(sql: string): void }): void {
  for (const migration of loadAllMigrations()) {
    for (const stmt of migration.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim()
      if (trimmed) sqlite.run(trimmed)
    }
  }
}
