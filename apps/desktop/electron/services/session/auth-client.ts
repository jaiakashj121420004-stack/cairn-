/**
 * Desktop auth HTTP client (CLAUDE.md §18.5, Stage 2 client session layer).
 *
 * Talks to the Fastify backend's `/auth/*` endpoints from the Electron *main* process.
 * Every method returns a {@link Result} — the boundary never throws — and maps the
 * server's already-`Result`-shaped JSON body straight through, falling back to a
 * synthetic error on a network failure or a non-JSON body.
 *
 * The raw refresh token lives only in the `__Host-refresh` cookie. Node's `fetch`
 * does not own a cookie jar, so this client extracts the token from the response's
 * `Set-Cookie` header (login/refresh/magic-consume) and hands it back to the caller,
 * which persists it in the OS keychain — never in a renderer-reachable surface.
 *
 * `fetchImpl` is injected (defaults to the global `fetch`) so unit tests drive every
 * path without a network.
 */
import { err, ok } from '@cairn/shared-types'
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@cairn/shared-zod'
import { REFRESH_COOKIE_NAME } from './cookie'
import type { Result } from '@cairn/shared-types'
import type { AuthSession, SignupResult } from '@cairn/shared-types'
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
} from '@cairn/shared-zod'

/** Minimal response surface the client needs: status, set-cookie list, and the body text. */
export interface AuthFetchResponse {
  readonly status: number
  /** All `Set-Cookie` headers from the response (undici exposes `getSetCookie()`). */
  getSetCookie(): string[]
  text(): Promise<string>
}

/** Injected fetch. Headers carry `cookie` for refresh/logout; body is JSON or absent. */
export type AuthFetchLike = (
  input: string,
  init: {
    method: string
    headers: Record<string, string>
    body?: string
  },
) => Promise<AuthFetchResponse>

/** A successful authentication: the API session plus the raw refresh token to persist. */
export interface AuthClientSession {
  readonly session: AuthSession
  /** Raw refresh token parsed from the `__Host-refresh` cookie. */
  readonly refreshToken: string
}

/** Generic transport-level codes for failures the server never produced a body for. */
const NETWORK_ERROR = 'NETWORK_ERROR'
const INTERNAL = 'INTERNAL'

/** Pull the `__Host-refresh` value out of a `Set-Cookie` header list, or null. */
export function parseRefreshCookie(setCookies: readonly string[]): string | null {
  const prefix = `${REFRESH_COOKIE_NAME}=`
  for (const raw of setCookies) {
    if (!raw.startsWith(prefix)) continue
    const value = raw.slice(prefix.length).split(';', 1)[0] ?? ''
    // An empty value is a clear (e.g. on logout) — not a usable token.
    if (value.length > 0) return value
  }
  return null
}

export interface AuthHttpClientOptions {
  /** Base URL of the API, e.g. `https://api.cairn.app`. No trailing slash required. */
  readonly baseUrl: string
  /** Injected fetch implementation. Defaults to the global `fetch`. */
  readonly fetchImpl?: AuthFetchLike
}

/** A parsed HTTP exchange: the raw status plus the JSON-parsed body (or null). */
interface ParsedResponse {
  readonly status: number
  readonly body: unknown
  readonly setCookies: string[]
}

/**
 * Narrow a server JSON body to a {@link Result}. The server already serializes every
 * response as a `Result<T>`; this re-validates the discriminant defensively so a
 * malformed/proxy body becomes a typed error rather than a thrown cast.
 */
function bodyToResult<T>(parsed: ParsedResponse): Result<T> {
  const { body } = parsed
  if (body !== null && typeof body === 'object' && 'ok' in body) {
    const r = body as { ok: unknown; data?: unknown; error?: unknown }
    if (r.ok === true) return ok(r.data as T)
    if (
      r.ok === false &&
      r.error !== null &&
      typeof r.error === 'object' &&
      'code' in r.error &&
      'message' in r.error
    ) {
      const e = r.error as { code: string; message: string; details?: unknown }
      return e.details === undefined
        ? err(e.code, e.message)
        : err(e.code, e.message, e.details)
    }
  }
  // A 2xx with an unrecognizable body is still a contract violation; surface it.
  return err(INTERNAL, `unexpected response (status ${parsed.status})`)
}

export class AuthHttpClient {
  private readonly baseUrl: string
  private readonly fetchImpl: AuthFetchLike

