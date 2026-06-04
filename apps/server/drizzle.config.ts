import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle Kit config (CLAUDE.md §3.1b). Used for generating migration diffs during
 * development. The committed migrations in `drizzle/` are the source of truth and
 * are applied by the idempotent runner in `src/db/migrate.ts`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://cairn:cairn@localhost:5432/cairn',
  },
})
