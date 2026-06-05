// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'

import { adFor, decodeCiphertext, encodeCiphertext } from '../../../electron/services/sync'
import {
  decryptRecord,
  encryptRecord,
  generateDataKey,
  initCrypto,
  NONCE_BYTES,
} from '../../../electron/services/crypto'
import type { EncryptedRecord } from '@cairn/shared-types'

beforeAll(async () => {
  await initCrypto()
})

describe('adFor', () => {
  it('builds UTF-8 "table:record_id" associated data', () => {
    expect(new TextDecoder().decode(adFor('trades', 'abc'))).toBe('trades:abc')
  })
})

describe('encodeCiphertext / decodeCiphertext', () => {
  it('round-trips an EncryptedRecord through the base64 wire form', () => {
    const record: EncryptedRecord = {
      algorithm: 'xchacha20poly1305-ietf',
      nonce: new Uint8Array(NONCE_BYTES).fill(7),
      ciphertext: new Uint8Array([1, 2, 3, ...new Array<number>(16).fill(9)]),
    }
    const decoded = decodeCiphertext(encodeCiphertext(record))
    expect([...decoded.nonce]).toEqual([...record.nonce])
    expect([...decoded.ciphertext]).toEqual([...record.ciphertext])
  })

  it('decode → decrypt recovers the plaintext (full crypto path)', () => {
    const key = generateDataKey()
    const ad = adFor('trades', 'abc')
    const plaintext = new TextEncoder().encode('{"r":2}')
    const wire = encodeCiphertext(encryptRecord(plaintext, key, ad))
    const recovered = decryptRecord(decodeCiphertext(wire), key, ad)
    expect(new TextDecoder().decode(recovered)).toBe('{"r":2}')
  })

  it('throws loudly on a truncated blob (shorter than nonce + tag)', () => {
    const tooShort = Buffer.from(new Uint8Array(NONCE_BYTES + 4)).toString('base64')
    expect(() => decodeCiphertext(tooShort)).toThrow(RangeError)
  })
})
