import { loadEnv } from '../env'

/**
 * Dodo Payments setup helper (`pnpm --filter @cairn/server dodo:setup`).
 *
 * Turns "click around the Dodo dashboard hunting for product ids" into one command. Given a
 * `DODO_API_KEY` (and `DODO_ENVIRONMENT=test|live`), it validates the key, lists your
 * subscription products, and prints a paste-ready `.env` block with the monthly + annual Pro
 * `product_id`s it can identify. It never creates or mutates anything — it only reads — so
 * it is safe to run repeatedly. If it can't confidently match the two Pro products, it lists
 * everything it found and tells you exactly what to create ($15/mo + $150/yr subscription
 * products) and re-run.
 */

const API_BASE = {
  test: 'https://test.dodopayments.com',
  live: 'https://live.dodopayments.com',
} as const

interface DodoProduct {
  readonly id: string
  readonly name: string
  readonly recurring: boolean
  readonly interval: string | null
}

/** First non-empty string among the candidates, else null. Keeps schema-guessing readable. */
function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

/** Pull an id/name/interval out of a product record without assuming an exact schema. */
function normalizeProduct(raw: unknown): DodoProduct | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const id = firstString(r['product_id'], r['id'])
  if (id === null) return null
  const name = firstString(r['name']) ?? '(unnamed)'
  const price = (typeof r['price'] === 'object' && r['price'] !== null ? r['price'] : {}) as Record<
    string,
    unknown
  >
  const interval = firstString(
    r['payment_frequency_interval'],
    price['payment_frequency_interval'],
    r['recurring_interval'],
  )
  const recurring =
    interval !== null || r['is_recurring'] === true || price['type'] === 'recurring_price'
  return { id, name, recurring, interval }
}

/** Best-effort: find a product array in whatever envelope the list endpoint returns. */
function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (typeof payload === 'object' && payload !== null) {
    const p = payload as Record<string, unknown>
    for (const key of ['items', 'data', 'products']) {
      if (Array.isArray(p[key])) return p[key] as unknown[]
    }
  }
  return []
}

function looksAnnual(p: DodoProduct): boolean {
  return /year|annual|annually/i.test(p.name) || (p.interval !== null && /year/i.test(p.interval))
}
function looksMonthly(p: DodoProduct): boolean {
  return /month/i.test(p.name) || (p.interval !== null && /month/i.test(p.interval))
}

async function main(): Promise<void> {
  const env = loadEnv()
  if (!env.DODO_API_KEY) {
    process.stderr.write(
      '✗ DODO_API_KEY is not set. Export it (from the Dodo dashboard) and re-run.\n',
    )
    process.exit(1)
    return
  }
  const base = API_BASE[env.DODO_ENVIRONMENT]
  process.stdout.write(`\nDodo setup — ${env.DODO_ENVIRONMENT} mode (${base})\n`)

  const res = await fetch(`${base}/products`, {
    headers: { authorization: `Bearer ${env.DODO_API_KEY}`, 'content-type': 'application/json' },
  })
  if (res.status === 401 || res.status === 403) {
    process.stderr.write(
      '✗ Dodo rejected the API key (401/403). Check DODO_API_KEY and DODO_ENVIRONMENT.\n',
    )
    process.exit(1)
    return
  }
  if (!res.ok) {
    process.stderr.write(`✗ Dodo /products returned HTTP ${String(res.status)}.\n`)
    process.exit(1)
    return
  }

  const payload: unknown = await res.json()
  const products = extractList(payload)
    .map(normalizeProduct)
    .filter((p): p is DodoProduct => p !== null)
  const subs = products.filter((p) => p.recurring)

  process.stdout.write(
    `\nFound ${String(products.length)} product(s), ${String(subs.length)} recurring:\n`,
  )
  for (const p of products) {
    const kind = p.recurring ? `recurring${p.interval ? ` (${p.interval})` : ''}` : 'one-time'
    process.stdout.write(`  • ${p.id}  —  ${p.name}  [${kind}]\n`)
  }

  const monthly = subs.find(looksMonthly) ?? null
  const annual = subs.find(looksAnnual) ?? null

  process.stdout.write('\n── Paste into your production env ──\n')
  process.stdout.write(`DODO_PRODUCT_ID=${monthly ? monthly.id : '<monthly Pro product_id>'}\n`)
  process.stdout.write(`DODO_PRODUCT_ID_ANNUAL=${annual ? annual.id : '<annual Pro product_id>'}\n`)

  if (!monthly || !annual) {
    process.stdout.write(
      '\n⚠ Could not confidently identify both Pro products. In the Dodo dashboard create two\n' +
        '  SUBSCRIPTION products — "Cairn Pro (Monthly)" at $15/mo and "Cairn Pro (Annual)" at\n' +
        '  $150/yr (India GST-inclusive equivalents ₹1,299 / ₹12,990) — then re-run this command.\n',
    )
    process.exit(2)
    return
  }
  process.stdout.write(
    '\n✓ Both Pro products identified. Copy the two lines above into your server env.\n',
  )
}

void main()
