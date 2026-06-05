/**
 * Auth DTOs shared across desktop, web, and server (CLAUDE.md §3.5–§3.7, §18.5).
 *
 * These describe the *shape* of auth responses. The matching input validators live
 * in `@cairn/shared-zod` so client and server validate against one definition
 * (CLAUDE.md §19.2). The server never returns secrets in these payloads — refresh
 * tokens travel only in the `__Host-refresh` cookie, never the JSON body.
 */

/** A user's billing entitlement, embedded in the access token (CLAUDE.md §2.14). */
export type Entitlement = 'free' | 'trial' | 'pro'

/** The verified claims carried by an access JWT (HS256). */
export interface AccessTokenClaims {
  /** The user id (JWT `sub`). */
  readonly userId: string
  /** Whether the user's email is verified at issue time. */
  readonly emailVerified: boolean
  /** The user's entitlement at issue time. */
  readonly entitlement: Entitlement
}

/** Result of a successful signup. Contains no secret and never leaks account existence. */
export interface SignupResult {
  readonly userId: string
}

/** Result of a successful login / magic-link / refresh. */
export interface AuthSession {
  /** Short-lived access JWT (≤ 15 min). Sent in the `Authorization: Bearer` header. */
  readonly accessToken: string
  /** Seconds until the access token expires. */
  readonly expiresIn: number
  /** Echo of the authenticated user's claims for convenience. */
  readonly user: AccessTokenClaims
}

/**
 * Renderer-/web-safe snapshot of the desktop session (CLAUDE.md §18.5). Crosses the
 * IPC/HTTP boundary, so it carries identity and status only — never the access or
 * refresh token, which stay in the main process / `__Host-` cookie.
 */
export interface PublicSession {
  readonly userId: string
  readonly email: string
  readonly emailVerified: boolean
  readonly entitlement: Entitlement
  /** True once a vault data key is loaded (Stage 3); false = signed in, vault locked. */
  readonly vaultUnlocked: boolean
}
