import { getSodium, isCryptoReady } from './sodium'

/**
 * Best-effort in-place wipe of secret bytes (CLAUDE.md §2.13 memory hygiene).
 *
 * Used by the web client to zero out the unwrapped data key / KEK on logout so the
 * plaintext key does not linger in a reachable `Uint8Array` (`docs/security.md` §6).
 * Prefers libsodium's constant-time `memzero`; if libsodium is not yet initialised it
 * falls back to a manual `fill(0)`. Note: neither can guarantee the JS engine did not
 * already copy the buffer (GC, string coercion) — it minimises, not eliminates, the
 * window, which is the realistic guarantee in a managed runtime.
 *
 * No-op on a zero-length array. Safe to call repeatedly.
 */
export function memzero(bytes: Uint8Array): void {
  if (bytes.length === 0) return
  if (isCryptoReady()) {
    getSodium().memzero(bytes)
    return
  }
  bytes.fill(0)
}
