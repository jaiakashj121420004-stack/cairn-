import { ERROR_CODES } from '@cairn/shared-types'
import type { ErrorCode, Result } from '@cairn/shared-types'

/**
 * Typed boundary errors (CLAUDE.md §19.4).
 *
 * Internal helpers throw `AppError`; the HTTP boundary catches it and maps `.code`
 * to a `Result` + HTTP status. Nothing throws across the boundary, and raw error
 * strings from lower layers are never sent to clients — only the stable code.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  /** Optional structured, non-sensitive detail safe to return to the client. */
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    if (details !== undefined) this.details = details
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

/** Map each error code to its HTTP status. The code is the source of truth. */
export const HTTP_STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  [ERROR_CODES.VALIDATION_FAILED]: 400,
  [ERROR_CODES.INVALID_TOKEN]: 400,
  [ERROR_CODES.UNAUTHENTICATED]: 401,
  [ERROR_CODES.INVALID_CREDENTIALS]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.EMAIL_NOT_VERIFIED]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.PAYMENT_REQUIRED]: 402,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.PAYLOAD_TOO_LARGE]: 413,
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.NOT_IMPLEMENTED]: 501,
  [ERROR_CODES.INTERNAL]: 500,
}

/** Build a failed {@link Result} payload from an {@link AppError}. */
export function errorResult(err: AppError): Extract<Result<never>, { ok: false }> {
  return {
    ok: false,
    error:
      err.details === undefined
        ? { code: err.code, message: err.message }
        : { code: err.code, message: err.message, details: err.details },
  }
}
