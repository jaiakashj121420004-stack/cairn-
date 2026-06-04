import { ERROR_CODES } from '@cairn/shared-types'
import { SignJWT, jwtVerify } from 'jose'
import { AppError } from '../lib/errors'
import type { Env } from '../env'
import type { AccessTokenClaims, Entitlement } from '@cairn/shared-types'

/**
 * Access tokens (CLAUDE.md §2.13).
 *
 * Short-lived HS256 JWTs (≤ 15 min). They carry the user id (`sub`), email-verified
 * status, and entitlement, so authorization decisions need no DB hit on the hot path.
 * Refresh tokens are NOT JWTs — they are opaque random strings (see `sessions.ts`),
 * so they can be revoked server-side, which a stateless JWT cannot be.
 */

const ALG = 'HS256'

function secretKey(env: Pick<Env, 'JWT_SECRET'>): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET)
}

/** Sign an access token for the given claims. Returns the compact JWT string. */
export async function signAccessToken(
  claims: AccessTokenClaims,
  env: Pick<Env, 'JWT_SECRET' | 'JWT_ISSUER' | 'JWT_AUDIENCE' | 'ACCESS_TOKEN_TTL_SECONDS'>,
): Promise<string> {
  return new SignJWT({
    emailVerified: claims.emailVerified,
    entitlement: claims.entitlement,
  })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey(env))
}

const ENTITLEMENTS: readonly Entitlement[] = ['free', 'trial', 'pro']

function isEntitlement(value: unknown): value is Entitlement {
  return typeof value === 'string' && (ENTITLEMENTS as readonly string[]).includes(value)
}

/**
 * Verify and decode an access token. Throws `AppError(UNAUTHENTICATED)` on any
 * failure (bad signature, expiry, wrong issuer/audience, malformed claims) — never
 * leaking which check failed.
 */
export async function verifyAccessToken(
  token: string,
  env: Pick<Env, 'JWT_SECRET' | 'JWT_ISSUER' | 'JWT_AUDIENCE'>,
): Promise<AccessTokenClaims> {
  let payload
  try {
    ;({ payload } = await jwtVerify(token, secretKey(env), {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: [ALG],
    }))
  } catch {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'invalid or expired access token')
  }

  const { sub, emailVerified, entitlement } = payload
  if (
    typeof sub !== 'string' ||
    typeof emailVerified !== 'boolean' ||
    !isEntitlement(entitlement)
  ) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'malformed access token claims')
  }
  return { userId: sub, emailVerified, entitlement }
}
