/**
 * Small wrapper over Electron `safeStorage` for encrypting at-rest secrets that must
 * live somewhere non-keychain (e.g. the SQLite `settings` table) — P1 security.
 *
 * `safeStorage` is OS-backed (DPAPI on Windows, Keychain on macOS, libsecret on
 * Linux) and available once the app is `ready`. When no backend exists (some Linux
 * setups) it reports unavailable; we then fall back to storing PLAINTEXT so the
 * feature keeps working, and the caller decides whether that's acceptable (for the
 * loopback-only MT5 pairing token it is — the socket binds 127.0.0.1). Secrets are
 * wrapped in a versioned envelope so the on-disk format can evolve and legacy values
 * are detectable.
 */
import { safeStorage } from 'electron'

/** Versioned at-rest secret. Exactly one of `enc` (base64 ciphertext) / `plain` is set. */
export interface SecretEnvelope {
  readonly v: 1
  readonly enc?: string
  readonly plain?: string
}

/** Encrypt `plaintext` into an envelope, or wrap it plainly if encryption is unavailable. */
export function sealSecret(plaintext: string): SecretEnvelope {
  if (safeStorage.isEncryptionAvailable()) {
    return { v: 1, enc: safeStorage.encryptString(plaintext).toString('base64') }
  }
  return { v: 1, plain: plaintext }
}

/** Recover the plaintext from an envelope, or `null` if it can't be decrypted. */
export function openSecret(envelope: SecretEnvelope): string | null {
  if (typeof envelope.enc === 'string') {
    try {
      return safeStorage.decryptString(Buffer.from(envelope.enc, 'base64'))
    } catch {
      return null
    }
  }
  return envelope.plain ?? null
}

/** Type guard: is `v` a versioned {@link SecretEnvelope} (vs a legacy raw value)? */
export function isSecretEnvelope(v: unknown): v is SecretEnvelope {
  return typeof v === 'object' && v !== null && (v as { v?: unknown }).v === 1
}
