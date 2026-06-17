import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentryInit = vi.fn()
const sentrySetUser = vi.fn()
vi.mock('@sentry/electron/renderer', () => ({
  init: sentryInit,
  setUser: sentrySetUser,
}))

const settingsGet = vi.fn()
vi.mock('../../../src/lib/ipc', () => ({
  ipc: { settings: { get: settingsGet } },
}))

beforeEach(() => {
  vi.resetModules()
  sentryInit.mockClear()
  sentrySetUser.mockClear()
  settingsGet.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('renderer telemetry — opted out (default)', () => {
  it('does not init Sentry or set a user when telemetry.optIn is not true', async () => {
    settingsGet.mockResolvedValue({ ok: true, data: false })
    const { initRendererTelemetry, setTelemetryUser } = await import('../../../src/lib/telemetry')

    await initRendererTelemetry()
    await setTelemetryUser('a@b.com')

    expect(sentryInit).not.toHaveBeenCalled()
    expect(sentrySetUser).not.toHaveBeenCalled()
  })

  it('stays a no-op if the settings IPC call fails', async () => {
    settingsGet.mockResolvedValue({ ok: false, error: { code: 'INTERNAL', message: 'boom' } })
    const { initRendererTelemetry, setTelemetryUser } = await import('../../../src/lib/telemetry')

    await initRendererTelemetry()
    await setTelemetryUser('a@b.com')

    expect(sentryInit).not.toHaveBeenCalled()
    expect(sentrySetUser).not.toHaveBeenCalled()
  })
})

describe('renderer telemetry — opted in', () => {
  it('inits Sentry once and attaches a salted-hash user.id, normalized by case', async () => {
    settingsGet.mockResolvedValue({ ok: true, data: true })
    const { initRendererTelemetry, setTelemetryUser } = await import('../../../src/lib/telemetry')

    await initRendererTelemetry()
    await initRendererTelemetry()
    expect(sentryInit).toHaveBeenCalledTimes(1)

    await setTelemetryUser('A@B.com')
    expect(sentrySetUser).toHaveBeenCalledTimes(1)
    const [arg] = sentrySetUser.mock.calls[0] as [{ id: string }]
    expect(arg.id).toMatch(/^[0-9a-f]{64}$/)

    await setTelemetryUser('a@b.com')
    const [arg2] = sentrySetUser.mock.calls[1] as [{ id: string }]
    expect(arg2.id).toBe(arg.id)
  })

  it('clears the Sentry user on logout (null email)', async () => {
    settingsGet.mockResolvedValue({ ok: true, data: true })
    const { initRendererTelemetry, setTelemetryUser } = await import('../../../src/lib/telemetry')

    await initRendererTelemetry()
    await setTelemetryUser(null)

    expect(sentrySetUser).toHaveBeenCalledWith(null)
  })
})
