import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const desktop = resolve(__dirname, '../desktop')

/**
 * Web client build (CLAUDE.md §3.1c, §18.7). The same React UI as the desktop renderer
 * (`apps/desktop/src/features/**`) compiled against an `HttpTransport` instead of
 * `ElectronTransport`. The only swap is the `@/lib/transport` alias below — every
 * feature imports `@/lib/ipc` unchanged, so web and desktop show the same numbers.
 *
 * Security posture (CLAUDE.md §2.13, task §6):
 *  - Everything is bundled. No external <script> tags, so the SRI surface is ~0 and the
 *    CSP needs no third-party `script-src` host.
 *  - Strict CSP with a per-response nonce. No `unsafe-inline`, no `unsafe-eval`.
 *    The nonce is injected at HTML render time: in dev by `cspNoncePlugin`; in prod by
 *    the edge middleware (`functions/_middleware.ts`) which rewrites `%CSP_NONCE%` and
 *    sets the matching `Content-Security-Policy` response header per request.
 */

const DEV_CSP = [
  // Dev only: Vite's HMR client injects inline scripts/styles and opens a WebSocket, so
  // dev necessarily relaxes script/style-src. PRODUCTION never does — the strict
  // nonce-based policy is set by functions/_middleware.ts and the index.html meta. The
  // distinction is the whole point: this string never ships.
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data:`,
  `font-src 'self'`,
  `connect-src 'self' ws: ${process.env['VITE_API_ORIGIN'] ?? 'http://localhost:8787'}`,
  `worker-src 'self'`,
  `object-src 'none'`,
  `base-uri 'none'`,
].join('; ')

/**
 * Dev-only CSP handling. The dev server can't run the production edge nonce injection, so
 * (1) the strict `%CSP_NONCE%` meta is stripped from the served HTML (a static nonce would
 * be meaningless and would break Vite's inline HMR scripts), and (2) a relaxed dev CSP
 * header is set. Production is untouched: the build keeps the placeholder meta and the
 * edge middleware sets the real strict header per response.
 */
function cspNoncePlugin(): Plugin {
  return {
    name: 'cairn-csp-nonce-dev',
    apply: 'serve',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Drop the strict CSP <meta> in dev; remove leftover nonce placeholders.
        return html
          .replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>\s*/i, '')
          .replaceAll(' nonce="%CSP_NONCE%"', '')
      },
    },
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', DEV_CSP)
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), cspNoncePlugin()],
  resolve: {
    // Order matters: Vite tries aliases top-down and uses the first match. The exact
    // `@/lib/transport` regex must precede the broad `@/` prefix.
    alias: [
      { find: /^@\/lib\/transport$/, replacement: resolve(__dirname, 'src/lib/transport-http.ts') },
      { find: /^@web\//, replacement: `${resolve(__dirname, 'src')}/` },
      { find: /^@\//, replacement: `${resolve(desktop, 'src')}/` },
      { find: /^@shared\//, replacement: `${resolve(desktop, 'shared')}/` },
    ],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // Bundle everything — no externals, no CDN. Keeps the CSP free of third-party
      // hosts and the SRI surface empty.
      output: {
        manualChunks: {
          crypto: ['libsodium-wrappers-sumo', '@scure/bip39'],
        },
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
})
