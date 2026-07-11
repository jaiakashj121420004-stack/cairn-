// @vitest-environment node
//
// P1 security hardening — three pure guards:
//   - assertZipEntriesContained: zip-slip / path-traversal guard on backup restore.
//   - assertSafeApiUrl: https-in-packaged enforcement for the backend base URL.
//   - isAllowedSettingKey: settings:set key allow-list.

import { describe, expect, it } from 'vitest'
import { assertZipEntriesContained } from '../../../electron/services/backup-zip-safety'
import { assertSafeApiUrl } from '../../../electron/services/session/api-url'
import { SETTING_KEYS, isAllowedSettingKey } from '../../../electron/ipc/settings-keys'

describe('assertZipEntriesContained (zip-slip guard)', () => {
  const dest = 'restore-root'

  it('allows entries that stay within the target dir', () => {
    expect(() =>
      assertZipEntriesContained(
        ['journal.db', 'metadata.json', 'screenshots/', 'screenshots/a.png'],
        dest,
      ),
    ).not.toThrow()
  })

  it('rejects a parent-traversal entry', () => {
    expect(() => assertZipEntriesContained(['../evil.db'], dest)).toThrow(/escapes target/)
  })

  it('rejects nested traversal that climbs out', () => {
    expect(() => assertZipEntriesContained(['screenshots/../../evil'], dest)).toThrow(
      /escapes target/,
    )
  })

  it('rejects an absolute-path entry', () => {
    expect(() => assertZipEntriesContained(['/etc/passwd'], dest)).toThrow(/escapes target/)
  })

  it('rejects if any one entry in a set escapes', () => {
    expect(() => assertZipEntriesContained(['journal.db', '../oops'], dest)).toThrow(/escapes/)
  })
})

describe('assertSafeApiUrl (https-in-packaged)', () => {
  it('allows anything in dev (not packaged)', () => {
    expect(() => assertSafeApiUrl('http://evil.example.com', false)).not.toThrow()
  })

  it('allows https in packaged builds', () => {
    expect(() => assertSafeApiUrl('https://api.cairn.app', true)).not.toThrow()
  })

  it('allows loopback http in packaged builds (local backend)', () => {
    expect(() => assertSafeApiUrl('http://localhost:3000', true)).not.toThrow()
    expect(() => assertSafeApiUrl('http://127.0.0.1:3000', true)).not.toThrow()
  })

  it('rejects remote http in packaged builds', () => {
    expect(() => assertSafeApiUrl('http://api.cairn.app', true)).toThrow(/https/)
  })

  it('rejects a malformed URL in packaged builds', () => {
    expect(() => assertSafeApiUrl('not a url', true)).toThrow(/valid URL/)
  })
})

describe('isAllowedSettingKey (settings:set allow-list)', () => {
  it('allows known renderer-written keys', () => {
    for (const key of ['theme', 'onboarding_completed', 'r_alerts', 'broker.auto_log_mode']) {
      expect(isAllowedSettingKey(key)).toBe(true)
    }
  })

  it('rejects unknown / injected keys', () => {
    expect(isAllowedSettingKey('evil_key')).toBe(false)
    expect(isAllowedSettingKey('../../etc/passwd')).toBe(false)
    expect(isAllowedSettingKey('')).toBe(false)
  })

  it('does not expose main-process-only keys to the renderer', () => {
    // The MT5 pairing token is written by main-process code directly, never via the
    // settings:set IPC, so it must NOT be in the renderer allow-list.
    expect(isAllowedSettingKey('broker.mt5.pairing_token')).toBe(false)
    expect(SETTING_KEYS.has('broker.mt5.pairing_token')).toBe(false)
  })
})
