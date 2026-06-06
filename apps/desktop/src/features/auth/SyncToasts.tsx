import { useEffect } from 'react'
import { useToast } from '../../components/ui'

/**
 * Bridges main-process sync notifications to the toast UI (CLAUDE.md §18.6).
 *
 * The sync runner emits `{ level, code, message }` over the `sync:toast` event when it
 * pauses, backs off, or hits an auth/key problem. This component (mounted inside the
 * ToastProvider) surfaces those as toasts. The payload carries only a status level, a code,
 * and pre-written copy — never any vault content.
 */

interface SyncToast {
  level: 'error' | 'warning' | 'info'
  code: string
  message: string
}

function isSyncToast(payload: unknown): payload is SyncToast {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    'level' in payload &&
    'message' in payload &&
    typeof (payload as SyncToast).message === 'string'
  )
}

export function SyncToasts() {
  const toast = useToast()
  useEffect(() => {
    return window.api.events.on('sync:toast', (payload) => {
      if (isSyncToast(payload)) toast(payload.message, payload.level)
    })
  }, [toast])
  return null
}
