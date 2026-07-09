import { ERROR_CODES, err, ok, type Result, type Transport } from '@cairn/shared-types'
import type {
  Procedures,
  SyncNowResult,
  SyncStatusResult,
  UnlockVaultResult,
  VaultStatus,
} from '@shared/types/index'
import { HttpCore } from './http-core'
import { triggerUpgrade } from './upgrade-store'
import { VaultCache } from './vault-cache'
import { WebVault } from './web-vault'

/**
 * The web client's `Transport` (CLAUDE.md §3.6, §18.7, task §2). Aliased in over the
 * desktop's `@/lib/transport` seam (see vite.config.ts), so every reused feature in
 * `apps/desktop/src/features/**` calls `ipc.*` unchanged and lands here instead of IPC.
 *
 * Routing:
 *  - `vault:*` / `sync:*` are served by {@link WebVault} over HTTP, with client-side
 *    decryption into IndexedDB.
 *  - Auth is owned by the session controller (`session.ts`) which talks to {@link core}
 *    directly; the few `auth:*` procedures are mapped here for any feature that uses them.
 *  - Local trading-data procedures (trades, accounts, analytics, …) have NO server
 *    endpoint — on desktop they hit local SQLite. On web they must read the decrypted
 *    IndexedDB vault through the storage-agnostic data layer, which is the next stage.
 *    Until that lands they return a typed `NOT_IMPLEMENTED` rather than silently wrong
 *    numbers — honesty over a fake green (CLAUDE.md §2.12).
 */

const API_ORIGIN =
  (import.meta.env['VITE_API_ORIGIN'] as string | undefined) ?? 'http://localhost:8787'

export const core = new HttpCore({
  baseUrl: API_ORIGIN,
  onAuthLost: () => {
    // The session store subscribes to this to route the user back to /login.
    authLostListeners.forEach((fn) => {
      fn()
    })
  },
  // A paywall response (a /vault/* 402) opens the upgrade modal (task §5).
  onUpgradeRequired: triggerUpgrade,
})

const cache = new VaultCache()
export const vault = new WebVault(core, cache)

const authLostListeners = new Set<() => void>()
export function onAuthLost(fn: () => void): () => void {
  authLostListeners.add(fn)
  return () => authLostListeners.delete(fn)
}

const NOT_AVAILABLE =
  'This view needs the local trading-data layer, which is not yet wired to the in-browser vault on web.'

/** Untyped router; cast once to the precise `Transport<Procedures>['call']` below. */
async function route(name: keyof Procedures & string, input: unknown): Promise<Result<unknown>> {
  switch (name) {
    case 'ping':
      return ok('pong')

    case 'vault:status': {
      const status: VaultStatus = {
        unlocked: vault.isUnlocked(),
        needsPassword: !vault.isUnlocked(),
      }
      return ok(status)
    }
    case 'vault:unlock': {
      const { password } = input as { password: string }
      const res = await vault.unlock(password)
      if (!res.ok) return res
      const out: UnlockVaultResult = { enrolled: true }
      return ok(out)
    }
    case 'vault:recover': {
      const { phrase } = input as { phrase: readonly string[]; newPassword: string }
      const res = await vault.recover(phrase)
      if (!res.ok) return res
      const out: UnlockVaultResult = { enrolled: true }
      return ok(out)
    }
    case 'vault:lock': {
      vault.lock()
      return ok(undefined)
    }

    case 'sync:now': {
      const res = await vault.pull()
      if (!res.ok) return res
      const out: SyncNowResult = { kind: 'pulled', opCount: res.data.applied }
      return ok(out)
    }
    case 'sync:status': {
      const out: SyncStatusResult = { configured: vault.isUnlocked(), paused: false }
      return ok(out)
    }

    default:
      return err(ERROR_CODES.NOT_IMPLEMENTED, `${name}: ${NOT_AVAILABLE}`)
  }
}

export const transport: Transport<Procedures> = {
  call: route as Transport<Procedures>['call'],
}
