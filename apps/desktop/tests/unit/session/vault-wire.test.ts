// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  base64ToBytes,
  bytesToBase64,
  kdfParamsToWire,
  wireToKdfParams,
  wireToWrappedKey,
  wrappedKeyToWire,
} from '../../../electron/services/session/vault-wire'
import type { KDFParams, WrappedKey } from '@cairn/shared-types'

describe('vault-wire byte/base64 round-trip', () => {
  it('round-trips arbitrary bytes through base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64])
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('round-trips an empty array', () => {
    expect(base64ToBytes(bytesToBase64(new Uint8Array()))).toEqual(new Uint8Array())
  })
})

describe('vault-wire wrapped-key conversion', () => {
  const key: WrappedKey = {
    algorithm: 'xchacha20poly1305-ietf',
    nonce: new Uint8Array(24).fill(3),
    ciphertext: new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
  }

  it('round-trips a wrapped key through its wire form', () => {
    expect(wireToWrappedKey(wrappedKeyToWire(key))).toEqual(key)
  })

  it('encodes binary fields as base64 on the wire', () => {
    const wire = wrappedKeyToWire(key)
    expect(wire.algorithm).toBe('xchacha20poly1305-ietf')
    expect(wire.nonce).toBe(Buffer.from(key.nonce).toString('base64'))
    expect(wire.ciphertext).toBe(Buffer.from(key.ciphertext).toString('base64'))
  })
})

describe('vault-wire KDF params conversion', () => {
  const params: KDFParams = {
    algorithm: 'argon2id',
    opsLimit: 3,
    memLimitBytes: 67_108_864,
    keyLengthBytes: 32,
  }

  it('round-trips params through the snake_case wire form', () => {
    expect(wireToKdfParams(kdfParamsToWire(params))).toEqual(params)
  })

  it('maps camelCase to snake_case', () => {
    expect(kdfParamsToWire(params)).toEqual({
      algorithm: 'argon2id',
      ops_limit: 3,
      mem_limit_bytes: 67_108_864,
      key_length_bytes: 32,
    })
  })
})
