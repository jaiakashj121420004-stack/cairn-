import { createHash } from 'node:crypto'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

/**
 * Inject a strict Content-Security-Policy `<meta>` into the BUILT renderer HTML (P1
 * security). Build-only (`apply: 'build'`) so Vite's dev server keeps its inline HMR
 * client + eval; the packaged app — and the e2e-tested `out/` build — get the strict
 * policy.
 *
 * Runs `post`, over the FINAL html, and SHA-256-hashes every attribute-less inline
 * `<script>` (just the no-flicker theme init) into `script-src`, so the policy needs no
 * 'unsafe-inline' for scripts and the hash always matches what the browser computes.
 * `style-src` keeps 'unsafe-inline' for the inline styles React/Framer/Tailwind emit;
 * `connect-src` allows https + loopback for the backend and the sync websocket.
 */
function cspMetaPlugin(): Plugin {
  return {
    name: 'cairn-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html: string): string {
        const scriptHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          (m) =>
            `'sha256-${createHash('sha256')
              .update(m[1] ?? '', 'utf8')
              .digest('base64')}'`,
        )
        const csp = [
          "default-src 'self'",
          `script-src 'self' ${scriptHashes.join(' ')}`.trimEnd(),
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' https: http://localhost:* ws://localhost:* wss:",
          // Embedded TradingView review chart (P3): only the widgetembed frame is
          // allowed — their scripts run inside that cross-origin frame, not our
          // document, so script-src stays locked to 'self'.
          "frame-src 'self' https://www.tradingview.com https://s.tradingview.com",
          "object-src 'none'",
          "base-uri 'none'",
          "frame-ancestors 'none'",
          "form-action 'none'",
        ].join('; ')
        return html.replace(
          '</title>',
          `</title>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        )
      },
    },
  }
}

// Deps that must be BUNDLED into the main chunk rather than externalized (the default).
//  - `@scure/bip39` + `@scure/base` + `@noble/hashes`: ESM-only, so a `require()` from the
//    CJS main bundle throws ERR_REQUIRE_ESM and crashes on launch.
//  - `@cairn/*` workspace packages: published as raw TypeScript source (no dist build), so
//    a `require()` of their `src/index.ts` throws "Unexpected token 'export'". Bundling lets
//    Vite compile them in. The vault/session wiring pulls these into the startup graph.
const BUNDLED_MAIN_DEPS = [
  '@scure/bip39',
  '@scure/base',
  '@noble/hashes',
  '@cairn/shared-crypto',
  '@cairn/shared-types',
  '@cairn/shared-zod',
  '@cairn/sync-protocol',
  '@cairn/billing-types',
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: BUNDLED_MAIN_DEPS })],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.ts'),
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts'),
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    plugins: [react(), cspMetaPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
})
