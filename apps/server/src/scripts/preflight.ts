import { createBillingProviders } from '../billing/registry'
import { createDb } from '../db/client'
import { loadEnv } from '../env'
import type { Env } from '../env'

/**
 * Production preflight doctor (`pnpm --filter @cairn/server preflight`).
 *
 * Validates that the environment is coherently configured BEFORE you deploy or point real
 * traffic at the API — so a half-wired production never boots silently wrong. It reuses the
 * exact same `loadEnv` + `createBillingProviders` the server uses, then adds go-live checks
 * (HTTPS, secure cookies, a billing provider, admin token for the sweep cron, DB reachable).
 *
 * Exit code 0 = all hard checks pass; 1 = at least one error. Warnings never fail the run.
 * Run it locally against a `.env`, or in CI/host with the production secrets exported.
 */

type Severity = 'error' | 'warn' | 'ok'
interface Check {
  readonly name: string
  readonly severity: Severity
  readonly detail: string
}

const ICON: Record<Severity, string> = { ok: '✓', warn: '⚠', error: '✗' }

async function checkDbReachable(env: Env): Promise<Check> {
  const name = 'Database reachable'
  const handle = createDb(env.DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    await handle.sql`select 1`
    return { name, severity: 'ok', detail: 'connected + round-tripped a query' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { name, severity: 'error', detail: `cannot connect: ${msg}` }
  } finally {
    await handle.close()
  }
}

function staticChecks(env: Env): Check[] {
  const isProd = env.NODE_ENV === 'production'
  const checks: Check[] = []

  checks.push(
    isProd
      ? { name: 'NODE_ENV', severity: 'ok', detail: 'production' }
      : {
          name: 'NODE_ENV',
          severity: 'warn',
          detail: `${env.NODE_ENV} (expected production for a go-live preflight)`,
        },
  )

  const httpsOk = env.APP_URL.startsWith('https://')
  checks.push({
    name: 'APP_URL is HTTPS',
    severity: httpsOk ? 'ok' : isProd ? 'error' : 'warn',
    detail: env.APP_URL,
  })

  const cookieSecure = env.COOKIE_SECURE ?? isProd
  checks.push({
    name: 'Secure refresh cookie',
    severity: cookieSecure ? 'ok' : isProd ? 'error' : 'warn',
    detail: cookieSecure
      ? 'COOKIE_SECURE on'
      : 'COOKIE_SECURE off (refresh cookie sent over plain HTTP)',
  })

  const providers = createBillingProviders(env)
  const active = Object.keys(providers)
  checks.push({
    name: 'Billing provider configured',
    severity: active.length > 0 ? 'ok' : 'error',
    detail:
      active.length > 0
        ? `active: ${active.join(', ')}`
        : 'no billing provider has all its secrets set',
  })
  if (active.length > 0 && !providers.dodo) {
    checks.push({
      name: 'Default gateway (Dodo)',
      severity: 'warn',
      detail: 'Dodo not configured — falling back to Stripe/Razorpay country routing',
    })
  }

  checks.push({
    name: 'Admin token (grace-sweep cron)',
    severity: env.ADMIN_TOKEN ? 'ok' : 'warn',
    detail: env.ADMIN_TOKEN
      ? 'set'
      : 'ADMIN_TOKEN unset — /admin/billing/sweep + audit-log return 404',
  })

  const emailOk = env.EMAIL_PROVIDER === 'resend'
  checks.push({
    name: 'Transactional email',
    severity: emailOk ? 'ok' : isProd ? 'error' : 'warn',
    detail: emailOk
      ? 'resend'
      : `${env.EMAIL_PROVIDER} (production needs EMAIL_PROVIDER=resend + RESEND_API_KEY)`,
  })

  checks.push({
    name: 'Server error tracking',
    severity: env.SENTRY_DSN ? 'ok' : 'warn',
    detail: env.SENTRY_DSN ? 'Sentry DSN set' : 'SENTRY_DSN unset — no server error reporting',
  })

  return checks
}

async function main(): Promise<void> {
  let env: Env
  try {
    env = loadEnv()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`✗ Environment failed to load:\n${msg}\n`)
    process.exit(1)
    return
  }

  const checks = [...staticChecks(env), await checkDbReachable(env)]
  process.stdout.write('\nCairn server preflight\n──────────────────────\n')
  for (const c of checks) {
    process.stdout.write(`  ${ICON[c.severity]} ${c.name}: ${c.detail}\n`)
  }

  const errors = checks.filter((c) => c.severity === 'error')
  const warns = checks.filter((c) => c.severity === 'warn')
  process.stdout.write(`\n${errors.length} error(s), ${warns.length} warning(s).\n`)
  if (errors.length > 0) {
    process.stdout.write('Preflight FAILED — fix the ✗ items before deploying.\n')
    process.exit(1)
  }
  process.stdout.write('Preflight PASSED.\n')
}

void main()
