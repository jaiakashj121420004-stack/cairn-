import { z } from 'zod'

/**
 * Environment configuration (CLAUDE.md §19.8).
 *
 * Read once at boot, validated with Zod, and frozen. The process refuses to start
 * if anything required is missing or malformed — we never limp along on a half-set
 * config. Secrets (pepper, JWT secret, DB url, email key) live only here; they are
 * never logged (see `logger.ts` redaction) and never returned to clients.
 */

/** Parse a comma-separated env list into a trimmed, non-empty string array. */
const csv = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  )
  .pipe(z.array(z.string()))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  /** Postgres connection string. Required in every environment. */
  DATABASE_URL: z.string().url(),

  /**
   * Server-side pepper HMAC-ed into every password before Argon2id (CLAUDE.md §2.13).
   * A leaked database is useless without this. Must be long and high-entropy.
   */
  PASSWORD_PEPPER: z.string().min(32),

  /** HS256 signing secret for access tokens. Must be high-entropy (≥ 32 bytes). */
  JWT_SECRET: z.string().min(32),
  /** JWT issuer / audience claims. */
  JWT_ISSUER: z.string().default('cairn'),
  JWT_AUDIENCE: z.string().default('cairn-client'),

  /** Access-token lifetime in seconds. Capped at 15 min per CLAUDE.md §2.13. */
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(900).default(900),
  /** Refresh-token lifetime in days. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(90).default(30),

  /** Allowed CORS origins (browser web app). Empty = no cross-origin browser access. */
  CORS_ORIGINS: csv.default(''),

  /** Public base URL used to build verify / magic-link emails. */
  APP_URL: z.string().url().default('http://localhost:5173'),

  /** Email transport. `memory` captures messages in-process (tests only). */
  EMAIL_PROVIDER: z.enum(['console', 'resend', 'memory']).default('console'),
  EMAIL_FROM: z.string().default('Cairn <no-reply@cairn.app>'),
  /** Required only when EMAIL_PROVIDER=resend (validated in the provider factory). */
  RESEND_API_KEY: z.string().optional(),

  /** Max JSON request body size in bytes (default routes). Vault push uses its own 5 MB limit. */
  BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(64 * 1024),

  /**
   * Serve the OpenAPI spec (`/openapi.json`) and the Scalar API reference UI (`/docs`).
   * The docs describe only the public HTTP contract — no secrets, no user content — so
   * they default on in every environment. Set to `false` to hide them entirely (the
   * routes then 404, revealing nothing).
   */
  ENABLE_API_DOCS: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('true'),

  // ── Billing ──────────────────────────────────────────────────────────────────────────
  /** Stripe secret API key. Required to enable Stripe billing + webhooks. */
  STRIPE_SECRET_KEY: z.string().optional(),
  /** Stripe webhook signing secret (whsec_…). Required to verify Stripe webhook signatures. */
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Stripe recurring price id (price_…) for the Pro plan. Required for Stripe checkout. */
  STRIPE_PRICE_ID: z.string().optional(),
  /** Razorpay API key id. Required (with the secret) to enable Razorpay billing. */
  RAZORPAY_KEY_ID: z.string().optional(),
  /** Razorpay API key secret. Pairs with RAZORPAY_KEY_ID for REST Basic auth. */
  RAZORPAY_KEY_SECRET: z.string().optional(),
  /** Razorpay plan id for the Pro subscription. Required for Razorpay checkout. */
  RAZORPAY_PLAN_ID: z.string().optional(),
  /** Razorpay webhook secret for HMAC-SHA256 signature verification. */
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  /** Where the provider redirects after a successful checkout. Defaults under APP_URL. */
  BILLING_SUCCESS_URL: z.string().url().optional(),
  /** Where the provider redirects when checkout is abandoned. Defaults under APP_URL. */
  BILLING_CANCEL_URL: z.string().url().optional(),
  /** Where the customer portal returns to. Defaults under APP_URL. */
  BILLING_PORTAL_RETURN_URL: z.string().url().optional(),
  /** Where a 402 (cloud-sync gated) response sends the user. Defaults to APP_URL/pricing. */
  BILLING_UPGRADE_URL: z.string().url().optional(),
  /** Stripe annual recurring price id. Optional; checkout falls back to the monthly price. */
  STRIPE_PRICE_ID_ANNUAL: z.string().optional(),
  /** Razorpay annual plan id. Optional; checkout falls back to the monthly plan. */
  RAZORPAY_PLAN_ID_ANNUAL: z.string().optional(),

  // ── Admin ─────────────────────────────────────────────────────────────────────────────
  /**
   * Bearer token protecting GET /admin/audit-log. Must be ≥ 32 chars.
   * If absent the endpoint returns 404 (does not reveal its existence).
   */
  ADMIN_TOKEN: z.string().min(32).optional(),

  /** Whether the refresh cookie requires Secure. Auto-off for http:// dev/test. */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

/** The validated, immutable environment shape. */
export type Env = Readonly<z.infer<typeof envSchema>>

let cached: Env | null = null

/**
 * Load and validate the environment exactly once. Subsequent calls return the
 * cached value. Throws a readable aggregate error if validation fails — the
 * process should not continue with bad config.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  if (parsed.data.EMAIL_PROVIDER === 'resend' && !parsed.data.RESEND_API_KEY) {
    throw new Error(
      'Invalid environment configuration:\n  - RESEND_API_KEY: required when EMAIL_PROVIDER=resend',
    )
  }
  cached = Object.freeze(parsed.data)
  return cached
}

/** Test-only: drop the cached env so a test can rebuild with fresh values. */
export function resetEnvCache(): void {
  cached = null
}
