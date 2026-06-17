import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const desktop = resolve(__dirname, '../desktop')

/**
 * Unit-test config (CLAUDE.md §19.10). jsdom for the browser-ish modules; the same
 * transport/alias resolution as the app so `@web/*` and `@cairn/*` imports resolve.
 * Playwright e2e is configured separately in playwright.config.ts.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/lib\/transport$/, replacement: resolve(__dirname, 'src/lib/transport-http.ts') },
      { find: /^@web\//, replacement: `${resolve(__dirname, 'src')}/` },
      { find: /^@\//, replacement: `${resolve(desktop, 'src')}/` },
      { find: /^@shared\//, replacement: `${resolve(desktop, 'shared')}/` },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
})
