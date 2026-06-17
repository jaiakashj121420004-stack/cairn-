// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `electron/services/telemetry.ts` imports `getDb`/`schema` for `isTelemetryEnabled`
// (used only by `initMainTelemetry`, which these tests never call) and
// `@sentry/electron/main` for `Sentry.init`/`Sentry.setUser`. Stub both so this test
// never touches SQLite or makes a network call.
vi.mock('../../../electron/db/index', () => ({ getDb: vi.fn() }))
vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
}))

import * as Sentry from '@sentry/electron/main'
import { hashUserId, setTelemetryUser } from '../../../electron/services/telemetry'

const sentrySetUser = vi.mocked(Sentry.setUser)

describe('hashUserId', () => {
  it('is deterministic for the same email', () => {
    expect(hashUserId('a@b.com')).toBe(hashUserId('a@b.com'))
  })

  it('normalizes case and surrounding whitespace', () => {
    expect(hashUserId('A@B.com')).toBe(hashUserId('a@b.com'))
    expect(hashUserId('  a@b.com  ')).toBe(hashUserId('a@b.com'))
  })

  it('produces different hashes for different emails', () => {
    expect(hashUserId('a@b.com')).not.toBe(hashUserId('c@d.com'))
  })

  it('returns a 64-char hex SHA-256 digest', () => {
    expect(hashUserId('a@b.com')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('setTelemetryUser (telemetry disabled — the default)', () => {
  beforeEach(() => {
    sentrySetUser.mockClear()
  })

  it('never calls Sentry when telemetry was not initialised (opt-out default)', () => {
    setTelemetryUser('a@b.com')
    setTelemetryUser(null)
    expect(sentrySetUser).not.toHaveBeenCalled()
  })
})
