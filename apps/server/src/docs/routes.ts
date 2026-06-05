import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { openApiDocument } from './openapi'
import type { FastifyInstance } from 'fastify'

/**
 * API documentation surface (CLAUDE.md §18.5 scope: "OpenAPI / Scalar docs").
 *
 *   GET /openapi.json       — the hand-authored OpenAPI 3.1 contract (see ./openapi.ts)
 *   GET /docs               — the Scalar API reference UI, rendered against /openapi.json
 *   GET /docs/standalone.js — the vendored Scalar browser bundle (same-origin, no CDN)
 *
 * Self-hosting the Scalar bundle (vendored at ./scalar-standalone.js, @scalar/api-reference
 * 1.32.0, MIT) means: no external script, no Subresource-Integrity gap, and the docs work
 * fully offline. The global helmet CSP (`default-src 'none'`) would block the page's own
 * scripts/styles, so the three doc routes relax CSP to *same-origin* sources only — they
 * serve no secrets and no user content, so this is the narrowest workable policy.
 */

// Read the vendored bundle once at module load. Resolved relative to this file so it works
// under tsx (dev/test) and from any cwd. A read failure throws at boot — fail fast, never
// serve a half-broken docs page.
const SCALAR_BUNDLE = readFileSync(
  fileURLToPath(new URL('./scalar-standalone.js', import.meta.url)),
  'utf8',
)

// CSP scoped to the docs pages: same-origin scripts/styles/fonts/images, inline allowed
// (Scalar injects a <style> block and an init script), eval + blob workers allowed (the
// bundle uses them for syntax highlighting / search), and connect to same origin for the
// spec fetch. Nothing cross-origin is permitted.
const DOCS_CSP =
  "default-src 'none'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'self'; " +
  'worker-src blob:; ' +
  "frame-ancestors 'none'; " +
  "base-uri 'none'"

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cairn API Reference</title>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="/docs/standalone.js"></script>
  </body>
</html>
`

export interface DocsRouteDeps {
  /** Mirrors env.ENABLE_API_DOCS. When false, no doc routes are registered (they 404). */
  readonly enabled: boolean
}

export function registerDocsRoutes(app: FastifyInstance, deps: DocsRouteDeps): void {
  if (!deps.enabled) return

  // The OpenAPI contract. Served raw (not through the Result envelope) so standard
  // OpenAPI tooling — Scalar, Swagger UI, codegen — can consume it directly.
  app.get('/openapi.json', (_req, reply) => {
    void reply.header('content-type', 'application/json; charset=utf-8').send(openApiDocument)
  })

  app.get('/docs/standalone.js', (_req, reply) => {
    reply.removeHeader('content-security-policy')
    void reply
      .header('content-type', 'application/javascript; charset=utf-8')
      .header('cache-control', 'public, max-age=86400, immutable')
      .header('content-security-policy', DOCS_CSP)
      .send(SCALAR_BUNDLE)
  })

  app.get('/docs', (_req, reply) => {
    reply.removeHeader('content-security-policy')
    void reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy', DOCS_CSP)
      .send(PAGE_HTML)
  })
}
