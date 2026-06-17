import { useEffect } from 'react'
import { useToast } from '../../components/ui'
import { eventBus } from '../../lib/event-bus'

/**
 * Bridges main-process sync notifications to the toast UI (CLAUDE.md §18.6).
 *
 * The sync runner emits `{ level, code, message }` over the `sync:toast` event when it
 * pauses, backs off, or hits an auth/key problem. This component (mounted inside the
 * ToastProvider) surfaces those as toasts. The payload carries only a status level, a code,
 * and pre-written copy — never any vault content.
 *
 * The paywall code (`SYNC_UPGRADE_REQUIRED`, a 402) is handled by {@link SyncUpgradePrompt}
 * as a modal with an Upgrade action, so it is skipped here to avoid a redundant toast.
 */

/** Mirror of `SYNC_ERROR_CODES.UPGRADE_REQUIRED` (electron/services/sync/types.ts). */
const SYNC_UPGRADE_REQUIRED = 'SYNC_UPGRADE_REQUIRED'

export function SyncToasts() {
  const toast = useToast()
  useEffect(() => {
    return eventBus.on('sync:toast', (payload) => {
      if (payload.code === SYNC_UPGRADE_REQUIRED) return
      toast(payload.message, payload.level)
    })
  }, [toast])
  return null
}
