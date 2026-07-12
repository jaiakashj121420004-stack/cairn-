import { ERROR_CODES } from '@cairn/shared-types'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { createHibpChecker } from './auth/breached-password'
import { AuthService } from './auth/service'
import { EntitlementService } from './billing/entitlement-service'
import { createBillingProviders } from './billing/registry'
import { createEmailProvider } from './email'
import { AppError } from './lib/errors'
import { sendError } from './lib/http'
import { MemoryRateLimitStore, RateLimiter } from './lib/rate-limit'
import { buildLogger } from './logger'
import { registerRoutes } from './routes/index'
import { httpRequestDurationMs, httpRequestsTotal } from './telemetry/metrics'
import { captureException } from './telemetry/sentry'
import type { BreachedPasswordChecker } from './auth/breached-password'
import type { BillingProviders } from './billing/provider'
import type { Db } from './db/client'
import type { EmailProvider } from './email'
import type { Env } from './env'
import type { RateLimitStore } from './lib/rate-limit'
import type { FastifyInstance } from 'fastify'

/**
 * Build the Fastify application (CLAUDE.md §3.4, §18.5).
 *
 * Dependencies are injected so integration tests can supply a real test database,
 * an in-memory email provider, and a fresh rate-limit store. Security defaults are
 * default-deny: strict helmet/CSP, an explicit CORS allowlist, a JSON-only body
 * parser with a size cap, and a uniform `Result` error envelope that never leaks
 * internal error detail.
 */
export interface BuildAppOptions {
  readonly env: Env
  readonly db: Db
  /** Defaults to the provider selected by `env`. Tests pass a `MemoryEmailProvider`. */
  readonly emailProvider?: EmailProvider
  /** Defaults to a fresh in-process store. Tests pass one they can reset. */
  readonly rateLimitStore?: RateLimitStore
  /** Defaults to the providers configured in `env`. Tests inject fakes (no network). */
  readonly billingProviders?: BillingProviders
  /** Defaults to a fresh service over `db`. Tests may inject one with a controllable cache. */
  readonly entitlements?: EntitlementService
  /** Defaults to the env-selected HIBP checker (or none). Tests inject a fake (no network). */
  readonly breachedPasswordCheck?: BreachedPasswordChecker
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { env, db } = opts

  const app = Fastify({
    logger: buildLogger(env),
    bodyLimit: env.BODY_LIMIT_BYTES,
    // Behind a load balancer / proxy; honor X-Forwarded-* for accurate client IPs
    // (used as a rate-limit key). Safe because we deploy behind a trusted LB.
    trustProxy: true,
    disableRequestLogging: env.NODE_ENV === 'test',
  })

  // --- Security headers. The API serves JSON only, so lock CSP all the way down.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  })

  // --- CORS: explicit allowlist only; credentials enabled for the cookie flow.
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? [...env.CORS_ORIGINS] : false,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE'],
  })

  // --- Cookies (refresh token transport). We don't sign cookies — the token value
  // is itself the high-entropy secret and is validated server-side by hash.
  await app.register(cookie)

  // --- Global defense-in-depth rate limit (per IP). Auth endpoints add tighter,
  // per-identifier limits on top (see auth/routes.ts). Returns the Result envelope.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // @fastify/rate-limit *throws* this builder's return value (index.js: `throw
    // params.errorResponseBuilder(...)`). Returning an `AppError` routes it through
    // our `setErrorHandler` like any other typed error, yielding a clean 429 `Result`
    // with the `RATE_LIMITED` code. Returning a bare envelope (no `statusCode`) made
    // Fastify treat it as an unknown 500 — the opposite of the intent.
    errorResponseBuilder: () => new AppError(ERROR_CODES.RATE_LIMITED, 'too many requests'),
  })

  // --- Request metrics (CLAUDE.md §18.9). Route pattern (not literal URL) keeps
  // label cardinality bounded; falls back to the raw URL for unmatched (404) requests.
  app.addHook('onResponse', (req, reply, done) => {
    const route = req.routeOptions.url ?? req.url
    httpRequestsTotal.add(1, { route, method: req.method, status_code: reply.statusCode })
    httpRequestDurationMs.record(reply.elapsedTime, { route, method: req.method })
    done()
  })

  app.decorateRequest('user', null)

  const store = opts.rateLimitStore ?? new MemoryRateLimitStore()
  app.decorate('rateLimitStore', store)
  const limiter = new RateLimiter(store)

  const email = opts.emailProvider ?? createEmailProvider(env, app.log)
  // Breached-password screening is on in production, off for hermetic tests / offline dev
  // (HIBP_CHECK). Omitting the dep entirely ⇒ no check (see AuthService.assertPasswordAllowed).
  const breachedPasswordCheck =
    opts.breachedPasswordCheck ??
    (env.HIBP_CHECK === 'on' ? createHibpChecker({ logger: app.log }) : undefined)
  const authService = new AuthService({
    db,
    env,
    email,
    logger: app.log,
    ...(breachedPasswordCheck ? { breachedPasswordCheck } : {}),
  })
  const billingProviders = opts.billingProviders ?? createBillingProviders(env)
  const entitlements = opts.entitlements ?? new EntitlementService(db)

  registerRoutes(app, { authService, env, limiter, db, billingProviders, entitlements })

  // --- Uniform error + not-found envelopes.
  app.setNotFoundHandler((_req, reply) => {
    sendError(reply, new AppError(ERROR_CODES.NOT_FOUND, 'not found'))
  })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      sendError(reply, err)
      return
    }
    const statusCode = (err as { statusCode?: unknown }).statusCode
    const status = typeof statusCode === 'number' ? statusCode : 500
    // Fastify emits 413 when a request body exceeds the route's bodyLimit.
    if (status === 413) {
      sendError(reply, new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE, 'request body too large'), 413)
      return
    }
    if (status >= 400 && status < 500) {
      sendError(reply, new AppError(ERROR_CODES.VALIDATION_FAILED, 'invalid request'))
      return
    }
    req.log.error({ err }, 'unhandled error')
    captureException(err)
    sendError(reply, new AppError(ERROR_CODES.INTERNAL, 'internal server error'))
  })

  return app
}
