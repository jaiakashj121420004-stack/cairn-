import path from 'path'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',

  // Generous timeout: Electron cold-start on CI can take 20–30 s.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  // Retry once in CI so a single flaky IPC round-trip doesn't fail the gate.
  retries: process.env.CI ? 1 : 0,

  // Workers: Electron apps share the OS display; run serially on CI.
  workers: 1,

  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }]],

  outputDir: path.join('test-results', 'artifacts'),

  use: {
    // Record video for every failing test.
    video: 'retain-on-failure',
    // Screenshot on failure.
    screenshot: 'only-on-failure',
    // Playwright trace on failure (useful for debugging CI flakes).
    trace: 'retain-on-failure',
  },
})
