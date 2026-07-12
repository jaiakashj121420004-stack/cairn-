import { ERROR_CODES } from '@cairn/shared-types'
import { desc } from 'drizzle-orm'
import { sweepExpiredGrace } from '../billing/apply'
import { auditLog } from '../db/schema'
import { appendAudit } from '../lib/audit'
import { auditLogOutputSchema } from '../lib/contracts'
import { timingSafeEqualUtf8 } from '../lib/crypto-random'
import { AppError } from '../lib/errors'
import { sendError, sendOk, sendValidated, toAppError } from '../lib/http'
import type { EntitlementService } from '../billing/entitlement-service'
import type { Db } from '../db/client'
import type { Env } from '../env'
import type { FastifyInstance, FastifyRequest } from 'fastify'

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
  readonly entitlements: EntitlementService
}

export function registerAdminRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { db, env, entitlements } = deps

  /**
   * Authorise an admin request. Returns 404 when ADMIN_TOKEN is unset (the route never
   * acknowledges its own existence) and 401 on a bad token, compared constant-time so a
   * guesser can't learn it byte-by-byte from timing (§2.13).
   */
  function requireAdmin(req: FastifyRequest): void {
    if (!env.ADMIN_TOKEN) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'not found')
    }
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!bearer || !timingSafeEqualUtf8(bearer, env.ADMIN_TOKEN)) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'invalid admin token')
    }
  }

  // GET /admin/audit-log — most-recent audit rows, newest first.
  app.get('/admin/audit-log', async (req, reply) => {
    try {
      requireAdmin(req)

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

  // POST /admin/billing/sweep — run the time-based subscription expiry sweep (§20.5).
  //
  // Time-based transitions (past_due → canceled after the 14-day hard grace; lapsed
  // trial → canceled) are not webhook-driven, so a scheduler must trigger them. This
  // endpoint is the trigger: a cron (`.github/workflows/billing-sweep.yml`) calls it on a
  // schedule with the admin token. It is idempotent — a run with nothing due sweeps zero
  // rows — and safe to call as often as the scheduler likes. Lazy expiry in
  // `deriveSubscription` already keeps gating correct between runs; the sweep just makes the
  // terminal state durable and invalidates the affected users' entitlement caches.
  app.post('/admin/billing/sweep', async (req, reply) => {
    try {
      requireAdmin(req)

      const swept = await sweepExpiredGrace(db)
      for (const userId of swept) {
        await entitlements.invalidate(userId)
      }
      await appendAudit(db, {
        event: 'billing.grace_sweep',
        severity: 'info',
        detail: { swept: swept.length },
      })

      sendOk(reply, { swept: swept.length })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })
}
