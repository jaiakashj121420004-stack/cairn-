/**
 * Desktop billing HTTP client (CLAUDE.md §20, docs/billing.md). Talks to the Fastify
 * backend's `/billing/*` endpoints from the Electron *main* process, mirroring
 * {@link HttpVaultApi} / {@link AuthHttpClient}: Bearer access token in, server's
 * already-`Result`-shaped JSON straight back out, with a network failure mapped to a
 * synthetic error so the boundary never throws.
 *
 * The renderer never names a provider — it sends a country and the SERVER routes to the
 * gateway (§20.9). Responses are re-validated against the shared Zod schemas so a drifted
 * contract is a typed error, not a wrong render (§2.12). `fetch` is injected so unit tests
 * drive every path without a network or a real provider.
 */
import { err, ok } from '@cairn/shared-types'
import {
  billingStatusOutputSchema,
  cancelOutputSchema,
  checkoutInputSchema,
  checkoutOutputSchema,
  type BillingStatusOutput,
  type CancelOutput,
  type CheckoutInputBody,
  type CheckoutOutput,
} from '@cairn/shared-zod'
import type { Result } from '@cairn/shared-types'

export type BillingFetchLike = (
  input: string,
  init: {
    method: string
    headers: Record<string, string>
    body?: string
  },
) => Promise<{ status: number; text(): Promise<string> }>

const NETWORK_ERROR = 'NETWORK_ERROR'
const INTERNAL = 'INTERNAL'

export interface BillingHttpClientOptions {
  /** Base URL of the API, e.g. `https://api.cairn.app`. No trailing slash required. */
  readonly baseUrl: string
  /** Injected fetch implementation. Defaults to the global `fetch`. */
  readonly fetchImpl?: BillingFetchLike
}

/** The slice the IPC layer depends on (injectable for tests). */
export interface BillingClient {
  status(accessToken: string): Promise<Result<BillingStatusOutput>>
  checkout(input: CheckoutInputBody, accessToken: string): Promise<Result<CheckoutOutput>>
  portal(accessToken: string): Promise<Result<CheckoutOutput>>
  cancel(when: 'now' | 'period_end', accessToken: string): Promise<Result<CancelOutput>>
}

export class BillingHttpClient implements BillingClient {
  private readonly baseUrl: string
  private readonly fetchImpl: BillingFetchLike

  constructor(opts: BillingHttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as BillingFetchLike)
  }

  async status(accessToken: string): Promise<Result<BillingStatusOutput>> {
    const res = await this.request('GET', '/billing/status', undefined, accessToken)
    if (!res.ok) return res
    const parsed = billingStatusOutputSchema.safeParse(res.data)
    return parsed.success ? ok(parsed.data) : err(INTERNAL, 'malformed billing status')
  }

  async checkout(input: CheckoutInputBody, accessToken: string): Promise<Result<CheckoutOutput>> {
    // Re-validate/normalise (upper-cases the country) before it leaves the process.
    const validated = checkoutInputSchema.safeParse(input)
    if (!validated.success) return err('VALIDATION_ERROR', 'invalid checkout input')
    const res = await this.request('POST', '/billing/checkout', validated.data, accessToken)
    if (!res.ok) return res
    const parsed = checkoutOutputSchema.safeParse(res.data)
    return parsed.success ? ok(parsed.data) : err(INTERNAL, 'malformed checkout response')
  }

  async portal(accessToken: string): Promise<Result<CheckoutOutput>> {
    const res = await this.request('POST', '/billing/portal', {}, accessToken)
    if (!res.ok) return res
    const parsed = checkoutOutputSchema.safeParse(res.data)
    return parsed.success ? ok(parsed.data) : err(INTERNAL, 'malformed portal response')
  }

  async cancel(when: 'now' | 'period_end', accessToken: string): Promise<Result<CancelOutput>> {
    const res = await this.request('POST', '/billing/cancel', { when }, accessToken)
    if (!res.ok) return res
    const parsed = cancelOutputSchema.safeParse(res.data)
    return parsed.success ? ok(parsed.data) : err(INTERNAL, 'malformed cancel response')
  }

  /** Issue a request with Bearer auth and map the server `Result` envelope (or a net error). */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    accessToken: string,
  ): Promise<Result<T>> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    }
    if (body !== undefined) headers['content-type'] = 'application/json'

    let res: Awaited<ReturnType<BillingFetchLike>>
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
    } catch (e) {
      return err(NETWORK_ERROR, e instanceof Error ? e.message : String(e))
    }

    let parsed: unknown = null
    try {
      const text = await res.text()
      parsed = text.length > 0 ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
    return mapEnvelope<T>(parsed, res.status)
  }
}

/** Map the server's `Result<T>`-shaped JSON to a {@link Result}; derive a code from status otherwise. */
function mapEnvelope<T>(body: unknown, status: number): Result<T> {
  if (body !== null && typeof body === 'object' && 'ok' in body) {
    const r = body as { ok: unknown; data?: unknown; error?: unknown }
    if (r.ok === true) return ok(r.data as T)
    if (
      r.ok === false &&
      r.error !== null &&
      typeof r.error === 'object' &&
      'code' in r.error &&
      'message' in r.error
    ) {
      const e = r.error as { code: string; message: string; details?: unknown }
      return e.details === undefined ? err(e.code, e.message) : err(e.code, e.message, e.details)
    }
  }
  return err(INTERNAL, `unexpected billing response (status ${String(status)})`)
}

/** Production {@link BillingFetchLike} over the global `fetch` (undici in the main process). */
export const nodeBillingFetch: BillingFetchLike = async (input, init) => {
  const res = await fetch(input, {
    method: init.method,
    headers: init.headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
  })
  return { status: res.status, text: () => res.text() }
}
