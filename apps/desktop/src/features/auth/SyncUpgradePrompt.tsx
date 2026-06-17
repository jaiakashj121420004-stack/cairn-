import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { Modal } from '../../components/ui/Modal'
import { eventBus } from '../../lib/event-bus'
import { useUiStore } from '../../stores/ui-store'

/**
 * Desktop upgrade prompt for a cloud-sync paywall (CLAUDE.md §2.14, §20, task §5).
 *
 * When `/vault/push` (or pull) returns 402, the main-process sync runner pauses and emits a
 * `sync:toast` with code `SYNC_UPGRADE_REQUIRED` (electron/services/sync). This component
 * (a sibling of {@link SyncToasts}, outside the hash router) turns that into a modal with
 * honest, mentor-voice copy: sync is the paid part; the desktop journal is free forever and
 * cancelling never deletes local data. "Upgrade" deep-links to Settings → Billing.
 */

/** Mirror of `SYNC_ERROR_CODES.UPGRADE_REQUIRED` (electron/services/sync/types.ts). */
const SYNC_UPGRADE_REQUIRED = 'SYNC_UPGRADE_REQUIRED'

export function SyncUpgradePrompt() {
  const [open, setOpen] = useState(false)
  const setSettingsTabRequested = useUiStore((s) => s.setSettingsTabRequested)

  useEffect(() => {
    return eventBus.on('sync:toast', (payload) => {
      if (payload.code === SYNC_UPGRADE_REQUIRED) setOpen(true)
    })
  }, [])

  function goToBilling() {
    setOpen(false)
    setSettingsTabRequested('billing')
    // The app uses a hash router; navigate without needing router context here.
    window.location.hash = '#/settings'
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Cloud sync needs Cairn Pro">
      <div className="space-y-3 text-body text-text-secondary">
        <p>
          Syncing your journal across devices is part of{' '}
          <span className="text-text-primary">Cairn Pro</span>. Your trades are end-to-end
          encrypted — the server stores ciphertext only and can never read them.
        </p>
        <p>
          This desktop app stays <span className="text-text-primary">free, forever</span>, fully
          usable offline. Cancelling Pro later only stops sync — it never deletes your local data.
        </p>
      </div>
      <div className="mt-5 space-y-2">
        <Button onClick={goToBilling}>See Cairn Pro plans</Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </Modal>
  )
}
