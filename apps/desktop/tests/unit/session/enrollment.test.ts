// @vitest-environment node
import { ok } from '@cairn/shared-types'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  deriveKEK,
  generateRecoveryPhrase,
  initCrypto,
  keyFromRecoveryPhrase,
  unwrapDataKey,
} from '../../../electron/services/crypto'
import {
  VaultEnroller,
  type DeviceIdStore,
  type VaultKeychain,
} from '../../../electron/services/session/enrollment'
import {
  base64ToBytes,
  wireToKdfParams,
  wireToWrappedKey,
} from '../../../electron/services/session/vault-wire'
import type { VaultClient } from '../../../electron/services/session/vault-client'
import type { Result } from '@cairn/shared-types'
import type {
  RegisterDeviceOutput,
  VaultKeyOutput,
  VaultKeyPutInput,
  VaultKeyPutOutput,
} from '@cairn/shared-zod'

const PARAMS = {
  userId: 'u1',
  password: 'correct horse battery staple',
  accessToken: 'tok',
  deviceName: 'test-host',
  platform: 'linux',
}

/** In-memory keychain double. */
function makeKeychain(): VaultKeychain & { map: Map<string, Uint8Array> } {
  const map = new Map<string, Uint8Array>()
  return {
    map,
    storeDataKey: (userId, dataKey) => {
      map.set(userId, dataKey)
      return Promise.resolve(ok(undefined))
    },
    readDataKey: (userId) => Promise.resolve(ok(map.get(userId) ?? null)),
    clearDataKey: (userId) => Promise.resolve(ok(map.delete(userId))),
  }
}

/** In-memory device-id store double. */
function makeDevices(): DeviceIdStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    load: (userId) => map.get(userId) ?? null,
    save: (userId, deviceId) => {
      map.set(userId, deviceId)
    },
    clear: (userId) => {
      map.delete(userId)
    },
  }
}

const DEVICE: RegisterDeviceOutput = {
  device: {
    id: '00000000-0000-0000-0000-0000000000aa',
    name: 'test-host',
    platform: 'linux',
    registered_at: '2026-06-05T00:00:00.000Z',
    last_seen_at: null,
    revoked_at: null,
  },
}

/** A fake vault client. `descriptor` drives enroll-vs-unlock; `lastPut` captures enrollment. */
function makeClient(descriptor: VaultKeyOutput | null): VaultClient & {
  lastPut: VaultKeyPutInput | null
  registerCount: number
} {
  const state = { lastPut: null as VaultKeyPutInput | null, registerCount: 0, descriptor }
  return {
    get lastPut() {
      return state.lastPut
    },
    get registerCount() {
      return state.registerCount
    },
    getVaultKey: (): Promise<Result<VaultKeyOutput | null>> =>
      Promise.resolve(ok(state.descriptor)),
    putVaultKey: (input): Promise<Result<VaultKeyPutOutput>> => {
      state.lastPut = input
      return Promise.resolve(ok({ key_version: 1 }))
    },
    registerDevice: (): Promise<Result<RegisterDeviceOutput>> => {
      state.registerCount += 1
      return Promise.resolve(ok(DEVICE))
    },
  }
}

beforeAll(async () => {
  await initCrypto()
})

