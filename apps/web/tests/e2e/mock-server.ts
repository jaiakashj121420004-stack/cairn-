import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/**
 * In-memory mock of the Cairn API for the web e2e suite (task §8).
 *
 * It implements the SAME wire contracts as the real Fastify server (`apps/server`) for
 * the auth + vault surface — `Result`-shaped JSON, `__Host-refresh` cookie semantics,
 * the `/vault/key` and `/vault/pull` shapes — but with throwaway in-memory state so the
 * suite runs in CI without Postgres. It stays blind to plaintext: `/vault/key` stores and
 * returns opaque wrapped-key blobs, and `/test/seed` stores opaque ciphertext ops. The
 * real client crypto runs unchanged against it, so the test exercises the genuine E2E
 * path (derive → unwrap → decrypt), not a mock of it.
 *
 * It is NOT a security oracle — it skips Argon2id pepper, real JWT signing, rate limits,
 * reuse-detection, etc. Those are the real server's job and have their own server tests.
 */

/* eslint-disable consistent-return -- handle() is a void async router using the
   `return send(res, …)` early-exit idiom; ok/fail/issueSession all return void, so these
   are void-returns. consistent-return fires only on the syntactic mix of `return expr` (the
   route handlers) and bare `return` (the OPTIONS/logout/404 paths). Rewriting ~19 early-exits
   into block statements in this throwaway test mock adds noise without value. */

interface Account {
  userId: string
  email: string
  password: string
  emailVerified: boolean
  entitlement: 'free' | 'trial' | 'pro'
  verifyToken: string
  refreshToken: string | null
}

interface VaultKeyRow {
  wrapped_data_key: unknown
  recovery_wrapped_data_key: unknown
  kdf_salt: unknown
  kdf: unknown
  key_version: number
}

interface OpRow {
  id: number
  table_name: string
  record_id: string
  op_type: 'upsert' | 'delete'
  payload_ciphertext: string
  device_id: string
  created_at: string
}

const accounts = new Map<string, Account>() // email -> account
const accountsById = new Map<string, Account>() // userId -> account
const vaultKeys = new Map<string, VaultKeyRow>() // userId -> key material
const ops = new Map<string, OpRow[]>() // userId -> ops
let opSeq = 1
let userSeq = 1

function ok(res: ServerResponse, data: unknown, extraHeaders: Record<string, string> = {}): void {
  const body = JSON.stringify({ ok: true, data })
  res.writeHead(200, { 'content-type': 'application/json', ...corsHeaders(res), ...extraHeaders })
  res.end(body)
}

function fail(res: ServerResponse, status: number, code: string, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json', ...corsHeaders(res) })
  res.end(JSON.stringify({ ok: false, error: { code, message } }))
}

function corsHeaders(res: ServerResponse): Record<string, string> {
  const origin = (res.req.headers.origin as string | undefined) ?? '*'
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization, x-csrf-token',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {}
}

function bearerUser(req: IncomingMessage): Account | null {
  const auth = req.headers.authorization
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null
  // Mock tokens are `access:<userId>`.
  const userId = auth.slice('Bearer access:'.length)
  return accountsById.get(userId) ?? null
}

function refreshCookie(token: string): string {
  // Mirror the real `__Host-refresh` attributes; Secure is dropped on http for the test.
  return `__Host-refresh=${token}; Path=/; HttpOnly; SameSite=Strict`
}

function readRefresh(req: IncomingMessage): string | null {
  const cookie = req.headers.cookie ?? ''
  const m = cookie.match(/__Host-refresh=([^;]+)/)
  return m?.[1] ?? null
}

function issueSession(res: ServerResponse, acc: Account): void {
  acc.refreshToken = `refresh:${acc.userId}:${Date.now()}`
  ok(
    res,
    {
      accessToken: `access:${acc.userId}`,
      expiresIn: 900,
      user: { userId: acc.userId, emailVerified: acc.emailVerified, entitlement: acc.entitlement },
    },
    { 'set-cookie': refreshCookie(acc.refreshToken) },
  )
}

