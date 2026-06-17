import { ERROR_CODES, err, ok, type Result } from '@cairn/shared-types'

/**
 * The web client's authenticated HTTP core (CLAUDE.md §2.13, §3.7, §18.7, task §2/§6).
 *
 * Owns three security-critical concerns:
 *
 *  1. The access token lives in memory ONLY (`accessToken` below) — never in a cookie,
 *     `localStorage`, or `sessionStorage`. It dies with the tab, which is the point.
 *     The long-lived refresh token is an `HttpOnly` `__Host-refresh` cookie the JS
 *     never sees; `credentials: 'include'` lets the browser attach it on `/auth/refresh`.
 *
 *  2. A SINGLE in-flight refresh. A burst of calls that all 401 must trigger exactly one
 *     `/auth/refresh`; the rest await the same promise (`refreshInFlight`). Without this
 *     coalescing, N concurrent 401s would fire N refreshes and — because refresh tokens
 *     rotate with reuse-detection (CLAUDE.md §2.13) — the 2nd…Nth would look like token
 *     reuse and nuke the whole session.
 *
 *  3. CSRF double-submit on `/auth/refresh`. The standard CSRF surface is already closed
 *     (access token isn't a cookie; CORS is a strict allowlist), but per task §6 we add
 *     a readable `csrf` token echoed in the `x-csrf-token` header as belt-and-braces.
 *
 * The module is transport-agnostic and `fetch`-injectable so the refresh-coalescing and
 * Result-mapping logic is unit-tested without a network (see http-core.test.ts).
 */

export type FetchImpl = typeof fetch

export interface HttpCoreOptions {
  /** API origin, no trailing slash, e.g. `https://api.cairn.app`. */
  readonly baseUrl: string
  /** Injected fetch (defaults to global). */
  readonly fetchImpl?: FetchImpl
  /** Reads the readable CSRF token (defaults to the `csrf` cookie). Injectable for tests. */
  readonly readCsrfToken?: () => string | null
  /** Called whenever a refresh fails terminally, so the app can route to /login. */
  readonly onAuthLost?: () => void
  /**
   * Called whenever a response maps to a paywall code (`UPGRADE_REQUIRED` /
   * `PAYMENT_REQUIRED`), e.g. a `/vault/push` 402 (task §5). The app subscribes to open
   * the upgrade modal. `details` is the server's error `details` payload (which carries
   * the `upgrade_url`, docs/billing.md §5), forwarded verbatim.
   */
  readonly onUpgradeRequired?: (details: unknown) => void
}

/** Shape of the server's JSON envelope. The server always returns `Result<T>`-shaped JSON. */
interface ServerEnvelope {
  readonly ok: boolean
  readonly data?: unknown
  readonly error?: { readonly code?: unknown; readonly message?: unknown; readonly details?: unknown }
}

export class HttpCore {
  private readonly baseUrl: string
  private readonly fetchImpl: FetchImpl
  private readonly readCsrfToken: () => string | null
  private readonly onAuthLost: (() => void) | undefined
  private readonly onUpgradeRequired: ((details: unknown) => void) | undefined

  /** In-memory only. Never persisted. */
  private accessToken: string | null = null

  /** The single in-flight refresh, or null when none is running. Resolves to success. */
  private refreshInFlight: Promise<boolean> | null = null

  constructor(opts: HttpCoreOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.readCsrfToken = opts.readCsrfToken ?? defaultReadCsrf
    this.onAuthLost = opts.onAuthLost
    this.onUpgradeRequired = opts.onUpgradeRequired
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token
  }

  hasAccessToken(): boolean {
    return this.accessToken !== null
  }

