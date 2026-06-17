import { entropyToMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

import { CryptoError } from './errors'
import {
  RECOVERY_ENTROPY_BYTES,
  RECOVERY_KDF_PARAMS,
  RECOVERY_KDF_SALT,
  RECOVERY_PHRASE_WORD_COUNT,
} from './params'
import { getSodium, initCrypto } from './sodium'
import type { RecoveryPhrase } from '@cairn/shared-types'

/** Normalise a phrase to the canonical lowercase single-space form BIP-39 expects. */
function normalizePhrase(phrase: readonly string[]): string {
  return phrase.map((w) => w.trim().toLowerCase()).join(' ')
}

/**
 * Generate a fresh 24-word BIP-39 recovery phrase from 256 bits of libsodium CSPRNG
 * entropy. Shown to the user exactly once at signup; Cairn never stores the phrase,
 * only the data key wrapped under the phrase-derived KEK. See `docs/security.md` §5.
 *
 * Requires {@link initCrypto} to have completed (it draws from libsodium's CSPRNG).
 *
 * @returns `{ phrase, entropy }` — `phrase` is exactly 24 words.
 */
export function generateRecoveryPhrase(): RecoveryPhrase {
  const entropy = getSodium().randombytes_buf(RECOVERY_ENTROPY_BYTES)
  const phrase = entropyToMnemonic(entropy, wordlist).split(' ')
  // Invariant: 32 bytes of entropy always encodes to exactly 24 words. Assert rather
  // than assume, so any future change to entropy size fails loudly here.
  if (phrase.length !== RECOVERY_PHRASE_WORD_COUNT) {
    throw new CryptoError(
      'INVALID_RECOVERY_PHRASE',
      `expected ${RECOVERY_PHRASE_WORD_COUNT} words, generated ${phrase.length}`,
    )
  }
  return { phrase, entropy }
}

/**
 * Re-derive the recovery KEK from a recovery phrase.
 *
 * The phrase is validated (word count + BIP-39 checksum) *before* any key derivation;
 * an invalid or mistyped phrase throws `INVALID_RECOVERY_PHRASE` and never reaches the
 * KDF. A valid phrase is run through a deliberately separate Argon2id configuration
 * ({@link RECOVERY_KDF_PARAMS} + {@link RECOVERY_KDF_SALT}) so the recovery KEK is
 * domain-separated from the password KEK. See `docs/security.md` §3.2, §5.
 *
 * @throws CryptoError `INVALID_RECOVERY_PHRASE` if the phrase is the wrong length or
 *   fails its checksum.
 */
export async function keyFromRecoveryPhrase(phrase: readonly string[]): Promise<Uint8Array> {
  await initCrypto()
  if (phrase.length !== RECOVERY_PHRASE_WORD_COUNT) {
    throw new CryptoError(
      'INVALID_RECOVERY_PHRASE',
      `recovery phrase must be ${RECOVERY_PHRASE_WORD_COUNT} words, got ${phrase.length}`,
    )
  }
  const mnemonic = normalizePhrase(phrase)
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new CryptoError('INVALID_RECOVERY_PHRASE', 'recovery phrase failed BIP-39 checksum')
  }
  const s = getSodium()
  return s.crypto_pwhash(
    RECOVERY_KDF_PARAMS.keyLengthBytes,
    mnemonic,
    RECOVERY_KDF_SALT,
    RECOVERY_KDF_PARAMS.opsLimit,
    RECOVERY_KDF_PARAMS.memLimitBytes,
    s.crypto_pwhash_ALG_ARGON2ID13,
  )
}
