import { randomUUID } from 'node:crypto'
import { ERROR_CODES } from '@cairn/shared-types'
import { eq } from 'drizzle-orm'
import { users, userCredentials } from '../db/schema'
import { AppError } from '../lib/errors'
import {
  createEmailToken,
  consumeEmailToken,
  MAGIC_TOKEN_TTL_MS,
  VERIFY_TOKEN_TTL_MS,
} from './email-tokens'
import { resolveEntitlement } from './entitlement'
import { dummyVerify, hashPassword, verifyPassword } from './password'
import { issueRefreshSession, revokeSessionByToken, rotateRefreshSession } from './sessions'
import { signAccessToken } from './tokens'
import type { Db } from '../db/client'
import type { EmailProvider } from '../email'
import type { Env } from '../env'
import type { AppLogger } from '../logger'
import type { AuthSession, SignupResult } from '@cairn/shared-types'
import type { LoginInput, SignupInput } from '@cairn/shared-zod'

/**
 * Auth orchestration (CLAUDE.md §18.5).
 *
 * Composes the auth primitives (password, tokens, sessions, email tokens,
 * entitlement) into the operations the routes expose. Two invariants run through it:
 *  - No account-existence leak. Signup, login, and magic-request return identical
 *    shapes and spend comparable time whether or not the account exists.
 *  - The raw refresh token never appears in a response body — the service returns it
 *    to the route, which places it in the `__Host-refresh` cookie and nowhere else.
 */

/** Per-request context threaded into session creation for the audit trail. */
export interface RequestContext {
  readonly ip?: string | undefined
  readonly userAgent?: string | undefined
}

/** A successful authentication: the API session plus the raw refresh to set as a cookie. */
export interface AuthOutcome {
  readonly auth: AuthSession
  /** Raw refresh token — cookie only, never serialized into JSON. */
  readonly refreshToken: string
}

export interface AuthServiceDeps {
  readonly db: Db
  readonly env: Env
  readonly email: EmailProvider
  readonly logger: AppLogger
}

export class AuthService {
  private readonly db: Db
  private readonly env: Env
  private readonly email: EmailProvider
  private readonly logger: AppLogger

  constructor(deps: AuthServiceDeps) {
    this.db = deps.db
    this.env = deps.env
    this.email = deps.email
    this.logger = deps.logger
  }

  // ---------------------------------------------------------------------------
  // Signup + email verification
  // ---------------------------------------------------------------------------

