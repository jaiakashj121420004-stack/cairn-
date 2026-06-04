import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'

/**
 * Postgres connection + Drizzle handle (CLAUDE.md §3.1b).
 *
 * One pool per process. The raw `postgres` client is returned alongside the Drizzle
 * handle so callers can `close()` it cleanly on shutdown and in tests.
 */
export type Db = PostgresJsDatabase<typeof schema>

/**
 * The query-builder surface shared by the top-level connection and a transaction
 * handle. Helpers that may run either standalone or inside `db.transaction(...)`
 * accept this so a `tx` is assignable wherever a `Db` would be.
 */
export type DbExecutor = PgDatabase<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>

export interface DbHandle {
  readonly db: Db
  readonly sql: postgres.Sql
  close(): Promise<void>
}

export function createDb(
  connectionString: string,
  options?: postgres.Options<NonNullable<unknown>>,
): DbHandle {
  const client = postgres(connectionString, { max: 10, ...options })
  const db = drizzle(client, { schema })
  return {
    db,
    sql: client,
    close: () => client.end({ timeout: 5 }),
  }
}

export { schema }