  constructor(opts: AuthHttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as AuthFetchLike)
  }

  // ── Public surface ──────────────────────────────────────────────────────────

  /** Create an account; the server emails a verification link. Returns `{ userId }`. */
  async signup(input: SignupInput): Promise<Result<SignupResult>> {
    const validated = signupSchema.safeParse(input)
    if (!validated.success) return err('VALIDATION_FAILED', 'invalid signup input')
    const res = await this.post('/auth/signup', validated.data)
    if (!res.ok) return res
    return bodyToResult<SignupResult>(res.parsed)
  }

  /** Log in. On success, also returns the refresh token parsed from the cookie. */
  login(input: LoginInput): Promise<Result<AuthClientSession>> {
    const validated = loginSchema.safeParse(input)
    if (!validated.success) return Promise.resolve(err('VALIDATION_FAILED', 'invalid login input'))
    return this.authenticating('/auth/login', validated.data)
  }

  /**
   * Exchange the refresh cookie for a fresh access token (and a rotated refresh token).
   * The token is sent as a `Cookie` header since this client has no jar of its own.
   */
  refresh(refreshToken: string): Promise<Result<AuthClientSession>> {
    return this.authenticating('/auth/refresh', undefined, refreshToken)
  }

  /** Best-effort server-side session revocation. Always resolves; logout never errors out loud. */
  async logout(refreshToken: string | null): Promise<Result<void>> {
    const res = await this.post(
      '/auth/logout',
      {},
      refreshToken !== null ? refreshToken : undefined,
    )
    if (!res.ok) return ok(undefined) // logout is best-effort by contract
    return ok(undefined)
  }

  /** Consume an email verification token. */
  async verifyEmail(token: string): Promise<Result<{ verified: boolean }>> {
    const validated = verifyEmailSchema.safeParse({ token })
    if (!validated.success) return err('VALIDATION_FAILED', 'invalid token')
    const res = await this.post('/auth/verify', validated.data)
    if (!res.ok) return res
    return bodyToResult<{ verified: boolean }>(res.parsed)
  }

  /** Request a password-reset email. Always resolves `{ sent: true }` (no enumeration). */
  async forgotPassword(input: ForgotPasswordInput): Promise<Result<{ sent: true }>> {
    const validated = forgotPasswordSchema.safeParse(input)
    if (!validated.success) return err('VALIDATION_FAILED', 'invalid email')
    const res = await this.post('/auth/forgot-password', validated.data)
    if (!res.ok) return res
    return bodyToResult<{ sent: true }>(res.parsed)
  }

  /** Consume a reset token and set a new account password. Issues no session. */
  async resetPassword(input: ResetPasswordInput): Promise<Result<{ reset: true }>> {
    const validated = resetPasswordSchema.safeParse(input)
    if (!validated.success) return err('VALIDATION_FAILED', 'invalid reset input')
    const res = await this.post('/auth/reset-password', validated.data)
    if (!res.ok) return res
    return bodyToResult<{ reset: true }>(res.parsed)
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Shared login/refresh path: POST, then pair the session with the rotated cookie. */
  private async authenticating(
    path: string,
    input: unknown,
    refreshToken?: string,
  ): Promise<Result<AuthClientSession>> {
    const res = await this.post(path, input, refreshToken)
    if (!res.ok) return res
    const sessionResult = bodyToResult<AuthSession>(res.parsed)
    if (!sessionResult.ok) return sessionResult
    const cookie = parseRefreshCookie(res.parsed.setCookies)
    if (cookie === null) {
      return err(INTERNAL, 'authentication succeeded but no refresh cookie was returned')
    }
    return ok({ session: sessionResult.data, refreshToken: cookie })
  }

  /**
   * Issue a POST. Returns the parsed exchange on completion (any HTTP status), or a
   * `NETWORK_ERROR` Result when the fetch itself threw (offline / DNS / TLS).
   */
  private async post(
    path: string,
    input: unknown,
    refreshToken?: string,
  ): Promise<{ ok: true; parsed: ParsedResponse } | (Result<never> & { ok: false })> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (refreshToken !== undefined) headers['cookie'] = `${REFRESH_COOKIE_NAME}=${refreshToken}`

    let res: AuthFetchResponse
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input ?? {}),
      })
    } catch (e) {
      return err(NETWORK_ERROR, e instanceof Error ? e.message : String(e)) as Result<never> & {
        ok: false
      }
    }

    let body: unknown = null
    try {
      const text = await res.text()
      body = text.length > 0 ? JSON.parse(text) : null
    } catch {
      body = null // non-JSON (e.g. an HTML 502 from a proxy); status still drives handling
    }

    return { ok: true, parsed: { status: res.status, body, setCookies: res.getSetCookie() } }
  }
}

/**
 * Production {@link AuthFetchLike} over the global `fetch` (undici in Electron's main
 * process). Exposes `Set-Cookie` via `Headers.getSetCookie()`.
 */
export const nodeAuthFetch: AuthFetchLike = async (input, init) => {
  const res = await fetch(input, {
    method: init.method,
    headers: init.headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
  })
  return {
    status: res.status,
    getSetCookie: () => res.headers.getSetCookie(),
    text: () => res.text(),
  }
}
