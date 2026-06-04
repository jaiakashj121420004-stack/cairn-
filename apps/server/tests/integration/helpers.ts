import { createHmac } from 'node:crypto'
import { randomBytes } from 'node:crypto'
import { buildApp } from '../../src/app'
import { createDb } from '../../src/db/client'
import { runMigrations } from '../../src/db/migrate'
import { loadEnv, resetEnvCache } from '../../src/env'
import { MemoryEmailProvider } from '../../src/email'
import { MemoryRateLimitStore } from '../../src/lib/rate-limit'
import type { BillingProviders } from '../../src/billing/provider'
import type { DbHandle } from '../../src/db/client'
import type { Env } from '../../src/env'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'

/**
 * Integration-test harness (CLAUDE.md §19.10). Runs against the REAL Postgres from
 * `docker-compose.yml` — the database is never mocked. Secrets are generated per run
 * with `crypto.randomBytes`; no production secret ever appears in tests.
 *
 *   docker compose up -d
 *   pnpm --filter @cairn/server run migrate   # or the harness migrates on boot
 *   pnpm --filter @cairn/server run test
 */

const TEST_TABLES = [
  'vault_op',
  'device',
  'webhook_event',
  'vault_meta',
  'user_session',
  'email_token',
  'audit_log',
  'subscription',
  'user_credential',
  'user',
]

export interface TestContext {
  readonly app: FastifyInstance
  readonly handle: DbHandle
  readonly email: MemoryEmailProvider
  readonly store: MemoryRateLimitStore
  readonly env: Env
}

/** Optional per-context overrides (e.g. inject fake billing providers — no network). */
export interface TestContextOptions {
  readonly billingProviders?: BillingProviders
}

/** Build a fully wired app against the test database. Call once per file in `beforeAll`. */
export async function createTestContext(opts: TestContextOptions = {}): Promise<TestContext> {
  resetEnvCache()
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://cairn:cairn@localhost:5432/cairn',
    // Per the stage spec: generate JWT/pepper secrets with randomBytes in tests.
    PASSWORD_PEPPER: randomBytes(32).toString('hex'),
    JWT_SECRET: randomBytes(32).toString('hex'),
    EMAIL_PROVIDER: 'memory',
    COOKIE_SECURE: 'false',
    CORS_ORIGINS: 'http://localhost:5173',
    ACCESS_TOKEN_TTL_SECONDS: '900',
    REFRESH_TOKEN_TTL_DAYS: '30',
    // Admin token — used by admin route tests.
    ADMIN_TOKEN: randomBytes(32).toString('hex'),
    // Stripe — fake test key (starts with sk_test_ so env validation passes).
    STRIPE_SECRET_KEY: `sk_test_${randomBytes(12).toString('hex')}`,
    STRIPE_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
    // Razorpay
    RAZORPAY_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
  })

  // Silence Postgres NOTICEs (e.g. "IF NOT EXISTS … already exists, skipping") so
  // idempotent migrations don't spam the test output.
  const handle = createDb(env.DATABASE_URL, { max: 4, onnotice: () => {} })
  await runMigrations(handle.sql)

  const email = new MemoryEmailProvider()
  const store = new MemoryRateLimitStore()
  const app = await buildApp({
    env,
    db: handle.db,
    emailProvider: email,
    rateLimitStore: store,
    ...(opts.billingProviders ? { billingProviders: opts.billingProviders } : {}),
  })
  await app.ready()

  return { app, handle, email, store, env }
}

