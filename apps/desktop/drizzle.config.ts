import type { Config } from 'drizzle-kit'

const config: Config = {
  schema: './electron/db/schema.ts',
  out: './electron/db/migrations',
  dialect: 'sqlite',
}

export default config
