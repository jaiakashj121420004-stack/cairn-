import { pino } from 'pino'
import type { Env } from './env'
import type { LoggerOptions } from 'pino'

/**
 * Structured logging (CLAUDE.md §19.9).
 *
 * Pino with centralized PII redaction: passwords, tokens, secrets, ciphertext, and
 * Authorization headers are never written to logs. Emails are redacted too — only a
 * hashed prefix should ever appear, and that is the caller's responsibility.
 */

/** Paths whose values are replaced with `[redacted]` in every log line. */
const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'secret',
  '*.secret',
  'pepper',
  '*.pepper',
  'ciphertext',
  '*.ciphertext',
  'email',
  '*.email',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
]

export function buildLogger(env: Pick<Env, 'NODE_ENV'>): LoggerOptions {
  const isProd = env.NODE_ENV === 'production'
  return {
    level: env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug',
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    // Pretty output in development only; structured JSON in prod/test.
    ...(isProd || env.NODE_ENV === 'test'
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }),
  }
}

/**
 * The minimal structured-logger surface the app's services depend on. Both pino's
 * `Logger` and Fastify's `FastifyBaseLogger` satisfy it, so services can be handed
 * `app.log` without coupling to either concrete type.
 */
export interface AppLogger {
  info(obj: object, msg?: string): void
  warn(obj: object, msg?: string): void
  error(obj: object, msg?: string): void
  debug(obj: object, msg?: string): void
}

export type { Logger } from 'pino'
export { pino }