  /**
   * POST/GET a JSON endpoint and return a mapped {@link Result}. On a 401 it runs (or
   * joins) the single refresh, then retries the request exactly once. The retry flag
   * prevents an infinite 401→refresh→401 loop.
   */
  async call<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    opts?: { readonly retryOnUnauthorized?: boolean },
  ): Promise<Result<T>> {
    const retryOnUnauthorized = opts?.retryOnUnauthorized ?? true
    const res = await this.rawFetch(method, path, body)

    if (res.status === 401 && retryOnUnauthorized && path !== '/auth/refresh') {
      const refreshed = await this.refresh()
      if (!refreshed) {
        this.onAuthLost?.()
        return err(ERROR_CODES.UNAUTHENTICATED, 'session expired')
      }
      return this.call<T>(method, path, body, { retryOnUnauthorized: false })
    }

    return this.mapResponse<T>(res)
  }

  /**
   * Run the single in-flight refresh. Concurrent callers share one promise; the result is
   * `true` if a new access token was installed, `false` on terminal failure (caller then
   * routes to login). Resets `refreshInFlight` in a `finally` so the *next* 401 after this
   * settles starts a fresh refresh rather than reusing a stale resolved promise.
   */
  refresh(): Promise<boolean> {
    if (this.refreshInFlight !== null) return this.refreshInFlight
    const run = (async (): Promise<boolean> => {
      const headers: Record<string, string> = { accept: 'application/json' }
      const csrf = this.readCsrfToken()
      if (csrf !== null) headers['x-csrf-token'] = csrf
      let res: Response
      try {
        res = await this.fetchImpl(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers,
        })
      } catch {
        return false // network failure — treat as not-refreshed, keep existing state.
      }
      if (res.status !== 200) {
        this.accessToken = null
        return false
      }
      const mapped = await this.mapResponse<{ accessToken: string }>(res)
      if (!mapped.ok) {
        this.accessToken = null
        return false
      }
      this.accessToken = mapped.data.accessToken
      return true
    })()
    this.refreshInFlight = run
    void run.finally(() => {
      this.refreshInFlight = null
    })
    return run
  }

  private rawFetch(method: string, path: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (this.accessToken !== null) headers['authorization'] = `Bearer ${this.accessToken}`
    if (path === '/auth/refresh') {
      const csrf = this.readCsrfToken()
      if (csrf !== null) headers['x-csrf-token'] = csrf
    }
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  }

  /** Map an HTTP `Response` carrying the server's `Result`-shaped JSON to a `Result<T>`. */
  private async mapResponse<T>(res: Response): Promise<Result<T>> {
    let parsed: ServerEnvelope | null = null
    try {
      const text = await res.text()
      parsed = text.length > 0 ? (JSON.parse(text) as ServerEnvelope) : null
    } catch {
      parsed = null
    }

    if (parsed !== null && parsed.ok === true) {
      return ok(parsed.data as T)
    }
    if (parsed !== null && parsed.ok === false && parsed.error !== undefined) {
      const code = typeof parsed.error.code === 'string' ? parsed.error.code : ERROR_CODES.INTERNAL
      const message =
        typeof parsed.error.message === 'string' ? parsed.error.message : 'request failed'
      // A paywall response (a /vault/* 402) drives the upgrade modal (task §5). The error
      // is still returned to the caller so its own flow (e.g. a failed sync) is honest.
      if (code === ERROR_CODES.UPGRADE_REQUIRED || code === ERROR_CODES.PAYMENT_REQUIRED) {
        this.onUpgradeRequired?.(parsed.error.details)
      }
      return parsed.error.details === undefined
        ? err(code, message)
        : err(code, message, parsed.error.details)
    }
    // No parseable envelope — derive a code from the HTTP status so the UI still maps it.
    return err(codeForStatus(res.status), `request failed with status ${res.status}`)
  }
}

/** Map a bare HTTP status (non-enveloped error, e.g. a proxy 502) to a canonical code. */
function codeForStatus(status: number): string {
  switch (status) {
    case 401:
      return ERROR_CODES.UNAUTHENTICATED
    case 403:
      return ERROR_CODES.FORBIDDEN
    case 404:
      return ERROR_CODES.NOT_FOUND
    case 409:
      return ERROR_CODES.CONFLICT
    case 413:
      return ERROR_CODES.PAYLOAD_TOO_LARGE
    case 429:
      return ERROR_CODES.RATE_LIMITED
    default:
      return ERROR_CODES.INTERNAL
  }
}

/** Default CSRF reader: the readable (non-HttpOnly) `csrf` cookie, or null. */
function defaultReadCsrf(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/)
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : null
}
