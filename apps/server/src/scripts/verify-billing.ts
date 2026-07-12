/**
 * Post-deploy billing smoke test (`pnpm --filter @cairn/server verify:billing <api-url>`).
 *
 * Confirms the live API is up and the billing surface is wired correctly — WITHOUT needing
 * any credentials or secrets, so it's safe to run against production from anywhere:
 *   1. GET  /health              → 200 (the API is up)
 *   2. POST /webhooks/dodo        → 400 (rejects an unsigned/badly-signed delivery, §2.13)
 *                                    or 501 if Dodo isn't configured on that deployment
 *   3. GET  /billing/status       → 401 (the billing surface requires auth — gating works)
 *
 * Target URL from the first CLI arg or CAIRN_VERIFY_URL. Exit 0 = all pass, 1 = any fail.
 */

const target = process.argv[2] ?? process.env.CAIRN_VERIFY_URL
if (!target) {
  process.stderr.write('Usage: verify:billing <api-base-url>  (or set CAIRN_VERIFY_URL)\n')
  process.exit(1)
}
const base = target.replace(/\/$/, '')

interface Probe {
  readonly name: string
  readonly ok: boolean
  readonly detail: string
}

async function status(method: 'GET' | 'POST', path: string, body?: string): Promise<number> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body }),
  })
  return res.status
}

async function main(): Promise<void> {
  const probes: Probe[] = []

  try {
    const health = await status('GET', '/health')
    probes.push({
      name: 'GET /health',
      ok: health === 200,
      detail: `HTTP ${String(health)} (want 200)`,
    })
  } catch (err) {
    probes.push({
      name: 'GET /health',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    // Deliberately unsigned: the receiver must reject it (400) or report Dodo-not-configured
    // (501). A 200 here would mean signature verification is not enforced — a hard fail.
    const code = await status('POST', '/webhooks/dodo', JSON.stringify({ type: 'ping' }))
    probes.push({
      name: 'POST /webhooks/dodo (unsigned)',
      ok: code === 400 || code === 501,
      detail: `HTTP ${String(code)} (want 400 rejected, or 501 not-configured)`,
    })
  } catch (err) {
    probes.push({
      name: 'POST /webhooks/dodo (unsigned)',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    const code = await status('GET', '/billing/status')
    probes.push({
      name: 'GET /billing/status (no auth)',
      ok: code === 401,
      detail: `HTTP ${String(code)} (want 401 — auth required)`,
    })
  } catch (err) {
    probes.push({
      name: 'GET /billing/status (no auth)',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  process.stdout.write(`\nBilling smoke test — ${base}\n────────────────────────────\n`)
  for (const p of probes) {
    process.stdout.write(`  ${p.ok ? '✓' : '✗'} ${p.name}: ${p.detail}\n`)
  }
  const failed = probes.filter((p) => !p.ok)
  process.stdout.write(
    `\n${String(probes.length - failed.length)}/${String(probes.length)} passed.\n`,
  )
  if (failed.length > 0) {
    process.exit(1)
  }
}

void main()
