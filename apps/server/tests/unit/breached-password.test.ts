import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createHibpChecker } from '../../src/auth/breached-password'

/**
 * Unit tests for the HIBP k-anonymity breached-password checker (ASVS 2.1.7 / O11). No
 * network: a fake `fetch` returns canned range-API bodies. Covers a hit, a miss, padding
 * decoys (count 0), and the mandatory fail-open behaviour on error / non-2xx.
 */

/** The 35-char SHA-1 suffix the checker will look for, for a given password. */
function suffixFor(password: string): string {
  return createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase().slice(5)
}

/** A fake `fetch` that returns `body` with status 200 (or a custom status). */
function fakeFetch(body: string, ok = true): typeof fetch {
  return (() =>
    Promise.resolve({
      ok,
      text: () => Promise.resolve(body),
    } as Response)) as unknown as typeof fetch
}

describe('createHibpChecker.isBreached', () => {
  it('returns true when the suffix appears with a non-zero count', async () => {
    const pw = 'password'
    const body = `${suffixFor(pw)}:1927`
    const checker = createHibpChecker({ fetchImpl: fakeFetch(body) })
    expect(await checker.isBreached(pw)).toBe(true)
  })

  it('returns false when the suffix is not in the range response', async () => {
    const checker = createHibpChecker({
      fetchImpl: fakeFetch('0000000000000000000000000000000000A:5'),
    })
    expect(await checker.isBreached('a-very-unique-passphrase-xyz')).toBe(false)
  })

  it('ignores Add-Padding decoy rows (count 0)', async () => {
    const pw = 'hunter2'
    // The real suffix is present but padded to count 0 — must NOT count as breached.
    const body = `${suffixFor(pw)}:0\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0`
    const checker = createHibpChecker({ fetchImpl: fakeFetch(body) })
    expect(await checker.isBreached(pw)).toBe(false)
  })

  it('fails open (returns false) on a non-2xx response', async () => {
    const checker = createHibpChecker({ fetchImpl: fakeFetch('', false) })
    expect(await checker.isBreached('password')).toBe(false)
  })

  it('fails open (returns false) when fetch throws', async () => {
    const throwing = (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch
    const checker = createHibpChecker({ fetchImpl: throwing })
    expect(await checker.isBreached('password')).toBe(false)
  })
})
