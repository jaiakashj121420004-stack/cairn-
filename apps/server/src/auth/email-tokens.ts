import { ERROR_CODES } from '@cairn/shared-types'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { emailTokens } from '../db/schema'
import { generateOpaqueToken, sha256Hex } from '../lib/crypto-random'
import { AppError } from '../lib/errors'
import type { Db } from '../db/client'
import type { EmailTokenType } from '../db/schema'

/**
 * Single-use, hashed, expiring email tokens (CLAUDE.md §18.5).
 *
 * Used for email verification (24 h) and magic-link login (15 min). The raw token
 * goes in the email; only its SHA-256 is stored. Consumption is a single atomic
 * conditional UPDATE, so a token cannot be redeemed twice even under a race.
 */

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
export const MAGIC_TOKEN_TTL_MS = 15 * 60 * 1000

/** Mint a new token of `type` for `userId`. Returns the raw token to email. */
export async function createEmailToken(
  db: Db,
  userId: string,
  type: EmailTokenType,
  ttlMs: number,
): Promise<string> {
  const rawToken = generateOpaqueToken(32)
  await db.insert(emailTokens).values({
    userId,
    type,
    tokenHash: sha256Hex(rawToken),
    expiresAt: new Date(Date.now() + ttlMs),
  })
  return rawToken
}

/**
 * Atomically consume a token: marks it used only if it exists, matches `type`, is
 * unconsumed, and unexpired — in one UPDATE…RETURNING. Returns the owning user id.
 * Throws `INVALID_TOKEN` for every failure mode (unknown / wrong type / consumed /
 * expired), never revealing which.
 */
export async function consumeEmailToken(
  db: Db,
  type: EmailTokenType,
  rawToken: string,
): Promise<string> {
  const hash = sha256Hex(rawToken)
  const rows = await db
    .update(emailTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(emailTokens.tokenHash, hash),
        eq(emailTokens.type, type),
        isNull(emailTokens.consumedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: emailTokens.userId })
  const row = rows[0]
  if (!row) throw new AppError(ERROR_CODES.INVALID_TOKEN, 'invalid, expired, or already-used token')
  return row.userId
}
