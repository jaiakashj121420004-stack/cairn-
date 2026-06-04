import { ERROR_CODES } from '@cairn/shared-types'
import { AppError, HTTP_STATUS_BY_CODE, errorResult } from './errors'
import type { Result } from '@cairn/shared-types'
import type { FastifyReply } from 'fastify'
import type { z } from 'zod'

/**
 * Boundary glue between handlers and Fastify replies (CLAUDE.md §19.2, §19.4).
 *
 * Every response is a `Result<T>`; errors map through `AppError` → code → HTTP
 * status. Raw lower-layer messages are never leaked — unknown throwables become a
 * generic `INTERNAL` 500.
 */

// `reply.send()` returns the (PromiseLike) reply for chaining; we don't await it, so
// it is marked ignored with `void`. The helpers return void so call sites stay clean.

/** Send a successful `Result<T>` with HTTP 200 (or an override). */
export function sendOk<T>(reply: FastifyReply, data: T, status = 200): void {
  const body: Result<T> = { ok: true, data }
  void reply.code(status).send(body)
}

/**
 * Send a failed `Result` for an {@link AppError}. The status defaults to the
 * code→status mapping, but a caller may override it where the same code carries a
 * different HTTP meaning by context (e.g. `INVALID_TOKEN` is 400 for an email-verify
 * token but 401 for a refresh token — a failed refresh means "re-authenticate").
 */
export function sendError(reply: FastifyReply, err: AppError, statusOverride?: number): void {
  void reply.code(statusOverride ?? HTTP_STATUS_BY_CODE[err.code]).send(errorResult(err))
}

/** Normalize any thrown value into an {@link AppError}; unknowns become `INTERNAL`. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  return new AppError(ERROR_CODES.INTERNAL, 'internal server error')
}

/**
 * Validate a request body against a Zod schema. On failure throws
 * `AppError(VALIDATION_FAILED)` carrying flattened, non-sensitive field issues.
 */
export function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      'request validation failed',
      result.error.flatten().fieldErrors,
    )
  }
  return result.data
}

/**
 * Send a successful `Result<T>` whose payload is first validated against the
 * endpoint's Zod *output* schema (CLAUDE.md §19.2; this stage's no-slop footer:
 * "every endpoint has a Zod input AND output schema. Drift between them is a tested
 * error"). If the handler ever produces a shape the schema rejects — a renamed
 * field, a `Date` where an ISO string is expected — this throws `INTERNAL`, turning
 * contract drift into a server error the integration suite catches, never a silently
 * malformed response shipped to a client. The drift detail is logged, never leaked.
 */
export function sendValidated<S extends z.ZodTypeAny>(
  reply: FastifyReply,
  schema: S,
  data: z.infer<S>,
  status = 200,
): void {
  const result = schema.safeParse(data)
  if (!result.success) {
    reply.log.error({ issues: result.error.issues }, 'response schema drift')
    throw new AppError(ERROR_CODES.INTERNAL, 'response schema drift')
  }
  sendOk(reply, result.data, status)
}
