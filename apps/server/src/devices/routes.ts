import { ERROR_CODES } from '@cairn/shared-types'
import {
  listDevicesOutputSchema,
  registerDeviceOutputSchema,
  registerDeviceSchema,
  revokeDeviceOutputSchema,
} from '@cairn/shared-zod'
import { and, eq, isNull } from 'drizzle-orm'
import { authedUser, makeRequireAuth, requireVerifiedEmail } from '../auth/middleware'
import { devices } from '../db/schema'
import { AppError } from '../lib/errors'
import { parseBody, sendError, sendValidated, toAppError } from '../lib/http'
import type { Db } from '../db/client'
import type { Env } from '../env'
import type { FastifyInstance } from 'fastify'

/**
 * Device registry endpoints (CLAUDE.md §18.5).
 *
 * All three routes require auth + verified email — sync access is gated on email
 * ownership. Revocation is soft: the `revoked_at` column is set; the row persists
 * for audit purposes. Revoked devices cannot push or pull vault ops.
 */

export interface DeviceRouteDeps {
  readonly db: Db
  readonly env: Env
}

export function registerDeviceRoutes(app: FastifyInstance, deps: DeviceRouteDeps): void {
  const { db, env } = deps
  const requireAuth = makeRequireAuth(env)

  // POST /devices — register a new device.
  app.post('/devices', { preHandler: [requireAuth, requireVerifiedEmail] }, async (req, reply) => {
    try {
      const input = parseBody(registerDeviceSchema, req.body)
      const userId = authedUser(req).userId

      const inserted = await db
        .insert(devices)
        .values({ userId, name: input.name, platform: input.platform ?? null })
        .returning({
          id: devices.id,
          name: devices.name,
          platform: devices.platform,
          registeredAt: devices.registeredAt,
          lastSeenAt: devices.lastSeenAt,
          revokedAt: devices.revokedAt,
        })

      const row = inserted[0]
      if (!row) throw new AppError(ERROR_CODES.INTERNAL, 'failed to create device')

      sendValidated(reply, registerDeviceOutputSchema, { device: serializeDevice(row) }, 201)
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // GET /devices — list active (non-revoked) devices for the authenticated user.
  app.get('/devices', { preHandler: [requireAuth, requireVerifiedEmail] }, async (req, reply) => {
    try {
      const userId = authedUser(req).userId
      const rows = await db
        .select({
          id: devices.id,
          name: devices.name,
          platform: devices.platform,
          registeredAt: devices.registeredAt,
          lastSeenAt: devices.lastSeenAt,
          revokedAt: devices.revokedAt,
        })
        .from(devices)
        .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)))

      sendValidated(reply, listDevicesOutputSchema, { devices: rows.map(serializeDevice) })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // DELETE /devices/:id — soft-revoke a device. Must belong to the calling user.
  app.delete(
    '/devices/:id',
    { preHandler: [requireAuth, requireVerifiedEmail] },
    async (req, reply) => {
      try {
        const userId = authedUser(req).userId
        const { id } = req.params as { id: string }

        const updated = await db
          .update(devices)
          .set({ revokedAt: new Date() })
          .where(and(eq(devices.id, id), eq(devices.userId, userId), isNull(devices.revokedAt)))
          .returning({ id: devices.id })

        if (updated.length === 0) {
          // Either not found or already revoked or belongs to another user.
          throw new AppError(ERROR_CODES.NOT_FOUND, 'device not found')
        }

        sendValidated(reply, revokeDeviceOutputSchema, { revoked: true })
      } catch (err) {
        sendError(reply, toAppError(err))
      }
    },
  )
}

function serializeDevice(row: {
  id: string
  name: string
  platform: string | null
  registeredAt: Date
  lastSeenAt: Date | null
  revokedAt: Date | null
}) {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    registered_at: row.registeredAt.toISOString(),
    last_seen_at: row.lastSeenAt?.toISOString() ?? null,
    revoked_at: row.revokedAt?.toISOString() ?? null,
  }
}
