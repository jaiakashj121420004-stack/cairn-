import { buildApp } from './app'
import { createDb } from './db/client'
import { runMigrations } from './db/migrate'
import { loadEnv } from './env'
import { captureException, flushSentry, initTelemetry, shutdownOtel } from './telemetry/index'

/**
 * Process entrypoint (CLAUDE.md §18.5). Reads + validates env once, applies pending
 * migrations, builds the app, and starts listening. Wires graceful shutdown so the
 * DB pool drains on SIGINT/SIGTERM, and observability exporters flush before exit.
 */
async function main(): Promise<void> {
  const env = loadEnv()
  initTelemetry(env)

  // Catch crashes that happen outside any request (DB pool errors, timers, etc.) — log,
  // report to Sentry, flush, and exit. A process that keeps running after an uncaught
  // exception is in an unknown state.
  process.on('uncaughtException', (err: unknown) => {
    // eslint-disable-next-line no-console -- may fire before/after the app logger is available.
    console.error(err)
    captureException(err)
    void flushSentry().finally(() => process.exit(1))
  })
  process.on('unhandledRejection', (err: unknown) => {
    // eslint-disable-next-line no-console -- may fire before/after the app logger is available.
    console.error(err)
    captureException(err)
    void flushSentry().finally(() => process.exit(1))
  })

  const { db, sql, close } = createDb(env.DATABASE_URL)

  await runMigrations(sql)

  const app = await buildApp({ env, db })

  const shutdown = (signal: string): void => {
    app.log.info({ signal }, 'shutting down')
    app
      .close()
      .then(() => close())
      .then(() => Promise.all([flushSentry(), shutdownOtel()]))
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        app.log.error({ err }, 'error during shutdown')
        process.exit(1)
      })
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  await app.listen({ host: env.HOST, port: env.PORT })
}

main().catch((err: unknown) => {
  // No logger yet if env/DB failed — write the fatal reason to stderr and exit.
  // eslint-disable-next-line no-console -- fatal boot failure before the logger exists.
  console.error(err)
  captureException(err)
  void flushSentry().finally(() => process.exit(1))
})
