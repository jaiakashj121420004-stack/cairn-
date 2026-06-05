/**
 * Production {@link VaultApi} — talks to the Fastify backend's `/vault/push`
 * (docs/sync-protocol.md §6, apps/server/src/vault/routes.ts).
 *
 * `fetch` is injected (defaults to the global) so tests drive it without a network and
 * the runtime can later swap in Electron's cookie-aware `net` client. The refresh
 * cookie (`__Host-refresh`) is owned by the {@link SyncContext}, not here — this client
 * only sends the Bearer access token and surfaces the raw HTTP result.
 */
import type { VaultApi, VaultHttpResult, VaultPullInput, VaultPushInput } from './types'

export type FetchLike = (
  input: string,
  init: {
    method: string
    headers: Record<string, string>
    body: string
  },
) => Promise<{
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}>

/** Parse a `Retry-After` header (delta-seconds form only) into ms, or null. */
function parseRetryAfterMs(headers: { get(name: string): string | null }): number | undefined {
  const raw = headers.get('retry-after')
  if (raw === null) return undefined
  const seconds = Number(raw.trim())
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return Math.round(seconds * 1000)
}

export interface HttpVaultApiOptions {
  /** Base URL of the API, e.g. `https://api.cairn.app`. No trailing slash. */
  readonly baseUrl: string
  /** Injected fetch implementation. Defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike
}

export class HttpVaultApi implements VaultApi {
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike

  constructor(opts: HttpVaultApiOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  }

  push(input: VaultPushInput, accessToken: string): Promise<VaultHttpResult> {
    return this.post('/vault/push', input, accessToken)
  }

  pull(input: VaultPullInput, accessToken: string): Promise<VaultHttpResult> {
    return this.post('/vault/pull', input, accessToken)
  }

  /** Shared POST: Bearer auth, JSON body, tolerant body parse, network errors surfaced. */
  private async post(path: string, input: unknown, accessToken: string): Promise<VaultHttpResult> {
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(input),
      })
    } catch (e) {
      return { status: 0, body: null, networkError: e instanceof Error ? e.message : String(e) }
    }

    const retryAfterMs = parseRetryAfterMs(res.headers)
    let body: unknown = null
    try {
      const text = await res.text()
      body = text.length > 0 ? JSON.parse(text) : null
    } catch {
      // Non-JSON body (e.g. an HTML 502 from a proxy). The status still drives handling.
      body = null
    }

    return retryAfterMs === undefined
      ? { status: res.status, body }
      : { status: res.status, body, retryAfterMs }
  }
}
