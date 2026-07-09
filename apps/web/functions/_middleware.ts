/// <reference types="@cloudflare/workers-types" />

/**
 * Edge middleware for production hosting (Cloudflare Pages Functions) — the authoritative
 * source of the per-response CSP nonce (CLAUDE.md §2.13, task §6).
 *
 * A fresh nonce is minted per request and used in two places that MUST match:
 *  1. The `Content-Security-Policy` response header.
 *  2. The `%CSP_NONCE%` placeholders in the served HTML (`<script>`, the meta fallback).
 *
 * Because the nonce is per-response and unguessable, an injected inline `<script>` can't
 * carry a valid nonce and is refused — without ever resorting to `unsafe-inline`. The
 * connect-src API origin is read from an env var so staging/prod point at the right API.
 *
 * Everything is bundled (no third-party scripts), so `script-src` needs no external host
 * and the SRI surface is empty.
 */

interface Env {
  /** API origin for `connect-src`, e.g. `https://api.cairn.app`. */
  readonly API_ORIGIN?: string
}

function buildCsp(nonce: string, apiOrigin: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self' ${apiOrigin}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ].join('; ')
}

function makeNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/**
 * Reflect Cloudflare's geo (`CF-IPCountry`) into a readable, non-secret `cf-country`
 * cookie so the pricing page can localize currency without a round-trip (task §5). Only a
 * clean 2-letter code is set; Cloudflare's placeholders (`XX` unknown, `T1` Tor) are
 * ignored so the client falls back to the browser locale. The cookie is intentionally
 * NOT `HttpOnly` (the client JS reads it) and carries no secret — it only picks a price.
 */
function setCountryCookie(headers: Headers, request: Request): void {
  const country = request.headers.get('CF-IPCountry')?.toUpperCase()
  if (country !== undefined && /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1') {
    headers.append(
      'Set-Cookie',
      `cf-country=${country}; Path=/; SameSite=Strict; Secure; Max-Age=86400`,
    )
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const nonce = makeNonce()
  const apiOrigin = context.env.API_ORIGIN ?? "'self'"
  const response = await context.next()

  const headers = new Headers(response.headers)
  headers.set('Content-Security-Policy', buildCsp(nonce, apiOrigin))
  setCountryCookie(headers, context.request)
  // Defence-in-depth headers (also mirrored statically in public/_headers).
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) {
    return new Response(response.body, { status: response.status, headers })
  }

  // Inject the nonce into the HTML placeholders so it matches the header.
  const html = (await response.text()).replaceAll('%CSP_NONCE%', nonce)
  return new Response(html, { status: response.status, headers })
}
