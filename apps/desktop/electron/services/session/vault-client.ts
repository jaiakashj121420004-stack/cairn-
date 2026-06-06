/**
 * Desktop vault + devices HTTP client (CLAUDE.md §18.5/§18.6).
 *
 * Talks to the JWT-guarded `/vault/key` and `/devices` endpoints from the Electron *main*
 * process. Unlike {@link AuthHttpClient} (which carries the `__Host-refresh` cookie), these
 * endpoints authenticate with the short-lived access token, so every call sends
 * `Authorization: Bearer <accessToken>`.
 *
 * Every method returns a {@link Result} — the boundary never throws — and validates the
 * server's response body on the way back (§19.2): a malformed descriptor becomes a typed
 * `INTERNAL` error rather than a half-valid object handed to the crypto layer. `fetchImpl`
 * is injected (defaults to the global `fetch`) so unit tests drive every path with no
 * network.
 *
 * Privacy note: this client never sees plaintext. `wrapped_data_key` /
 * `recovery_wrapped_data_key` are opaque ciphertext both to it and to the server.
 */
import { err, ok } from '@cairn/shared-types'
import {
  registerDeviceOutputSchema,
  registerDeviceSchema,
  vaultKeyOutputSchema,
  vaultKeyPutOutputSchema,
  vaultKeyPutSchema,
} from '@cairn/shared-zod'
import type { Result } from '@cairn/shared-types'
import type {
  RegisterDeviceInput,
  RegisterDeviceOutput,
  VaultKeyOutput,
  VaultKeyPutInput,
  VaultKeyPutOutput,
} from '@cairn/shared-zod'

const NETWORK_ERROR = 'NETWORK_ERROR'
const INTERNAL = 'INTERNAL'

/** Minimal response surface the client needs: the status and the body text. */
export interface VaultFetchResponse {
  readonly status: number
  text(): Promise<string>
}

/** Injected fetch. `Authorization` is always set; body is JSON or absent. */
export type VaultFetchLike = (
  input: string,
  init: {
    method: string
    headers: Record<string, string>
    body?: string
  },
) => Promise<VaultFetchResponse>

export interface VaultHttpClientOptions {
  /** Base URL of the API, e.g. `https://api.cairn.app`. No trailing slash required. */
  readonly baseUrl: string
  /** Injected fetch implementation. Defaults to the global `fetch`. */
  readonly fetchImpl?: VaultFetchLike
}

/** The subset of {@link VaultHttpClient} that the enrollment service depends on (injectable for tests). */
export interface VaultClient {
  /** GET /vault/key — `ok(null)` when the vault is not yet enrolled (server 404). */
  getVaultKey(accessToken: string): Promise<Result<VaultKeyOutput | null>>
  /** PUT /vault/key — enrollment / re-wrap. */
  putVaultKey(input: VaultKeyPutInput, accessToken: string): Promise<Result<VaultKeyPutOutput>>
  /** POST /devices — register this device; returns its server record. */
  registerDevice(
    input: RegisterDeviceInput,
    accessToken: string,
  ): Promise<Result<RegisterDeviceOutput>>
}

/** A parsed HTTP exchange: the raw status plus the JSON-parsed body (or null). */
interface ParsedResponse {
  readonly status: number
  readonly body: unknown
}

/**
 * Narrow a server JSON body to a {@link Result}. The server serializes every response as a
 * `Result<T>`; this re-validates the discriminant defensively so a malformed/proxy body
 * becomes a typed error rather than a thrown cast. (Mirrors `auth-client.ts`'s helper; kept
 * local to avoid coupling the two clients.)
 */
function bodyToResult<T>(parsed: ParsedResponse): Result<T> {
  const { body } = parsed
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
  return err(INTERNAL, `unexpected response (status ${parsed.status})`)
}

export class VaultHttpClient implements VaultClient {
  private readonly baseUrl: string
  private readonly fetchImpl: VaultFetchLike

  constructor(opts: VaultHttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as VaultFetchLike)
  }

  async getVaultKey(accessToken: string): Promise<Result<VaultKeyOutput | null>> {
    const res = await this.request('GET', '/vault/key', accessToken, undefined)
    if (!res.ok) return res
    // 404 is the documented "not enrolled" signal, not an error.
    if (res.parsed.status === 404) return ok(null)
    const result = bodyToResult<unknown>(res.parsed)
    if (!result.ok) return result
    const validated = vaultKeyOutputSchema.safeParse(result.data)
    if (!validated.success) return err(INTERNAL, 'malformed vault key descriptor from server')
    return ok(validated.data)
  }

  async putVaultKey(
    input: VaultKeyPutInput,
    accessToken: string,
  ): Promise<Result<VaultKeyPutOutput>> {
    const validatedInput = vaultKeyPutSchema.safeParse(input)
    if (!validatedInput.success) return err('VALIDATION_FAILED', 'invalid vault key payload')
    const res = await this.request('PUT', '/vault/key', accessToken, validatedInput.data)
    if (!res.ok) return res
    const result = bodyToResult<unknown>(res.parsed)
    if (!result.ok) return result
    const validated = vaultKeyPutOutputSchema.safeParse(result.data)
    if (!validated.success) return err(INTERNAL, 'malformed vault key ack from server')
    return ok(validated.data)
  }

  async registerDevice(
    input: RegisterDeviceInput,
    accessToken: string,
  ): Promise<Result<RegisterDeviceOutput>> {
    const validatedInput = registerDeviceSchema.safeParse(input)
    if (!validatedInput.success) return err('VALIDATION_FAILED', 'invalid device registration')
    const res = await this.request('POST', '/devices', accessToken, validatedInput.data)
    if (!res.ok) return res
    const result = bodyToResult<unknown>(res.parsed)
    if (!result.ok) return result
    const validated = registerDeviceOutputSchema.safeParse(result.data)
    if (!validated.success) return err(INTERNAL, 'malformed device record from server')
    return ok(validated.data)
  }

  /**
   * Issue a request with a bearer token. Returns the parsed exchange on completion (any HTTP
   * status), or a `NETWORK_ERROR` Result when the fetch itself threw (offline / DNS / TLS).
   */
  private async request(
    method: string,
    path: string,
    accessToken: string,
    input: unknown,
  ): Promise<{ ok: true; parsed: ParsedResponse } | (Result<never> & { ok: false })> {
    const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
    if (input !== undefined) headers['content-type'] = 'application/json'

    let res: VaultFetchResponse
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
      })
    } catch (e) {
      return err(NETWORK_ERROR, e instanceof Error ? e.message : String(e)) as Result<never> & {
        ok: false
      }
    }

    let body: unknown = null
    try {
      const text = await res.text()
      body = text.length > 0 ? JSON.parse(text) : null
    } catch {
      body = null // non-JSON (e.g. an HTML 502 from a proxy); status still drives handling
    }

    return { ok: true, parsed: { status: res.status, body } }
  }
}

/**
 * Production {@link VaultFetchLike} over the global `fetch` (undici in Electron's main
 * process).
 */
export const nodeVaultFetch: VaultFetchLike = async (input, init) => {
  const res = await fetch(input, {
    method: init.method,
    headers: init.headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
  })
  return {
    status: res.status,
    text: () => res.text(),
  }
}
