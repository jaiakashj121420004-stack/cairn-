/**
 * cTrader OAuth redirect capture (Wave 4 — `docs/broker-integration.md` §2.2).
 *
 * A one-shot loopback HTTP server that receives the authorization-code redirect
 * from the user's browser after they consent on Spotware's hosted page. Binds
 * `127.0.0.1` only (never `0.0.0.0`), validates the anti-CSRF `state`, captures the
 * `code`, shows the user a "you can close this tab" page, and shuts down.
 *
 * Local-first posture: the only network in the whole flow is the user's browser →
 * Spotware (consent) and this loopback hop back. No inbound internet exposure.
 */

import { createServer } from 'http'
import { err, ok } from '@cairn/shared-types'
import { CTRADER_REDIRECT_PORT } from './config'
import type { Result } from '@cairn/shared-types'

const CALLBACK_PATH = '/ctrader/callback'
const DEFAULT_TIMEOUT_MS = 5 * 60_000

const CLOSE_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Cairn</title></head>
<body style="font-family:system-ui;background:#0d0f12;color:#e6e6e6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center"><h2>cTrader connected</h2><p>You can close this tab and return to Cairn.</p></div>
</body></html>`

export interface CaptureAuthCodeOptions {
  /** The anti-CSRF nonce sent in the auth URL; the redirect must echo it. */
  state: string
  /** Loopback port (defaults to {@link CTRADER_REDIRECT_PORT}). */
  port?: number
  /** Abandon the wait after this long. */
  timeoutMs?: number
}

/**
 * Start the loopback server and resolve with the captured authorization code, or
 * a typed error on state mismatch / provider error / timeout. Always tears the
 * server down before resolving.
 */
export function captureAuthCode(options: CaptureAuthCodeOptions): Promise<Result<string>> {
  const port = options.port ?? CTRADER_REDIRECT_PORT
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return new Promise((resolve) => {
    let settled = false
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(CLOSE_PAGE)

      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      finish(
        error
          ? err('CTRADER_OAUTH_DENIED', error)
          : state !== options.state
            ? err('CTRADER_OAUTH_STATE', 'redirect state did not match')
            : !code
              ? err('CTRADER_OAUTH_NO_CODE', 'redirect carried no authorization code')
              : ok(code),
      )
    })

    const timer = setTimeout(
      () => finish(err('CTRADER_OAUTH_TIMEOUT', 'no redirect received')),
      timeoutMs,
    )

    function finish(result: Result<string>): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close(() => resolve(result))
    }

    server.on('error', (e) => finish(err('CTRADER_REDIRECT_BIND', String(e))))
    // Loopback only — never bind a routable interface.
    server.listen(port, '127.0.0.1')
  })
}
