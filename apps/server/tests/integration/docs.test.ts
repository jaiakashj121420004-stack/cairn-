import helmet from '@fastify/helmet'
import Fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openApiDocument } from '../../src/docs/openapi'
import { registerDocsRoutes } from '../../src/docs/routes'
import type { FastifyInstance } from 'fastify'

/**
 * Docs surface (CLAUDE.md §18.5: "OpenAPI / Scalar docs auto-generated").
 *
 * Self-contained: no database, no auth. We mount a minimal Fastify app with the SAME
 * locked-down global CSP the real app uses (`default-src 'none'`) to prove the doc
 * routes correctly relax it for themselves and nothing else.
 */

// Every HTTP path registered in src/routes/index.ts (+ the per-module route files).
// The docs must document exactly these — a missing or stale entry fails this test,
// turning contract drift into a CI failure rather than a misleading published spec.
const REGISTERED_PATHS = [
  '/health',
  '/auth/signup',
  '/auth/verify',
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/magic-request',
  '/auth/magic-consume',
  '/auth/oauth/google',
  '/auth/oauth/apple',
  '/devices',
  '/devices/{id}',
  '/vault/manifest',
  '/vault/push',
  '/vault/pull',
  '/vault/key',
  '/billing/status',
  '/billing/checkout',
  '/billing/portal',
  '/billing/cancel',
  '/webhooks/stripe',
  '/webhooks/razorpay',
  '/admin/audit-log',
] as const

async function buildDocsApp(enabled: boolean): Promise<FastifyInstance> {
  const app = Fastify()
  // Mirror the production global CSP so we can prove the docs routes override it.
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
  })
  registerDocsRoutes(app, { enabled })
  await app.ready()
  return app
}

describe('API docs (enabled)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildDocsApp(true)
  })
  afterAll(async () => {
    await app.close()
  })

  it('serves a valid OpenAPI 3.1 document at /openapi.json', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    const doc = res.json() as {
      openapi: string
      info: { title: string }
      paths: Record<string, unknown>
    }
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info.title).toBe('Cairn API')
    expect(Object.keys(doc.paths).length).toBeGreaterThan(0)
  })

  it('documents exactly the registered route paths (no drift)', () => {
    const documented = Object.keys(openApiDocument.paths).sort()
    expect(documented).toEqual([...REGISTERED_PATHS].sort())
  })

  it('marks authenticated endpoints with bearer security', () => {
    const push = openApiDocument.paths['/vault/push'].post
    expect(push.security).toEqual([{ bearerAuth: [] }])
  })

  it('serves the Scalar UI HTML at /docs with a relaxed same-origin CSP', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('id="api-reference"')
    expect(res.body).toContain('data-url="/openapi.json"')
    expect(res.body).toContain('/docs/standalone.js')
    // CSP was relaxed for the page (global default-src 'none' would have blocked it).
    const csp = res.headers['content-security-policy']
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toBe("default-src 'none'")
  })

  it('serves the vendored Scalar bundle at /docs/standalone.js', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/standalone.js' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/javascript')
    expect(res.body).toContain('@scalar/api-reference')
  })
})

describe('API docs (disabled)', () => {
  it('404s every doc route when ENABLE_API_DOCS is off', async () => {
    const app = await buildDocsApp(false)
    try {
      for (const url of ['/openapi.json', '/docs', '/docs/standalone.js']) {
        const res = await app.inject({ method: 'GET', url })
        expect(res.statusCode).toBe(404)
      }
    } finally {
      await app.close()
    }
  })
})