describe('VaultEnroller.unlock — enrollment', () => {
  it('mints a vault, wraps under password + recovery KEKs, registers, and caches', async () => {
    const client = makeClient(null)
    const keychain = makeKeychain()
    const devices = makeDevices()
    const enroller = new VaultEnroller({ client, keychain, devices })

    const res = await enroller.unlock(PARAMS)
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.enrolled).toBe(true)
    expect(res.data.recoveryPhrase).toHaveLength(24)
    expect(res.data.deviceId).toBe(DEVICE.device.id)
    // Cached + persisted for keyless resume.
    expect(keychain.map.get('u1')).toEqual(res.data.dataKey)
    expect(devices.map.get('u1')).toBe(DEVICE.device.id)
    expect(client.lastPut).not.toBeNull()
  })

  it('seeds a recoverable vault: both KEKs unwrap to the same data key', async () => {
    const client = makeClient(null)
    const enroller = new VaultEnroller({ client, keychain: makeKeychain(), devices: makeDevices() })

    const res = await enroller.unlock(PARAMS)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const put = client.lastPut
    expect(put).not.toBeNull()
    if (!put) return

    // Password path: re-derive the KEK from the stored salt/params and unwrap.
    const kek = await deriveKEK(
      PARAMS.password,
      base64ToBytes(put.kdf_salt),
      wireToKdfParams(put.kdf),
    )
    expect(unwrapDataKey(wireToWrappedKey(put.wrapped_data_key), kek)).toEqual(res.data.dataKey)

    // Recovery path (the Stage-4 restore seam): the phrase-derived KEK unwraps the same key.
    expect(res.data.recoveryPhrase).toBeDefined()
    const recoveryKek = await keyFromRecoveryPhrase(res.data.recoveryPhrase ?? [])
    expect(unwrapDataKey(wireToWrappedKey(put.recovery_wrapped_data_key), recoveryKek)).toEqual(
      res.data.dataKey,
    )
  })
})

