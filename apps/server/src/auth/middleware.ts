import { ERROR_CODES } from '@cairn/shared-types'
import { AppError } from '../lib/errors'
import { sendError } from '../lib/http'
import { verifyAccessToken } from './tokens'
import type { Env } from '../env'
import type { AccessTokenClaims } from '@cairn/shared-types'
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'

/**
 * Auth guards (CLAUDE.md §18.5).
 *
 * `requireAuth` validates the Bearer access token and attaches `req.user`.
 * `requireVerifiedEmail` additionally demands a verified email — it gates
 * sync-bearing endpoints (e.g. `/vault/*`). Both reply with a `Result` error and
 * stop the handler chain; they never throw across the boundary.
 */

function extractBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) return null
  return token
}

/** Build the `requireAuth` preHandler bound to the validated env. */
export function makeRequireAuth(env: Env): preHandlerHookHandler {
  return async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = extractBearer(req)
    if (!token) {
      sendError(reply, new AppError(ERROR_CODES.UNAUTHENTICATED, 'missing bearer token'))
      return
    }
    try {
      req.user = await verifyAccessToken(token, env)
    } catch (err) {
      sendError(
        reply,
        err instanceof AppError ? err : new AppError(ERROR_CODES.UNAUTHENTICATED, 'invalid token'),
      )
    }
  }
}

/**
 * `requireVerifiedEmail` preHandler. Must run AFTER `requireAuth`. Returns 401 if
 * unauthenticated, 403 `EMAIL_NOT_VERIFIED` if the verified flag is false.
 */
export function requireVerifiedEmail(
  req: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void,
): void {
  const user: AccessTokenClaims | null = req.user
  if (!user) {
    sendError(reply, new AppError(ERROR_CODES.UNAUTHENTICATED, 'authentication required'))
    return
  }
  if (!user.emailVerified) {
    sendError(reply, new AppError(ERROR_CODES.EMAIL_NOT_VERIFIED, 'verified email required'))
    return
  }
  done()
}

/**
 * Read the authenticated user attached by `requireAuth`. The preHandler guarantees
 * `req.user` is set, but its static type is nullable — this narrows it without a
 * non-null assertion and fails closed (401) if a route is ever wired without a guard.
 */
export function authedUser(req: FastifyRequest): AccessTokenClaims {
  const user = req.user
  if (!user) throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'authentication required')
  return user
}
