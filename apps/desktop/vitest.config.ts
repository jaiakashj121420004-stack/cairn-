import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/{unit,integration}/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'out', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // §19.10 coverage gate. Scoped to the main-process business-logic layer
      // (electron/services + shared): P&L, rule engine, analytics, insights,
      // crypto, sync, import adapters, broker, session. This is the base of the
      // test pyramid. The IPC boundary layer, the renderer (src/**), and the
      // Electron bootstrap are covered by integration tests and smoke E2E, not
      // the unit coverage gate (see docs/conventions.md §13.13). The threshold
      // ratchets up, never down.
      all: true,
      include: ['electron/services/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.d.ts'],
      thresholds: {
        lines: 70,
        statements: 70,
        branches: 65,
        functions: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
})
