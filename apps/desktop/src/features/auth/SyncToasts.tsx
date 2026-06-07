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
 */

export function SyncToasts() {
  const toast = useToast()
  useEffect(() => {
    return eventBus.on('sync:toast', (payload) => {
      toast(payload.message, payload.level)
    })
  }, [toast])
  return null
}
