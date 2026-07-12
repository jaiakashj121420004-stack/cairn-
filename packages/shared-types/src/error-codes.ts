/**
 * Canonical cross-boundary error codes (CLAUDE.md §3.7, §19.4).
 *
 * Every {@link Result} failure carries one of these `code` values. The UI maps a
 * code to user-facing copy; it never renders a raw lower-layer error string. Codes
 * are stable identifiers — rename with care, they are part of the API contract.
 *
 * Server routes additionally map each code to an HTTP status (see
 * `apps/server/src/lib/errors.ts`); the code, not the status, is the source of truth.
 */
export const ERROR_CODES = {
  /** Request body / params failed Zod validation at the boundary. */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** A required resource was not found. */
  NOT_FOUND: 'NOT_FOUND',
  /** The caller is not authenticated (missing/invalid/expired access token). */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** The caller is authenticated but not permitted to perform the action. */
  FORBIDDEN: 'FORBIDDEN',
  /** Login failed — wrong email or password. Deliberately indistinguishable. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** The chosen password appears in a known breach corpus (HIBP) — pick another (ASVS 2.1.7). */
  PASSWORD_BREACHED: 'PASSWORD_BREACHED',
  /** A verify/magic/refresh token was missing, malformed, consumed, or expired. */
  INVALID_TOKEN: 'INVALID_TOKEN',
  /** The endpoint requires a verified email address and the caller has none. */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  /** Rate limit exceeded for this IP and/or identifier. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Endpoint is registered but not yet implemented (e.g. OAuth stubs). */
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  /** A paid entitlement is required and the caller does not have it. */
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  /** A paid (cloud-sync) feature was used without entitlement; the client shows the upgrade flow. */
  UPGRADE_REQUIRED: 'UPGRADE_REQUIRED',
  /** A subscription state-machine transition that the §20.5 graph does not allow. */
  ILLEGAL_STATE: 'ILLEGAL_STATE',
  /** Request body exceeds the allowed size limit. */
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  /** A resource conflict — e.g. duplicate idempotency key. */
  CONFLICT: 'CONFLICT',
  /** An unexpected server-side failure. The detail is never leaked to the client. */
  INTERNAL: 'INTERNAL',
} as const

/** The union of every valid error code. */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
