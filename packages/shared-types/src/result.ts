/**
 * The universal cross-boundary result contract (CLAUDE.md §3.7).
 *
 * Every call that crosses a trust boundary — IPC on desktop, HTTP on web/server —
 * returns a `Result<T>` rather than throwing across the boundary (CLAUDE.md §19.4).
 * The UI maps `error.code` to copy and never renders a raw lower-layer error string.
 */
export type Result<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false
      readonly error: {
        readonly code: string
        readonly message: string
        readonly details?: unknown
      }
    }

/** Construct a successful {@link Result}. */
export function ok<T>(data: T): { readonly ok: true; readonly data: T } {
  return { ok: true, data }
}

/**
 * Construct a failed {@link Result}.
 *
 * `details` is omitted entirely when not supplied so the value satisfies
 * `exactOptionalPropertyTypes` (no explicit `undefined` on an optional key).
 */
export function err(
  code: string,
  message: string,
  details?: unknown,
): {
  readonly ok: false
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown }
} {
  return {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  }
}