describe('VaultEnroller.unlock — existing vault', () => {
  /** Enroll once to obtain a real descriptor + the data key it protects. */
  async function seedDescriptor(): Promise<{ descriptor: VaultKeyOutput; dataKey: Uint8Array }> {
    const client = makeClient(null)
    const enroller = new VaultEnroller({ client, keychain: makeKeychain(), devices: makeDevices() })
    const res = await enroller.unlock(PARAMS)
    if (!res.ok || !client.lastPut) throw new Error('seed failed')
    return { descriptor: { ...client.lastPut, key_version: 1 }, dataKey: res.data.dataKey }
  }

  it('unlocks with the correct password to the same data key, without re-registering', async () => {
    const { descriptor, dataKey } = await seedDescriptor()
    const devices = makeDevices()
    devices.save('u1', DEVICE.device.id) // device already enrolled on this machine
    const client = makeClient(descriptor)
    const enroller = new VaultEnroller({ client, keychain: makeKeychain(), devices })

    const res = await enroller.unlock(PARAMS)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.enrolled).toBe(false)
    expect(res.data.dataKey).toEqual(dataKey)
    expect(client.registerCount).toBe(0) // reused the persisted device id
  })

  it('rejects a wrong password with WRONG_KEY', async () => {
    const { descriptor } = await seedDescriptor()
    const client = makeClient(descriptor)
    const enroller = new VaultEnroller({ client, keychain: makeKeychain(), devices: makeDevices() })

    const res = await enroller.unlock({ ...PARAMS, password: 'wrong password entirely' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('WRONG_KEY')
  })
})

describe('VaultEnroller.recover — recovery phrase', () => {
  /** Enroll once and surface the descriptor, data key, AND the one-time recovery phrase. */
  async function seedWithPhrase(): Promise<{
    descriptor: VaultKeyOutput
    dataKey: Uint8Array
    phrase: readonly string[]
  }> {
    const client = makeClient(null)
    const enroller = new VaultEnroller({ client, keychain: makeKeychain(), devices: makeDevices() })
    const res = await enroller.unlock(PARAMS)
    if (!res.ok || !client.lastPut || !res.data.recoveryPhrase) throw new Error('seed failed')
    return {
      descriptor: { ...client.lastPut, key_version: 1 },
      dataKey: res.data.dataKey,
      phrase: res.data.recoveryPhrase,
    }
  }

  const RECOVER_BASE = {
    userId: 'u1',
    accessToken: 'tok',
    deviceName: 'test-host',
    platform: 'linux',
  }

  it('recovers the SAME data key from the phrase and re-wraps under a new password', async () => {
    const { descriptor, dataKey, phrase } = await seedWithPhrase()
    const client = makeClient(descriptor)
    const keychain = makeKeychain()
    const enroller = new VaultEnroller({ client, keychain, devices: makeDevices() })

    const res = await enroller.recover({
      ...RECOVER_BASE,
      phrase,
      newPassword: 'a brand new vault password',
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.enrolled).toBe(false)
    expect(res.data.dataKey).toEqual(dataKey) // the data key is unchanged (docs/security.md §8)
    expect(keychain.map.get('u1')).toEqual(dataKey)

    const put = client.lastPut
    expect(put).not.toBeNull()
    if (!put) return
    // The NEW password unwraps the freshly re-wrapped data key…
    const newKek = await deriveKEK(
      'a brand new vault password',
      base64ToBytes(put.kdf_salt),
      wireToKdfParams(put.kdf),
    )
    expect(unwrapDataKey(wireToWrappedKey(put.wrapped_data_key), newKek)).toEqual(dataKey)
    // …and the recovery key is preserved, so the same phrase still works.
    const recoveryKek = await keyFromRecoveryPhrase(phrase)
    expect(unwrapDataKey(wireToWrappedKey(put.recovery_wrapped_data_key), recoveryKek)).toEqual(
      dataKey,
    )
  })

  it('rejects a valid-but-wrong phrase with WRONG_KEY', async () => {
    const { descriptor } = await seedWithPhrase()
    const client = makeClient(descriptor)
    const enroller = new VaultEnroller({ client, keychain: makeKeychain(), devices: makeDevices() })

    // A different, checksum-valid phrase — it derives a real KEK that simply won't unwrap.
    const { phrase: otherPhrase } = generateRecoveryPhrase()
    const res = await enroller.recover({
      ...RECOVER_BASE,
      phrase: otherPhrase,
      newPassword: 'whatever password123',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('WRONG_KEY')
  })

  it('rejects a checksum-invalid phrase with INVALID_RECOVERY_PHRASE before any unwrap', async () => {
    const { descriptor } = await seedWithPhrase()
    const client = makeClient(descriptor)
    const enroller = new VaultEnroller({ client, keychain: makeKeychain(), devices: makeDevices() })

    const bogus = Array.from({ length: 24 }, () => 'abandon') // fails the BIP-39 checksum
    const res = await enroller.recover({
      ...RECOVER_BASE,
      phrase: bogus,
      newPassword: 'whatever password123',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('INVALID_RECOVERY_PHRASE')
  })

  it('reports NOT_FOUND when there is no vault to recover', async () => {
    const client = makeClient(null) // server has no descriptor
    const enroller = new VaultEnroller({ client, keychain: makeKeychain(), devices: makeDevices() })
    const { phrase } = generateRecoveryPhrase()
    const res = await enroller.recover({
      ...RECOVER_BASE,
      phrase,
      newPassword: 'whatever password123',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })
})

describe('VaultEnroller.resume', () => {
  it('reports unlocked when the data key and device id are both present', async () => {
    const keychain = makeKeychain()
    const devices = makeDevices()
    keychain.map.set('u1', new Uint8Array([1, 2, 3]))
    devices.map.set('u1', DEVICE.device.id)
    const enroller = new VaultEnroller({ client: makeClient(null), keychain, devices })

    const res = await enroller.resume({ userId: 'u1' })
    expect(res.status).toBe('unlocked')
    if (res.status === 'unlocked') {
      expect(res.deviceId).toBe(DEVICE.device.id)
      expect(res.dataKey).toEqual(new Uint8Array([1, 2, 3]))
    }
  })

  it('reports needs-password on a keychain miss', async () => {
    const devices = makeDevices()
    devices.map.set('u1', DEVICE.device.id)
    const enroller = new VaultEnroller({
      client: makeClient(null),
      keychain: makeKeychain(),
      devices,
    })
    const res = await enroller.resume({ userId: 'u1' })
    expect(res.status).toBe('needs-password')
  })

  it('reports needs-password when no device is enrolled locally', async () => {
    const keychain = makeKeychain()
    keychain.map.set('u1', new Uint8Array([1]))
    const enroller = new VaultEnroller({
      client: makeClient(null),
      keychain,
      devices: makeDevices(),
    })
    const res = await enroller.resume({ userId: 'u1' })
    expect(res.status).toBe('needs-password')
  })
})