export function startMockServer(port: number): { close: () => void } {
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => fail(res, 500, 'INTERNAL', 'mock error'))
  })
  server.listen(port)
  return { close: () => server.close() }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(res))
    res.end()
    return
  }
  if (path === '/health') return ok(res, { status: 'ok' })

  // ── Auth ────────────────────────────────────────────────────────────────────
  if (path === '/auth/signup' && req.method === 'POST') {
    const body = await readJson(req)
    const email = String(body['email'] ?? '').toLowerCase()
    if (accounts.has(email)) return fail(res, 409, 'CONFLICT', 'email in use')
    const userId = `u${userSeq++}`
    const acc: Account = {
      userId,
      email,
      password: String(body['password'] ?? ''),
      emailVerified: false,
      entitlement: 'pro', // tests run the Pro web surface
      verifyToken: `verify${userId}`,
      refreshToken: null,
    }
    accounts.set(email, acc)
    accountsById.set(userId, acc)
    return ok(res, { userId })
  }

  if (path === '/auth/verify' && req.method === 'POST') {
    const body = await readJson(req)
    const token = String(body['token'] ?? '')
    const acc = [...accounts.values()].find((a) => a.verifyToken === token)
    if (!acc) return fail(res, 400, 'INVALID_TOKEN', 'bad token')
    acc.emailVerified = true
    return ok(res, { verified: true })
  }

  if (path === '/auth/login' && req.method === 'POST') {
    const body = await readJson(req)
    const acc = accounts.get(String(body['email'] ?? '').toLowerCase())
    if (!acc || acc.password !== String(body['password'] ?? '')) {
      return fail(res, 401, 'INVALID_CREDENTIALS', 'bad credentials')
    }
    return issueSession(res, acc)
  }

  if (path === '/auth/refresh' && req.method === 'POST') {
    const token = readRefresh(req)
    const acc = token ? [...accountsById.values()].find((a) => a.refreshToken === token) : null
    if (!acc) return fail(res, 401, 'INVALID_TOKEN', 'no/!refresh')
    return issueSession(res, acc)
  }

  if (path === '/auth/logout' && req.method === 'POST') {
    const token = readRefresh(req)
    const acc = token ? [...accountsById.values()].find((a) => a.refreshToken === token) : null
    if (acc) acc.refreshToken = null
    res.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': '__Host-refresh=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
      ...corsHeaders(res),
    })
    res.end(JSON.stringify({ ok: true, data: { ok: true } }))
    return
  }

  if (
    (path === '/auth/forgot-password' || path === '/auth/magic-request') &&
    req.method === 'POST'
  ) {
    return ok(res, { sent: true })
  }
  if (path === '/auth/reset-password' && req.method === 'POST') return ok(res, { reset: true })

  // ── Vault ───────────────────────────────────────────────────────────────────
  const user = bearerUser(req)

  if (path === '/vault/key' && req.method === 'GET') {
    if (!user) return fail(res, 401, 'UNAUTHENTICATED', 'no token')
    const row = vaultKeys.get(user.userId)
    if (!row) return fail(res, 404, 'NOT_FOUND', 'not enrolled')
    return ok(res, row)
  }

  if (path === '/vault/key' && req.method === 'PUT') {
    if (!user) return fail(res, 401, 'UNAUTHENTICATED', 'no token')
    const body = await readJson(req)
    vaultKeys.set(user.userId, {
      wrapped_data_key: body['wrapped_data_key'],
      recovery_wrapped_data_key: body['recovery_wrapped_data_key'],
      kdf_salt: body['kdf_salt'],
      kdf: body['kdf'],
      key_version: 1,
    })
    return ok(res, { key_version: 1 })
  }

  if (path === '/vault/manifest' && req.method === 'GET') {
    if (!user) return fail(res, 401, 'UNAUTHENTICATED', 'no token')
    const list = ops.get(user.userId) ?? []
    const perTable: Record<string, number> = {}
    for (const o of list) perTable[o.table_name] = Math.max(perTable[o.table_name] ?? 0, o.id)
    return ok(res, { key_version: 1, schema_version: 1, latest_op_id_per_table: perTable })
  }

  if (path === '/vault/pull' && req.method === 'POST') {
    if (!user) return fail(res, 401, 'UNAUTHENTICATED', 'no token')
    const body = await readJson(req)
    const sinceId = typeof body['since_id'] === 'number' ? (body['since_id'] as number) : 0
    const list = (ops.get(user.userId) ?? []).filter((o) => o.id > sinceId)
    return ok(res, { ops: list, next_cursor: null })
  }

  // ── Test-only seed (mock pushes encrypted ops for a user) ─────────────────────
  if (path === '/test/seed' && req.method === 'POST') {
    if (!user) return fail(res, 401, 'UNAUTHENTICATED', 'no token')
    const body = await readJson(req)
    const incoming = (body['ops'] as Array<Record<string, string>>) ?? []
    const list = ops.get(user.userId) ?? []
    for (const o of incoming) {
      list.push({
        id: opSeq++,
        table_name: String(o['table_name']),
        record_id: String(o['record_id']),
        op_type: (o['op_type'] as 'upsert' | 'delete') ?? 'upsert',
        payload_ciphertext: String(o['payload_ciphertext']),
        device_id: '00000000-0000-0000-0000-000000000000',
        created_at: new Date().toISOString(),
      })
    }
    ops.set(user.userId, list)
    return ok(res, { op_ids: incoming.map(() => opSeq) })
  }

  fail(res, 404, 'NOT_FOUND', `no route ${req.method} ${path}`)
}

// Allow `node mock-server.ts` (via tsx) to run it standalone for Playwright's webServer.
const portArg = process.env['MOCK_PORT']
if (portArg !== undefined) {
  startMockServer(Number(portArg))
  // eslint-disable-next-line no-console
  console.log(`[mock-server] listening on ${portArg}`)
}