  /**
   * Create an account and send a verification email. Returns a `userId`-shaped
   * payload regardless of whether the email was already registered — and spends an
   * Argon2id hash either way — so the response cannot be used to enumerate accounts.
   */
  async signup(input: SignupInput, _ctx: RequestContext): Promise<SignupResult> {
    const existing = await this.findUserByEmail(input.email)
    if (existing) {
      // Equalize timing with the real path, then send an "account exists" notice
      // (not a verify link). The response is indistinguishable from a fresh signup.
      await hashPassword(input.password, this.env.PASSWORD_PEPPER)
      await this.safeSend({
        to: input.email,
        subject: 'Your Cairn account',
        text: 'Someone tried to sign up with this email, but an account already exists. If this was you, just sign in. If you forgot your password, use the reset flow.',
      })
      return { userId: randomUUID() }
    }

    const passwordHash = await hashPassword(input.password, this.env.PASSWORD_PEPPER)
    let userId: string
    try {
      userId = await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(users)
          .values({ email: input.email })
          .returning({ id: users.id })
        const row = inserted[0]
        if (!row) throw new AppError(ERROR_CODES.INTERNAL, 'failed to create user')
        await tx.insert(userCredentials).values({ userId: row.id, passwordHash })
        return row.id
      })
    } catch (err) {
      // Lost the race against a concurrent signup with the same email → mask it.
      if (isUniqueViolation(err)) return { userId: randomUUID() }
      throw err
    }

    const token = await createEmailToken(this.db, userId, 'verify', VERIFY_TOKEN_TTL_MS)
    await this.safeSend(this.buildVerifyEmail(input.email, token))
    return { userId }
  }

  /** Consume a verification token and mark the user's email verified. */
  async verifyEmail(token: string): Promise<{ userId: string }> {
    const userId = await consumeEmailToken(this.db, 'verify', token)
    await this.db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
    return { userId }
  }

  // ---------------------------------------------------------------------------
  // Login + refresh + logout
  // ---------------------------------------------------------------------------

  /** Verify credentials and start a session. Indistinguishable failures on bad email vs bad password. */
  async login(input: LoginInput, ctx: RequestContext): Promise<AuthOutcome> {
    const user = await this.findUserByEmail(input.email)
    if (!user) {
      await dummyVerify(input.password, this.env.PASSWORD_PEPPER)
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'invalid email or password')
    }
    const cred = await this.findCredential(user.id)
    if (!cred) {
      await dummyVerify(input.password, this.env.PASSWORD_PEPPER)
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'invalid email or password')
    }
    const ok = await verifyPassword(cred.passwordHash, input.password, this.env.PASSWORD_PEPPER)
    if (!ok) throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'invalid email or password')

    return this.startSession(user.id, user.emailVerifiedAt !== null, ctx)
  }

  /** Rotate a refresh token and mint a fresh access token. Reuse detection lives in `rotateRefreshSession`. */
  async refresh(rawToken: string, ctx: RequestContext): Promise<AuthOutcome> {
    const { userId, issued } = await rotateRefreshSession(this.db, rawToken, {
      ttlDays: this.env.REFRESH_TOKEN_TTL_DAYS,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    })
    const user = await this.findUserById(userId)
    if (!user) throw new AppError(ERROR_CODES.INVALID_TOKEN, 'invalid refresh token')
    const auth = await this.buildSession(userId, user.emailVerifiedAt !== null)
    return { auth, refreshToken: issued.rawToken }
  }

  /** Best-effort logout: revoke the refresh family. Never errors the caller out. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return
    await revokeSessionByToken(this.db, rawToken)
  }

  // ---------------------------------------------------------------------------
  // Magic link
  // ---------------------------------------------------------------------------

  /** Email a single-use magic link if the account exists. Always resolves (no leak). */
  async magicRequest(email: string): Promise<void> {
    const user = await this.findUserByEmail(email)
    if (!user) return
    const token = await createEmailToken(this.db, user.id, 'magic', MAGIC_TOKEN_TTL_MS)
    await this.safeSend(this.buildMagicEmail(email, token))
  }

  /** Consume a magic token, mark email verified (proof of ownership), and start a session. */
  async magicConsume(token: string, ctx: RequestContext): Promise<AuthOutcome> {
    const userId = await consumeEmailToken(this.db, 'magic', token)
    const user = await this.findUserById(userId)
    if (!user) throw new AppError(ERROR_CODES.INVALID_TOKEN, 'invalid token')
    if (user.emailVerifiedAt === null) {
      await this.db
        .update(users)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId))
    }
    return this.startSession(userId, true, ctx)
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async startSession(
    userId: string,
    emailVerified: boolean,
    ctx: RequestContext,
  ): Promise<AuthOutcome> {
    const issued = await issueRefreshSession(this.db, userId, {
      ttlDays: this.env.REFRESH_TOKEN_TTL_DAYS,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    })
    const auth = await this.buildSession(userId, emailVerified)
    return { auth, refreshToken: issued.rawToken }
  }

  private async buildSession(userId: string, emailVerified: boolean): Promise<AuthSession> {
    const entitlement = await resolveEntitlement(this.db, userId)
    const claims = { userId, emailVerified, entitlement } as const
    const accessToken = await signAccessToken(claims, this.env)
    return { accessToken, expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS, user: claims }
  }

  private async findUserByEmail(
    email: string,
  ): Promise<{ id: string; emailVerifiedAt: Date | null } | undefined> {
    const rows = await this.db
      .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    return rows[0]
  }

  private async findUserById(
    id: string,
  ): Promise<{ id: string; emailVerifiedAt: Date | null } | undefined> {
    const rows = await this.db
      .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    return rows[0]
  }

  private async findCredential(userId: string): Promise<{ passwordHash: string } | undefined> {
    const rows = await this.db
      .select({ passwordHash: userCredentials.passwordHash })
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId))
      .limit(1)
    return rows[0]
  }

  /** Deliver an email, logging (without the link) but never failing the request on transport error. */
  private async safeSend(message: { to: string; subject: string; text: string }): Promise<void> {
    try {
      await this.email.send(message)
    } catch (err) {
      this.logger.error({ err, subject: message.subject }, 'email delivery failed')
    }
  }

  private buildVerifyEmail(
    to: string,
    token: string,
  ): { to: string; subject: string; text: string } {
    const link = `${this.env.APP_URL}/verify?token=${token}`
    return {
      to,
      subject: 'Verify your Cairn email',
      text: `Confirm your email to finish setting up Cairn:\n\n${link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`,
    }
  }

  private buildMagicEmail(
    to: string,
    token: string,
  ): { to: string; subject: string; text: string } {
    const link = `${this.env.APP_URL}/magic?token=${token}`
    return {
      to,
      subject: 'Your Cairn sign-in link',
      text: `Sign in to Cairn:\n\n${link}\n\nThis link expires in 15 minutes and can be used once.`,
    }
  }
}

/** Detect a Postgres unique-constraint violation (SQLSTATE 23505) from postgres.js. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  )
}
