import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Auth integration tests share a single Postgres schema and reset it between
    // files; run files serially to avoid cross-file interference.
    fileParallelism: false,
    // Argon2id at 64 MiB is intentionally slow; give integration tests headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
