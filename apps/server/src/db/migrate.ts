import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { loadEnv } from '../env'

/**
 * Minimal forward migration runner (CLAUDE.md §19.6).
 *
 * Applies every `NNNN_name.sql` file in `drizzle/` in numeric order, each inside a
 * transaction, recording applied ids in `schema_migration`. The SQL files are
 * authored idempotently (IF NOT EXISTS), so the migrator is safe to re-run; the
 * `schema_migration` ledger additionally skips already-applied files outright.
 *
 * This intentionally avoids drizzle-kit's generated journal so tests can bootstrap a
 * fresh database with a single call and no extra tooling.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle')

interface MigrationFile {
  readonly id: number
  readonly name: string
  readonly path: string
}

async function listMigrations(): Promise<MigrationFile[]> {
  const entries = await readdir(MIGRATIONS_DIR)
  const files: MigrationFile[] = []
  for (const name of entries) {
    if (!name.endsWith('.sql')) continue
    const match = /^(\d+)_/.exec(name)
    if (!match || match[1] === undefined) {
      throw new Error(`Migration file is not numerically prefixed: ${name}`)
    }
    files.push({ id: Number.parseInt(match[1], 10), name, path: join(MIGRATIONS_DIR, name) })
  }
  return files.sort((a, b) => a.id - b.id)
}

/**
 * Apply all pending migrations against the given connection. Returns the ids applied
 * during this run (empty if the database was already up to date).
 */
export async function runMigrations(sql: postgres.Sql): Promise<number[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS "schema_migration" (
      "id" integer PRIMARY KEY,
      "name" text NOT NULL,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )
  `

  const appliedRows = await sql<{ id: number }[]>`SELECT "id" FROM "schema_migration"`
  const applied = new Set(appliedRows.map((r) => r.id))

  const migrations = await listMigrations()
  const ran: number[] = []
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    const ddl = await readFile(migration.path, 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl)
      await tx`INSERT INTO "schema_migration" ("id", "name") VALUES (${migration.id}, ${migration.name})`
    })
    ran.push(migration.id)
  }
  return ran
}

/** CLI entrypoint: `pnpm --filter @cairn/server run migrate`. */
async function main(): Promise<void> {
  const env = loadEnv()
  const sql = postgres(env.DATABASE_URL, { max: 1 })
  try {
    const ran = await runMigrations(sql)
    // eslint-disable-next-line no-console -- migrate is a CLI tool, not server code; user needs the result.
    console.log(
      ran.length === 0 ? 'Database already up to date.' : `Applied migrations: ${ran.join(', ')}`,
    )
  } finally {
    await sql.end({ timeout: 5 })
  }
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console -- CLI tool surfacing a fatal error to the operator.
    console.error(err)
    process.exit(1)
  })
}
