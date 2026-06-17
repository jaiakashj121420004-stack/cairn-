import { defineConfig, devices } from '@playwright/test'

/**
 * E2E config (task §8). Boots two servers: the in-memory mock API and the Vite dev
 * server pointed at it. CI-friendly — no Postgres, deterministic. The suite drives the
 * real client crypto: signup → verify → recovery-phrase save → sync → multi-device.
 */
const MOCK_PORT = 8788
const WEB_PORT = 5174
const API_ORIGIN = `http://localhost:${MOCK_PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `cross-env MOCK_PORT=${MOCK_PORT} tsx tests/e2e/mock-server.ts`,
      url: `${API_ORIGIN}/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
    {
      command: `cross-env VITE_API_ORIGIN=${API_ORIGIN} vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
  ],
})
