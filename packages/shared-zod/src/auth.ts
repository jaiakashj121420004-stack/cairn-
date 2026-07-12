import { z } from 'zod'

/**
 * Input validators for the auth surface (CLAUDE.md §18.5, §19.2).
 *
 * One definition, reused at the HTTP boundary on the server and by clients before
 * they send. Every field is constrained — length, format, trimming — so handlers
 * never receive unbounded or malformed input.
 */

/**
 * Email validator. Lower-cased and trimmed so that lookups and the per-identifier
 * rate-limit key are canonical (`A@X.com` and `a@x.com ` collapse to the same key).
 * Bounded length defends against pathological inputs and oversized index keys.
 */
export const emailSchema = z.string().trim().toLowerCase().min(3).max(254).email()

/**
 * Password validator. Lower bound per common guidance (NIST 800-63B: ≥ 8); upper
 * bound caps the cost of the pre-hash HMAC and avoids Argon2id DoS via huge inputs.
 * No composition rules — length is what matters.
 */
export const passwordSchema = z.string().min(8).max(200)

/** An opaque single-use token delivered by email (verify, magic link). Hex string. */
export const opaqueTokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(512)
  .regex(/^[a-f0-9]+$/, 'token must be lowercase hex')

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})
export type SignupInput = z.infer<typeof signupSchema>

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})
export type LoginInput = z.infer<typeof loginSchema>

export const verifyEmailSchema = z.object({
  token: opaqueTokenSchema,
})
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>

export const magicRequestSchema = z.object({
  email: emailSchema,
})
export type MagicRequestInput = z.infer<typeof magicRequestSchema>

export const magicConsumeSchema = z.object({
  token: opaqueTokenSchema,
})
export type MagicConsumeInput = z.infer<typeof magicConsumeSchema>

/**
 * Forgot-password request — emails a single-use reset token if the account exists.
 * The response is always `{ sent: true }` (no account-existence leak), so the schema
 * intentionally carries only the email.
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

/** Always-200 response to a forgot-password request (no enumeration). */
export const forgotPasswordOutputSchema = z.object({
  sent: z.literal(true),
})
export type ForgotPasswordOutput = z.infer<typeof forgotPasswordOutputSchema>

/**
 * Reset-password request — consume the emailed reset token and set a new password.
 *
 * In Cairn's E2E model this resets only the *account* password; it cannot recover the
 * vault, whose data key is wrapped under the old password KEK. After a reset the user
 * unlocks the vault via the recovery-phrase flow, which re-wraps and re-uploads the key.
 */
export const resetPasswordSchema = z.object({
  token: opaqueTokenSchema,
  password: passwordSchema,
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

/** Reset-password acknowledgement. */
export const resetPasswordOutputSchema = z.object({
  reset: z.literal(true),
})
export type ResetPasswordOutput = z.infer<typeof resetPasswordOutputSchema>

/**
 * GET /auth/me — the current session's identity + entitlement. Used to rehydrate the web
 * client on page load after a refresh mints a fresh access token (the refresh alone returns
 * no claims). Carries no secret.
 */
export const meOutputSchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  entitlement: z.enum(['free', 'trial', 'pro']),
})
export type MeOutput = z.infer<typeof meOutputSchema>
