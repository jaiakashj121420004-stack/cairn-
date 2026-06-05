import { ERROR_CODES } from '@cairn/shared-types'
import {
  forgotPasswordOutputSchema,
  forgotPasswordSchema,
  loginSchema,
  magicConsumeSchema,
  magicRequestSchema,
  resetPasswordOutputSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@cairn/shared-zod'
import { AppError } from '../lib/errors'
import { parseBody, sendError, sendOk, sendValidated, toAppError } from '../lib/http'
import { HOUR, MINUTES_15 } from '../lib/rate-limit'
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookies'
import type { AuthService, RequestContext } from './service'
import type { Env } from '../env'
import type { RateLimiter, RateLimitRule } from '../lib/rate-limit'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

/**
 * Auth HTTP surface (CLAUDE.md §18.5). Every endpoint validates its body with a
 * shared Zod schema, runs through the rate limiter where relevant, and returns a
 * `Result`. The raw refresh token is only ever placed in the `__Host-refresh`
 * cookie — never in a JSON body.
 */

// Rate-limit rules (per IP and per identifier). See CLAUDE.md §2.13.
const SIGNUP_IP: RateLimitRule = { limit: 5, windowMs: MINUTES_15 }
const SIGNUP_EMAIL: RateLimitRule = { limit: 3, windowMs: HOUR }
const LOGIN_IP: RateLimitRule = { limit: 5, windowMs: MINUTES_15 }
const LOGIN_EMAIL: RateLimitRule = { limit: 5, windowMs: MINUTES_15 }
const MAGIC_IP: RateLimitRule = { limit: 5, windowMs: MINUTES_15 }
const MAGIC_EMAIL: RateLimitRule = { limit: 3, windowMs: HOUR }
const FORGOT_IP: RateLimitRule = { limit: 5, windowMs: MINUTES_15 }
const FORGOT_EMAIL: RateLimitRule = { limit: 3, windowMs: HOUR }
const RESET_IP: RateLimitRule = { limit: 10, windowMs: MINUTES_15 }

export interface AuthRouteDeps {
  readonly authService: AuthService
  readonly env: Env
  readonly limiter: RateLimiter
}

function contextOf(req: FastifyRequest): RequestContext {
  const ua = req.headers['user-agent']
  return { ip: req.ip, ...(typeof ua === 'string' ? { userAgent: ua } : {}) }
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { authService, env, limiter } = deps

  /** Consume one rate-limit slot for `key`; on block, write 429 and return true. */
  async function blocked(reply: FastifyReply, key: string, rule: RateLimitRule): Promise<boolean> {
    const decision = await limiter.consume(key, rule)
    if (!decision.allowed) {
      void reply.header('retry-after', String(decision.retryAfterSeconds))
      sendError(reply, new AppError(ERROR_CODES.RATE_LIMITED, 'too many requests'))
      return true
    }
    return false
  }

  // POST /auth/signup
  app.post('/auth/signup', async (req, reply) => {
    try {
      const input = parseBody(signupSchema, req.body)
      if (await blocked(reply, `signup:ip:${req.ip}`, SIGNUP_IP)) return
      if (await blocked(reply, `signup:email:${input.email}`, SIGNUP_EMAIL)) return
      const data = await authService.signup(input, contextOf(req))
      sendOk(reply, data)
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // POST /auth/verify
  app.post('/auth/verify', async (req, reply) => {
    try {
      const { token } = parseBody(verifyEmailSchema, req.body)
      const data = await authService.verifyEmail(token)
      sendOk(reply, data)
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // POST /auth/login
  app.post('/auth/login', async (req, reply) => {
    try {
      const input = parseBody(loginSchema, req.body)
      if (await blocked(reply, `login:ip:${req.ip}`, LOGIN_IP)) return
      if (await blocked(reply, `login:email:${input.email}`, LOGIN_EMAIL)) return
      const { auth, refreshToken } = await authService.login(input, contextOf(req))
      setRefreshCookie(reply, refreshToken, env)
      sendOk(reply, auth)
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // POST /auth/refresh
  app.post('/auth/refresh', async (req, reply) => {
    const rawToken = readRefreshCookie(req)
    if (!rawToken) {
      // No cookie ⇒ not authenticated. 401 forces a fresh login.
      sendError(reply, new AppError(ERROR_CODES.INVALID_TOKEN, 'missing refresh cookie'), 401)
      return
    }
    try {
      const { auth, refreshToken } = await authService.refresh(rawToken, contextOf(req))
      setRefreshCookie(reply, refreshToken, env)
      sendOk(reply, auth)
    } catch (err) {
      // Any refresh failure (reuse, expiry, unknown) invalidates the cookie and
      // forces re-login: a bad refresh token is a 401, not a 400.
      clearRefreshCookie(reply, env)
      const appErr = toAppError(err)
      sendError(reply, appErr, appErr.code === ERROR_CODES.INVALID_TOKEN ? 401 : undefined)
    }
  })

  // POST /auth/logout
  app.post('/auth/logout', async (req, reply) => {
    try {
      await authService.logout(readRefreshCookie(req))
    } catch {
      // Logout is best-effort; never surface an error to the caller.
    }
    clearRefreshCookie(reply, env)
    sendOk(reply, { ok: true })
  })

  // POST /auth/magic-request
  app.post('/auth/magic-request', async (req, reply) => {
    try {
      const { email } = parseBody(magicRequestSchema, req.body)
      if (await blocked(reply, `magic:ip:${req.ip}`, MAGIC_IP)) return
      if (await blocked(reply, `magic:email:${email}`, MAGIC_EMAIL)) return
      await authService.magicRequest(email)
      // Always the same response, whether or not the account exists (no leak).
      sendOk(reply, { sent: true })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // POST /auth/magic-consume
  app.post('/auth/magic-consume', async (req, reply) => {
    try {
      const { token } = parseBody(magicConsumeSchema, req.body)
      const { auth, refreshToken } = await authService.magicConsume(token, contextOf(req))
      setRefreshCookie(reply, refreshToken, env)
      sendOk(reply, auth)
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // POST /auth/forgot-password
  app.post('/auth/forgot-password', async (req, reply) => {
    try {
      const { email } = parseBody(forgotPasswordSchema, req.body)
      if (await blocked(reply, `forgot:ip:${req.ip}`, FORGOT_IP)) return
      if (await blocked(reply, `forgot:email:${email}`, FORGOT_EMAIL)) return
      await authService.forgotPassword(email)
      // Always the same response, whether or not the account exists (no leak).
      sendValidated(reply, forgotPasswordOutputSchema, { sent: true })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // POST /auth/reset-password
  app.post('/auth/reset-password', async (req, reply) => {
    try {
      const input = parseBody(resetPasswordSchema, req.body)
      if (await blocked(reply, `reset:ip:${req.ip}`, RESET_IP)) return
      await authService.resetPassword(input.token, input.password)
      // No session is issued — the user logs in with the new password. Existing
      // sessions were revoked server-side as part of the reset.
      sendValidated(reply, resetPasswordOutputSchema, { reset: true })
    } catch (err) {
      // A bad/expired/used reset token is an INVALID_TOKEN → 400, like email-verify.
      sendError(reply, toAppError(err))
    }
  })

  // OAuth stubs — registered so Stage 5 can wire them. 501 with NOT_IMPLEMENTED.
  const notImplemented = (_req: FastifyRequest, reply: FastifyReply): void => {
    sendError(reply, new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'OAuth is not implemented yet'))
  }
  app.get('/auth/oauth/apple', notImplemented)
  app.get('/auth/oauth/google', notImplemented)
}
