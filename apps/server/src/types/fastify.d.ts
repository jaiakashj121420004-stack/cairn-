import type { RateLimitStore } from '../lib/rate-limit'
import type { AccessTokenClaims } from '@cairn/shared-types'

/**
 * Fastify type augmentation (CLAUDE.md §3.5). `requireAuth` attaches the verified
 * access-token claims to the request; downstream handlers read `req.user`.
 */
declare module 'fastify' {
  interface FastifyRequest {
    /** Verified caller, populated by the `requireAuth` preHandler. Null until then. */
    user: AccessTokenClaims | null
  }
  interface FastifyInstance {
    /** The rate-limit store, exposed so integration tests can reset it between cases. */
    rateLimitStore: RateLimitStore
  }
}
