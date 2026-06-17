import { describe, expect, it, vi } from 'vitest'
import { HttpCore, type FetchImpl } from './http-core'
import { triggerUpgrade, useUpgradePrompt } from './upgrade-store'

/**
 * Upgrade-prompt tests (task §5). A paid (cloud-sync) action that hits a 402 must open the
 * upgrade modal AND still return the error to the caller (honest failure). Verifies both
 * the store's `details → upgrade_url` extraction and HttpCore's `onUpgradeRequired` firing.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('triggerUpgrade', () => {
  it('opens the modal with the server-provided upgrade_url', () => {
    useUpgradePrompt.setState({ open: false, upgradeUrl: '/pricing' })
    triggerUpgrade({ code: 'UPGRADE_REQUIRED', upgrade_url: 'https://cairn.app/pricing' })
    const s = useUpgradePrompt.getState()
    expect(s.open).toBe(true)
    expect(s.upgradeUrl).toBe('https://cairn.app/pricing')
  })

  it('falls back to the in-app /pricing route when details carry no url', () => {
    useUpgradePrompt.setState({ open: false, upgradeUrl: 'https://stale' })
    triggerUpgrade(undefined)
    const s = useUpgradePrompt.getState()
    expect(s.open).toBe(true)
    expect(s.upgradeUrl).toBe('/pricing')
  })
})

describe('HttpCore onUpgradeRequired', () => {
  it('fires the hook on a 402 UPGRADE_REQUIRED and still returns the error', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(402, {
        ok: false,
        error: {
          code: 'UPGRADE_REQUIRED',
          message: 'cloud sync requires Cairn Pro',
          details: { code: 'UPGRADE_REQUIRED', upgrade_url: 'https://cairn.app/pricing' },
        },
      }),
    ) as unknown as FetchImpl

    const onUpgradeRequired = vi.fn()
    const core = new HttpCore({
      baseUrl: 'https://api.test',
      fetchImpl,
      readCsrfToken: () => null,
      onUpgradeRequired,
    })
    core.setAccessToken('token')

    const res = await core.call('POST', '/vault/push', { ops: [] })

    expect(onUpgradeRequired).toHaveBeenCalledTimes(1)
    expect(onUpgradeRequired).toHaveBeenCalledWith({
      code: 'UPGRADE_REQUIRED',
      upgrade_url: 'https://cairn.app/pricing',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('UPGRADE_REQUIRED')
  })

  it('does not fire the hook on an ordinary error', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'nope' } }),
    ) as unknown as FetchImpl
    const onUpgradeRequired = vi.fn()
    const core = new HttpCore({
      baseUrl: 'https://api.test',
      fetchImpl,
      readCsrfToken: () => null,
      onUpgradeRequired,
    })
    core.setAccessToken('token')

    await core.call('GET', '/vault/key')
    expect(onUpgradeRequired).not.toHaveBeenCalled()
  })
})
