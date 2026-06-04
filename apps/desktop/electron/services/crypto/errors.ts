import type { CryptoErrorCode } from '@cairn/shared-types'

/**
 * A typed error raised by the crypto layer. Internal helpers throw `CryptoError`;
 * the IPC/HTTP boundary catches it and maps `.code` to a `Result` error
 * (CLAUDE.md §19.4). The message is for developers/logs — never user-facing, and
 * never contains key material, nonces, or plaintext (CLAUDE.md §19.9).
 */
export class CryptoError extends Error {
  readonly code: CryptoErrorCode

  constructor(code: CryptoErrorCode, message: string) {
    super(message)
    this.name = 'CryptoError'
    this.code = code
    // Restore the prototype chain so `instanceof CryptoError` holds after the
    // class is transpiled to an ES5/ES2022 target (TS extends-builtin caveat).
    Object.setPrototypeOf(this, CryptoError.prototype)
  }
}
