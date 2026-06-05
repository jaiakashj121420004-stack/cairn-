import { registerAdminRoutes } from '../admin/routes'
import { registerAuthRoutes } from '../auth/routes'
import { registerBillingRoutes } from '../billing/routes'
import { registerDeviceRoutes } from '../devices/routes'
import { registerDocsRoutes } from '../docs/routes'
import { sendOk } from '../lib/http'
import { registerVaultRoutes } from '../vault/routes'
import { registerWebhookRoutes } from '../webhooks/routes'
import type { AuthService } from '../auth/service'
import type { BillingProviders } from '../billing/provider'
import type { Db } from '../db/client'
import type { Env } from '../env'
import type { RateLimiter } from '../lib/rate-limit'
import type { FastifyInstance } from 'fastify'

/**
 * Central route registration (CLAUDE.md §3.5). One place lists every HTTP surface,
 * mirroring the desktop's `electron/ipc/index.ts` handler map.
 */
export interface RouteDeps {
  readonly authService: AuthService
  readonly env: Env
  readonly limiter: RateLimiter
  readonly db: Db
  readonly billingProviders: BillingProviders
}

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  // Liveness — no auth, no rate limit.
  app.get('/health', (_req, reply) => {
    sendOk(reply, { status: 'ok' })
  })

  // API docs: OpenAPI spec + Scalar UI (gated by ENABLE_API_DOCS, default on).
  registerDocsRoutes(app, { enabled: deps.env.ENABLE_API_DOCS })

  registerAuthRoutes(app, { authService: deps.authService, env: deps.env, limiter: deps.limiter })
  registerDeviceRoutes(app, { db: deps.db, env: deps.env })
  registerVaultRoutes(app, { db: deps.db, env: deps.env })
  registerWebhookRoutes(app, { db: deps.d