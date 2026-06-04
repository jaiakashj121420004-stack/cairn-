import type { Env } from '../env'
import type { CookieSerializeOptions } from '@fastify/cookie'
import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Refresh-token cookie handling (CLAUDE.md §2.13).
 *
 * The refresh token lives ONLY in an `HttpOnly`, `SameSite=Strict`, `Secure`,
 * `__Host-`-prefixed cookie — never in a response body and never readable by JS.
 *
 * NOTE — deliberate deviation from the stage prompt: the prompt asked for both the
 * `__Host-` prefix AND `Path=/auth/refresh`. Those are mutually exclusive: per the
 * cookie-prefix spec (RFC 6265bis) and every browser, a `__Host-` cookie MUST have
 * `Path=/` and no `Domain`, or it is silently rejected. CLAUDE.md §2.13 names
 * `__Host-` cookies as a locked security baseline, so we keep the prefix and use
 * `Path=/`. The narrower-path benefit (cookie not sent on unrelated requests) is
 * covered by `HttpOnly` + `SameSite=Strict` + server-side refresh-reuse detection.
 */

/** The one cookie name the refresh flow uses. */
export const REFRESH_COOKIE_NAME = '__Host-refresh'

function baseOptions(
  env: Pick<Env, 'NODE_ENV' | 'COOKIE_SECURE' | 'REFRESH_TOKEN_TTL_DAYS'>,
): CookieSerializeOptions {
  // `__Host-` requires Secure. Default on in production; otherwise honor the explicit
  // override (for local TLS) and fall back to off so http:// dev still functions.
  const secure = env.COOKIE_SECURE ?? env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/', // required by the __Host- prefix
  }
}

/** Set (or rotate) the refresh cookie on a reply. */
export function setRefreshCookie(
  reply: FastifyReply,
  rawToken: string,
  env: Pick<Env, 'NODE_ENV' | 'COOKIE_SECURE' | 'REFRESH_TOKEN_TTL_DAYS'>,
): void {
  // setCookie returns the (PromiseLike) reply for chaining; not awaited → void.
  void reply.setCookie(REFRESH_COOKIE_NAME, rawToken, {
    ...baseOptions(env),
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  })
}

/** Clear the refresh cookie (logout / forced re-login). */
export function clearRefreshCookie(
  reply: FastifyReply,
  env: Pick<Env, 'NODE_ENV' | 'COOKIE_SECURE' | 'REFRESH_TOKEN_TTL_DAYS'>,
): void {
  void reply.clearCookie(REFRESH_COOKIE_NAME, baseOptions(env))
}

/** Read the raw refresh token from the request cookie, if present. */
export function readRefreshCookie(req: FastifyRequest): string | undefined {
  return req.cookies[REFRESH_COOKIE_NAME]
}
