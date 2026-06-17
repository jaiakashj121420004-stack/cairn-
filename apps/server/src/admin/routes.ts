import { ERROR_CODES } from '@cairn/shared-types'
import { desc } from 'drizzle-orm'
import { auditLog } from '../db/schema'
import { auditLogOutputSchema } from '../lib/contracts'
import { timingSafeEqualUtf8 } from '../lib/crypto-random'
import { AppError } from '../lib/errors'
import { sendError, sendValidated, toAppError } from '../lib/http'
import type { Db } from '../db/client'
import type { Env } from '../env'
import type { FastifyInstance } from 'fastify'

/**
 * Admin-only endpoints (CLAUDE.md §2.13).
 *
 * Protected by a Bearer token from env.ADMIN_TOKEN. If ADMIN_TOKEN is not set,
 * the endpoint returns 404 — the route does not reveal its own existence.
 *
 * Never exposed in the same process without a valid ADMIN_TOKEN env var.
 */

export interface AdminRouteDeps {
  readonly db: Db
  readonly env: Env
}

export function registerAdminRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { db, env } = deps

  // GET /admin/audit-log — most-recent audit rows, newest first.
  app.get('/admin/audit-log', async (req, reply) => {
    try {
      // Return 404 if the admin token is not configured — do not acknowledge the route.
      if (!env.ADMIN_TOKEN) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'not found')
      }

      const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
      // Constant-time compare so a guesser can't learn the token byte-by-byte from timing.
      if (!bearer || !timingSafeEqualUtf8(bearer, env.ADMIN_TOKEN)) {
        throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'invalid admin token')
      }

      const rows = await db
        .select({
          id: auditLog.id,
          userId: auditLog.userId,
          event: auditLog.event,
          severity: auditLog.severity,
          detail: auditLog.detail,
          ip: auditLog.ip,
          createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .orderBy(desc(auditLog.createdAt))
        .limit(100)

      sendValidated(reply, auditLogOutputSchema, {
        entries: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
      })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })
}
