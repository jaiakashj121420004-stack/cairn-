import { randomUUID } from 'node:crypto'
import { ERROR_CODES } from '@cairn/shared-types'
import { and, eq, isNull } from 'drizzle-orm'
import { userSessions } from '../db/schema'
import { appendAudit } from '../lib/audit'
import { generateOpaqueToken, sha256Hex } from '../lib/crypto-random'
import { AppError } from '../lib/errors'
import type { Db, DbExecutor } from '../db/client'

/**
 * Refresh-token sessions with rotation + reuse detection (CLAUDE.md §2.13).
 *
 * A refresh token is an opaque 32-byte random string; only its SHA-256 is stored.
 * Each token belongs to a *family*. Refreshing rotates the token: a new session row
 * is created in the same family and the old row is marked `replaced_by`. Presenting
 * a token that has already been replaced (or revoked) means a leaked token is being
 * replayed — we revoke the entire family and log a `critical` audit row, forcing a
 * fresh login. This turns token theft into a detectable, self-limiting event.
 */

export interface IssuedRefresh {
  /** The raw token to place in the cookie. Never stored or logged. */
  readonly rawToken: string
  readonly sessionId: string
  readonly familyId: string
  readonly expiresAt: Date
}

export interface RefreshContext {
  readonly userAgent?: string | undefined
  readonly ip?: string | undefined
  readonly ttlDays: number
}

function expiryFrom(ttlDays: number): Date {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
}

/**
 * Issue a brand-new refresh session, optionally within an existing family (used by
 * rotation). Omitting `familyId` starts a new family (login / magic link).
 */
export async function issueRefreshSession(
  db: DbExecutor,
  userId: string,
  ctx: RefreshContext,
  familyId: string = randomUUID(),
): Promise<IssuedRefresh> {
  const rawToken = generateOpaqueToken(32)
  const expiresAt = expiryFrom(ctx.ttlDays)
  const rows = await db
    .insert(userSessions)
    .values({
      userId,
      familyId,
      refreshHash: sha256Hex(rawToken),
      expiresAt,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    })
    .returning({ id: userSessions.id })
  const inserted = rows[0]
  if (!inserted) throw new AppError(ERROR_CODES.INTERNAL, 'failed to create session')
  return { rawToken, sessionId: inserted.id, familyId, expiresAt }
}

/** Revoke every non-revoked session in a family. Returns the number revoked. */
export async function revokeFamily(db: DbExecutor, familyId: string): Promise<number> {
  const revoked = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.familyId, familyId), isNull(userSessions.revokedAt)))
    .returning({ id: userSessions.id })
  return revoked.length
}

export interface RotateResult {
  readonly userId: string
  readonly issued: IssuedRefresh
}

/**
 * Validate a presented refresh token and rotate it. On success returns the user id
 * and a freshly issued refresh token (same family). On reuse, revokes the family,
 * writes a `critical` audit row, and throws `INVALID_TOKEN`. On any other invalid
 * state (unknown / revoked / expired) throws `INVALID_TOKEN`.
 */
export async function rotateRefreshSession(
  db: Db,
  rawToken: string,
  ctx: RefreshContext,
): Promise<RotateResult> {
  const hash = sha256Hex(rawToken)
  const found = await db
    .select()
    .from(userSessions)
    .where(eq(userSessions.refreshHash, hash))
    .limit(1)
  const session = found[0]

  if (!session) {
    // Unknown token. Could be random noise or a token from an already-purged family.
    throw new AppError(ERROR_CODES.INVALID_TOKEN, 'invalid refresh token')
  }

  // --- Reuse detection: a token that was already rotated or revoked is being replayed.
  if (session.replacedBy !== null || session.revokedAt !== null) {
    await revokeFamily(db, session.familyId)
    await appendAudit(db, {
      event: 'refresh_token_reuse',
      severity: 'critical',
      userId: session.userId,
      ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
      detail: { familyId: session.familyId, sessionId: session.id },
    })
    throw new AppError(ERROR_CODES.INVALID_TOKEN, 'refresh token reuse detected; session revoked')
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    throw new AppError(ERROR_CODES.INVALID_TOKEN, 'refresh token expired')
  }

  // --- Valid: rotate inside a transaction so the new row and the old row's
  // replaced_by pointer commit atomically.
  return db.transaction(async (tx) => {
    const issued = await issueRefreshSession(tx, session.userId, ctx, session.familyId)
    await tx
      .update(userSessions)
      .set({ replacedBy: issued.sessionId })
      .where(eq(userSessions.id, session.id))
    return { userId: session.userId, issued }
  })
}

/**
 * Revoke the family that a presented refresh token belongs to (logout). Unknown
 * tokens are ignored — logout is best-effort and must never error the client out.
 */
export async function revokeSessionByToken(db: Db, rawToken: string): Promise<void> {
  const hash = sha256Hex(rawToken)
  const found = await db
    .select({ familyId: userSessions.familyId })
    .from(userSessions)
    .where(eq(userSessions.refreshHash, hash))
    .limit(1)
  const session = found[0]
  if (!session) return
  await revokeFamily(db, session.familyId)
}
