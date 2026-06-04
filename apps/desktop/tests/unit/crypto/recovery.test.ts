// @vitest-environment node
import { validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  CryptoError,
  deriveKEK,
  generateRecoveryPhrase,
  initCrypto,
  keyFromRecoveryPhrase,
} from '../../../electron/services/crypto'
import { RECOVERY_KDF_SALT } from '../../../electron/services/crypto/params'
import { getSodium } from '../../../electron/services/crypto/sodium'

beforeAll(async () => {
  await initCrypto()
})

const hex = (b: Uint8Array): string => getSodium().to_hex(b)

describe('generateRecoveryPhrase', () => {
  it('returns exactly 24 valid BIP-39 words encoding 32 bytes of entropy', () => {
    const { phrase, entropy } = generateRecoveryPhrase()
    expect(phrase).toHaveLength(24)
    expect(entropy).toHaveLength(32)
    expect(validateMnemonic(phrase.join(' '), wordlist)).toBe(true)
  })

  it('every word comes from the BIP-39 English wordlist', () => {
    const { phrase } = generateRecoveryPhrase()
    for (const word of phrase) {
      expect(wordlist).toContain(word)
    }
  })

  it('produces fresh entropy on each call', () => {
    const a = generateRecoveryPhrase()
    const b = generateRecoveryPhrase()
    expect(hex(a.entropy)).not.toBe(hex(b.entropy))
  })
})

describe('keyFromRecoveryPhrase', () => {
  it('is deterministic: the same phrase always derives the same 32-byte KEK', async () => {
    const { phrase } = generateRecoveryPhrase()
    const a = await keyFromRecoveryPhrase(phrase)
    const b = await keyFromRecoveryPhrase(phrase)
    expect(hex(a)).toBe(hex(b))
    expect(a).toHaveLength(32)
  })

  it('is case- and whitespace-insensitive (normalised before validation)', async () => {
    const { phrase } = generateRecoveryPhrase()
    const canonical = await keyFromRecoveryPhrase(phrase)
    const messy = phrase.map((w, i) => (i % 2 === 0 ? `  ${w.toUpperCase()} ` : w))
    const fromMessy = await keyFromRecoveryPhrase(messy)
    expect(hex(fromMessy)).toBe(hex(canonical))
  })

  it('different phrases derive different KEKs', async () => {
    const a = await keyFromRecoveryPhrase(generateRecoveryPhrase().phrase)
    const b = await keyFromRecoveryPhrase(generateRecoveryPhrase().phrase)
    expect(hex(a)).not.toBe(hex(b))
  })

  it('REFUSES a phrase that is not 24 words (INVALID_RECOVERY_PHRASE)', async () => {
    const { phrase } = generateRecoveryPhrase()
    await expect(keyFromRecoveryPhrase(phrase.slice(0, 12))).rejects.toMatchObject({
      code: 'INVALID_RECOVERY_PHRASE',
    })
  })

  it('REFUSES a phrase that fails the BIP-39 checksum', async () => {
    const { phrase } = generateRecoveryPhrase()
    // Swap the first word for a different valid wordlist word — breaks the checksum
    // with overwhelming probability while keeping 24 valid words.
    const broken = [...phrase]
    broken[0] = broken[0] === 'abandon' ? 'ability' : 'abandon'
    await expect(keyFromRecoveryPhrase(broken)).rejects.toBeInstanceOf(CryptoError)
  })
})

describe('domain separation: recovery-phrase path ≠ password path', () => {
  it('the same string yields a different KEK via the phrase KDF than via the password KDF', async () => {
    // Build a valid 24-word phrase, then feed its exact string to deriveKEK using the
    // recovery salt. Because the two paths use distinct Argon2id configs (different
    // opslimit) the resulting KEKs must differ even with identical input + salt.
    const { phrase } = generateRecoveryPhrase()
    const mnemonic = phrase.join(' ')
    const viaRecovery = await keyFromRecoveryPhrase(phrase)
    const viaPassword = await deriveKEK(mnemonic, RECOVERY_KDF_SALT)
    expect(hex(viaRecovery)).not.toBe(hex(viaPassword))
  })
})
