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