/** Reset all mutable state between tests: truncate tables, clear inbox + rate limiter. */
export async function resetState(ctx: TestContext): Promise<void> {
  await ctx.handle.sql.unsafe(
    `TRUNCATE ${TEST_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  )
  ctx.email.clear()
  ctx.store.reset()
}

export async function teardown(ctx: TestContext): Promise<void> {
  await ctx.app.close()
  await ctx.handle.close()
}

/** POST JSON, optionally with a refresh cookie or Authorization header. */
export function postJson(
  app: FastifyInstance,
  url: string,
  body: unknown,
  cookieOrAuth?: string,
): Promise<LightMyRequestResponse> {
  const isBearer = typeof cookieOrAuth === 'string' && cookieOrAuth.startsWith('Bearer ')
  const opts: InjectOptions = {
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/json',
      ...(isBearer ? { authorization: cookieOrAuth } : {}),
      ...(!isBearer && cookieOrAuth ? { cookie: cookieOrAuth } : {}),
    },
    payload: JSON.stringify(body ?? {}),
  }
  return app.inject(opts)
}

/** POST raw bytes with custom headers (used by webhook tests). */
export function postRaw(
  app: FastifyInstance,
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...headers },
    payload: body,
  })
}

/** GET with an optional bearer access token. */
export function getWithAuth(
  app: FastifyInstance,
  url: string,
  accessToken?: string,
): Promise<LightMyRequestResponse> {
  const opts: InjectOptions = {
    method: 'GET',
    url,
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  }
  return app.inject(opts)
}

/** DELETE with a bearer access token. */
export function deleteWithAuth(
  app: FastifyInstance,
  url: string,
  accessToken: string,
): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'DELETE', url, headers: { authorization: `Bearer ${accessToken}` } })
}

const REFRESH_COOKIE_NAME = '__Host-refresh'

/** Extract the raw refresh-cookie value from an inject response, if present. */
export function refreshCookieFrom(res: {
  cookies: Array<{ name: string; value: string }>
}): string | undefined {
  return res.cookies.find((c) => c.name === REFRESH_COOKIE_NAME)?.value
}

/** Build a request `Cookie` header carrying the refresh token. */
export function refreshCookieHeader(value: string): string {
  return `${REFRESH_COOKIE_NAME}=${value}`
}

/**
 * Read the i-th element of an array, throwing if absent. Keeps tests free of the
 * banned non-null assertion (`arr[i]!`) under `noUncheckedIndexedAccess`.
 */
export function nth<T>(arr: readonly T[], i: number): T {
  const value = arr[i]
  if (value === undefined)
    throw new Error(`expected an element at index ${i} (length ${arr.length})`)
  return value
}

/** The Stripe webhook secret for the test env, asserted present (set in `createTestContext`). */
export function stripeWebhookSecret(ctx: TestContext): string {
  const secret = ctx.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set in the test env')
  return secret
}

/** The Razorpay webhook secret for the test env, asserted present. */
export function razorpayWebhookSecret(ctx: TestContext): string {
  const secret = ctx.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET is not set in the test env')
  return secret
}

/** Pull the first `token=<hex>` value out of a captured email body. */
export function tokenFromEmail(body: string): string {
  const match = /token=([a-f0-9]+)/.exec(body)
  if (!match || match[1] === undefined) throw new Error(`no token found in email body: ${body}`)
  return match[1]
}

// ── Test-account helpers ──────────────────────────────────────────────────────────────

/** Sign up, verify email, and log in. Returns a verified Bearer access token. */
export async function createVerifiedUser(
  ctx: TestContext,
  email?: string,
  password = 'correct horse battery staple',
): Promise<{ email: string; password: string; accessToken: string; userId: string }> {
  const addr = email ?? `user-${randomBytes(6).toString('hex')}@example.com`

  const signupRes = await postJson(ctx.app, '/auth/signup', { email: addr, password })
  if (signupRes.statusCode !== 200) throw new Error(`signup failed: ${signupRes.body}`)

  const verifyToken = tokenFromEmail(ctx.email.lastTo(addr)?.text ?? '')
  const verifyRes = await postJson(ctx.app, '/auth/verify', { token: verifyToken })
  if (verifyRes.statusCode !== 200) throw new Error(`verify failed: ${verifyRes.body}`)

  const loginRes = await postJson(ctx.app, '/auth/login', { email: addr, password })
  if (loginRes.statusCode !== 200) throw new Error(`login failed: ${loginRes.body}`)

  const data = loginRes.json().data as { accessToken: string; user: { userId: string } }
  return { email: addr, password, accessToken: data.accessToken, userId: data.user.userId }
}

// ── Stripe signature helpers ──────────────────────────────────────────────────────────

/**
 * Compute a Stripe webhook `stripe-signature` header value for the given raw body
 * and webhook secret. Uses the same algorithm as `stripe.webhooks.constructEvent`.
 * Safe for use in tests — does not call any Stripe API.
 */
export function makeStripeSignature(
  rawBody: string,
  secret: string,
  timestampOverride?: number,
): string {
  const t = timestampOverride ?? Math.floor(Date.now() / 1000)
  const signed = `${t}.${rawBody}`
  const v1 = createHmac('sha256', secret).update(signed).digest('hex')
  return `t=${t},v1=${v1}`
}

/** Build a minimal Stripe `customer.subscription.updated` event payload. */
export function makeStripeSubscriptionEvent(
  eventId: string,
  eventType: string,
  subscriptionData: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: eventId,
    object: 'event',
    type: eventType,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: { object: 'subscription', ...subscriptionData } },
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  }
}

// ── Razorpay signature helpers ────────────────────────────────────────────────────────

/**
 * Compute the Razorpay `x-razorpay-signature` header for a raw body.
 * Razorpay uses HMAC-SHA256 of the raw body (not timestamp-prefixed).
 */
export function makeRazorpaySignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

/** Build a minimal Razorpay `subscription.activated` event payload. */
export function makeRazorpaySubscriptionEvent(
  eventType: string,
  subscriptionData: Record<string, unknown>,
): Record<string, unknown> {
  return {
    entity: 'event',
    event: eventType,
    payload: {
      subscription: {
        entity: { object: 'subscription', ...subscriptionData },
      },
    },
  }
}
