import { createHash } from 'node:crypto'
import type { AppLogger } from '../logger'

/**
 * Breached-password screening via the Have I Been Pwned "Pwned Passwords" range API,
 * using k-anonymity (CLAUDE.md §2.13, ASVS 2.1.7 / threat-model O11).
 *
 * The full password never leaves the server: we SHA-1 it, send only the first 5 hex chars
 * of the digest to `api.pwnedpasswords.com/range/<prefix>`, and match the returned suffix
 * list locally. The API needs no key and honours `Add-Padding: true` so response size can't
 * hint at the prefix's real hit count.
 *
 * **Fail-open by design.** A breach-screen outage must never block a legitimate signup or
 * reset — availability outranks this defence-in-depth check. On any error, non-2xx, or
 * timeout we log a warning and treat the password as not-breached.
 */

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range'
const REQUEST_TIMEOUT_MS = 2500

export interface BreachedPasswordChecker {
  /** True when the password appears in a known breach corpus. Fail-open ⇒ false on error. */
  isBreached(password: string): Promise<boolean>
}

export interface HibpCheckerOptions {
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch
  /** Optional logger for the fail-open warning. */
  readonly logger?: Pick<AppLogger, 'warn'>
}

/** Build the production HIBP-backed checker. Inject `fetchImpl` in tests to avoid the network. */
export function createHibpChecker(opts: HibpCheckerOptions = {}): BreachedPasswordChecker {
  const doFetch = opts.fetchImpl ?? fetch
  return {
    async isBreached(password: string): Promise<boolean> {
      const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
      const prefix = sha1.slice(0, 5)
      const suffix = sha1.slice(5)

      const controller = new AbortController()
      const timer = setTimeout(() => {
        controller.abort()
      }, REQUEST_TIMEOUT_MS)
      try {
        const res = await doFetch(`${HIBP_RANGE_URL}/${prefix}`, {
          headers: { 'Add-Padding': 'true' },
          signal: controller.signal,
        })
        if (!res.ok) return false
        const body = await res.text()
        for (const line of body.split('\n')) {
          const idx = line.indexOf(':')
          if (idx === -1) continue
          if (line.slice(0, idx).trim().toUpperCase() !== suffix) continue
          // `Add-Padding` injects decoy rows with count 0; a real hit has count > 0.
          const count = Number.parseInt(line.slice(idx + 1).trim(), 10)
          return Number.isFinite(count) && count > 0
        }
        return false
      } catch (err) {
        opts.logger?.warn({ err }, 'breached-password check failed; failing open')
        return false
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
