/**
 * Backend base-URL safety check (P1 security), split out from `index.ts` so it is
 * pure and unit-testable without the session module's electron/keychain imports.
 */

/**
 * Reject a plaintext (`http://`) backend URL in packaged builds unless it targets
 * loopback. Dev/e2e (`!isPackaged`) may use any scheme so the local Fastify server on
 * `http://localhost:3000` keeps working; a shipped build that points at a REMOTE host
 * must use `https://` or we fail closed rather than send tokens in the clear. Loopback
 * `http://localhost` / `127.0.0.1` / `[::1]` stays allowed (local backend).
 */
export function assertSafeApiUrl(url: string, isPackaged: boolean): void {
  if (!isPackaged) return
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`CAIRN_API_URL is not a valid URL: ${url}`)
  }
  const host = parsed.hostname
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (parsed.protocol !== 'https:' && !isLoopback) {
    throw new Error(`CAIRN_API_URL must use https in packaged builds (got ${url})`)
  }
}
