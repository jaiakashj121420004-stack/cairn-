import { checkoutInputSchema, cancelInputSchema } from '@cairn/shared-zod'
import { ipcMain, shell } from 'electron'
import log from 'electron-log'
import { getBillingClient } from '../services/billing'
import { getSessionStore } from '../services/session'
import type { IpcResponse } from '../../shared/types/index'
import type { Result } from '@cairn/shared-types'
import type { BillingStatusOutput, CheckoutOutput, CancelOutput } from '@cairn/shared-zod'

/**
 * Billing IPC (CLAUDE.md §20, docs/billing.md). The renderer drives the main-process
 * {@link BillingClient}, which owns the Bearer token via the {@link SessionStore}. The
 * renderer only ever sends a country + interval (geo-detected / a dropdown) — the SERVER
 * routes to the regional gateway (§20.9). Sync is optional and account-gated, so a
 * signed-out app never reaches any of this and the local journal is unaffected.
 *
 * `checkout` / `portal` return the provider-hosted URL AND open it in the user's default
 * browser (`shell.openExternal`) — the hosted payment page must never render inside the
 * Electron window. The canonical subscription state always lives in the server's
 * `subscription` table (webhook-written); `status` reads it, no provider call (§2.14).
 */

export function registerBillingHandlers(): void {
  // ── billing:status ────────────────────────────────────────────────────────────
  ipcMain.handle('billing:status', async (): Promise<IpcResponse<BillingStatusOutput>> => {
    return withToken((token) => getBillingClient().status(token))
  })

  // ── billing:checkout ──────────────────────────────────────────────────────────
  ipcMain.handle('billing:checkout', async (_e, raw): Promise<IpcResponse<CheckoutOutput>> => {
    const parsed = checkoutInputSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'invalid checkout input' } }
    }
    const res = await withToken((token) => getBillingClient().checkout(parsed.data, token))
    if (res.ok) await openExternal(res.data.url)
    return res
  })

  // ── billing:portal ──────────────────────────────────────────────────────────────
  ipcMain.handle('billing:portal', async (): Promise<IpcResponse<CheckoutOutput>> => {
    const res = await withToken((token) => getBillingClient().portal(token))
    if (res.ok) await openExternal(res.data.url)
    return res
  })

  // ── billing:cancel ──────────────────────────────────────────────────────────────
  ipcMain.handle('billing:cancel', async (_e, raw): Promise<IpcResponse<CancelOutput>> => {
    const parsed = cancelInputSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'invalid cancel input' } }
    }
    return withToken((token) => getBillingClient().cancel(parsed.data.when, token))
  })
}

/**
 * Run a billing call with the current access token, refreshing once and retrying if the
 * server rejected the first attempt as unauthenticated (the ≤15-minute access token may
 * have expired). Returns `UNAUTHENTICATED` when there is no session at all — the renderer
 * maps that to "sign in to manage billing".
 */
async function withToken<T>(fn: (token: string) => Promise<Result<T>>): Promise<Result<T>> {
  const store = getSessionStore()
  const token = store.getAccessToken()
  if (token === null) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'sign in to manage billing' } }
  }
  const first = await fn(token)
  if (first.ok || first.error.code !== 'UNAUTHENTICATED') return first
  const refreshed = await store.refresh()
  if (refreshed === null) return first
  return fn(refreshed)
}

/** Open a hosted provider URL in the OS browser; a failure here is logged, never thrown. */
async function openExternal(url: string): Promise<void> {
  try {
    await shell.openExternal(url)
  } catch (e) {
    log.warn('[billing] failed to open external url', e instanceof Error ? e.message : 'unknown')
  }
}
