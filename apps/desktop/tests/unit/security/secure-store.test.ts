// @vitest-environment node
//
// P1.E — the safeStorage-backed secret store that replaces keytar. safeStorage and
// app.getPath are faked; the encrypted secrets.json is written to a real temp dir so
// the encrypt→persist→decrypt roundtrip, deletion, the one-time keytar migration, and
// the unavailable-backend degradation are all exercised deterministically.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const h = vi.hoisted(() => ({ available: true, userDataDir: '' }))

vi.mock('electron', () => ({
  app: { getPath: (_key: string): string => h.userDataDir },
  safeStorage: {
    isEncryptionAvailable: (): boolean => h.available,
    encryptString: (s: string): Buffer => Buffer.from(`ENC:${s}`, 'utf8'),
    decryptString: (b: Buffer): string => {
      const s = b.toString('utf8')
      if (!s.startsWith('ENC:')) throw new Error('bad ciphertext')
      return s.slice(4)
    },
  },
}))

import { __setLegacyKeytarForTests, getSecureStore } from '../../../electron/services/secure-store'

function requireStore(): NonNullable<ReturnType<typeof getSecureStore>> {
  const s = getSecureStore()
  if (!s) throw new Error('secure store unavailable in test')
  return s
}

describe('secure-store (safeStorage-backed secret store)', () => {
  beforeEach(() => {
    h.available = true
    h.userDataDir = mkdtempSync(join(tmpdir(), 'cairn-secrets-'))
    __setLegacyKeytarForTests(null)
  })
  afterEach(() => {
    rmSync(h.userDataDir, { recursive: true, force: true })
    __setLegacyKeytarForTests(undefined)
  })

  it('encrypts and round-trips a secret', async () => {
    const store = requireStore()
    await store.setPassword('cairn', 'dataKey:u1', 'secret-value')
    expect(await store.getPassword('cairn', 'dataKey:u1')).toBe('secret-value')
  })

  it('returns null for a missing secret', async () => {
    expect(await requireStore().getPassword('cairn', 'nope')).toBeNull()
  })

  it('deletes a secret', async () => {
    const store = requireStore()
    await store.setPassword('cairn', 'k', 'v')
    expect(await store.deletePassword('cairn', 'k')).toBe(true)
    expect(await store.getPassword('cairn', 'k')).toBeNull()
    expect(await store.deletePassword('cairn', 'k')).toBe(false)
  })

  it('migrates a legacy keytar entry on first read, then clears the keytar copy', async () => {
    const deletePassword = vi.fn(async () => true)
    __setLegacyKeytarForTests({
      getPassword: async (s: string, a: string) =>
        s === 'cairn' && a === 'ctrader:app' ? 'legacy-secret' : null,
      deletePassword,
    })
    const store = requireStore()
    expect(await store.getPassword('cairn', 'ctrader:app')).toBe('legacy-secret')
    expect(deletePassword).toHaveBeenCalledWith('cairn', 'ctrader:app')

    // Re-encrypted locally now: a later read hits the file even with no legacy backend.
    __setLegacyKeytarForTests(null)
    expect(await store.getPassword('cairn', 'ctrader:app')).toBe('legacy-secret')
  })

  it('returns a null store when OS encryption is unavailable', () => {
    h.available = false
    expect(getSecureStore()).toBeNull()
  })
})
