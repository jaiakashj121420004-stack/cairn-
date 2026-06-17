import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Production-CSP regression guard (CLAUDE.md §2.13, §18.9 task §6; threat-model §6 M3 / §8 O3).
 *
 * The *live* report-only Playwright sweep (confirming zero violations end-to-end under the
 * real per-response nonce policy) must run against the production build in CI — the e2e
 * suite today boots the Vite *dev* server, whose CSP is deliberately relaxed for HMR. That
 * live sweep is tracked as O3. THIS test is the cheap, deterministic half: it pins the
 * production policy so it can never silently regress to `unsafe-inline`/`unsafe-eval` or
 * drop a hardening directive — exactly the "do not relax the policy" rule in task §6.
 *
 * It asserts on the two authoritative prod sources:
 *   1. apps/web/functions/_middleware.ts — the per-response CSP *header* (Cloudflare edge).
 *   2. apps/web/index.html              — the defence-in-depth `<meta>` fallback.
 */

const webRoot = resolve(__dirname, '../..')
const middleware = readFileSync(resolve(webRoot, 'functions/_middleware.ts'), 'utf8')
const indexHtml = readFileSync(resolve(webRoot, 'index.html'), 'utf8')

/**
 * Pull ONLY the directive array the edge `buildCsp()` assembles (between `return [` and
 * `].join`). Scanning the whole file would false-match the words "unsafe-inline" / "*" that
 * appear in the explanatory comments — we must assert on the policy itself, not the prose.
 */
function middlewareCspDirectives(): string {
  const m = /return\s*\[([\s\S]*?)\]\.join/.exec(middleware)
  if (!m?.[1]) throw new Error('could not locate buildCsp directive array in _middleware.ts')
  return m[1]
}

describe('production CSP (edge header)', () => {
  const csp = middlewareCspDirectives()

  it('never allows unsafe-inline or unsafe-eval', () => {
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
  })

  it('uses a per-response nonce for scripts and styles', () => {
    expect(csp).toContain('script-src')
    expect(csp).toContain('nonce-${nonce}')
    // The nonce is minted per request (crypto.getRandomValues), not a build constant.
    expect(middleware).toContain('crypto.getRandomValues')
  })

  it('keeps the lock-down directives', () => {
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ]) {
      expect(csp).toContain(directive)
    }
  })

  it('restricts connect-src to self + the configured API origin only (no wildcard)', () => {
    expect(csp).toContain("connect-src 'self' ${apiOrigin}")
    expect(csp).not.toMatch(/connect-src[^;]*\*/)
  })

  it('sets the defence-in-depth response headers', () => {
    for (const header of [
      'X-Content-Type-Options',
      'Referrer-Policy',
      'X-Frame-Options',
      'Strict-Transport-Security',
      'Cross-Origin-Opener-Policy',
      'Permissions-Policy',
    ]) {
      expect(middleware).toContain(header)
    }
  })
})

describe('production CSP (index.html meta fallback)', () => {
  it('carries the nonce placeholder and never unsafe-inline/eval', () => {
    const meta = /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i.exec(indexHtml)?.[0] ?? ''
    expect(meta).not.toBe('')
    expect(meta).toContain('nonce-%CSP_NONCE%')
    expect(meta).not.toContain('unsafe-inline')
    expect(meta).not.toContain('unsafe-eval')
    expect(meta).toContain("object-src 'none'")
    expect(meta).toContain("base-uri 'none'")
    expect(meta).toContain("frame-ancestors 'none'")
  })

  it('ships exactly one script tag, and it is nonce-gated with no inline body', () => {
    const scripts = [...indexHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    expect(scripts).toHaveLength(1)
    const [tag, body] = [scripts[0]?.[0] ?? '', scripts[0]?.[1] ?? '']
    expect(tag).toContain('nonce="%CSP_NONCE%"')
    expect(tag).toContain('src=')
    // No inline JavaScript between the tags — only a src reference is allowed.
    expect(body.trim()).toBe('')
  })

  it('has no inline event-handler attributes (onclick=, onload=, …)', () => {
    expect(indexHtml).not.toMatch(/\son[a-z]+\s*=/i)
  })
})
