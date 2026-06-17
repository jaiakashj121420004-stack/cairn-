import { core, vault } from './transport-http'

/**
 * Test-only window hooks for the Playwright suite (task §8). Wired ONLY under
 * `import.meta.env.DEV` from `main.tsx`, so it is never present in a production bundle.
 * It lets the e2e seed encrypted server state from an unlocked device (simulating a
 * desktop push), which a second device then pulls and decrypts — the real cross-device
 * E2E path. The seed travels as opaque ciphertext; the server stays blind.
 */
declare global {
  interface Window {
    __cairnTest?: {
      seedOp: (table: string, id: string, data: Record<string, unknown>) => Promise<boolean>
    }
  }
}

export function installTestHooks(): void {
  window.__cairnTest = {
    async seedOp(table, id, data) {
      const op = vault.encryptForTest(table, id, data)
      if (op === null) return false
      // Mock-only endpoint: stores the ciphertext op as if a device had pushed it.
      const res = await core.call('POST', '/test/seed', { ops: [op] })
      return res.ok
    },
  }
}
