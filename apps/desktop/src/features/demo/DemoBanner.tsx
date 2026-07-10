import { useState } from 'react'
import { Button } from '../../components/ui'
import { ipc } from '../../lib/ipc'

/**
 * Persistent, mentor-voice strip shown while the app is in first-run demo mode.
 * Exiting clears all demo data (never touches real data) and returns to onboarding.
 */
export function DemoBanner() {
  const [leaving, setLeaving] = useState(false)

  async function handleExit(): Promise<void> {
    setLeaving(true)
    const res = await ipc.demo.exit()
    if (res.ok) {
      // Full reload is the simplest correct reset: the demo account (and any
      // renderer state pointing at it) is gone; App re-boots into onboarding.
      window.location.reload()
    } else {
      setLeaving(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[hsl(var(--ox))] bg-background">
      <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4 px-4 py-2">
        <p className="text-caption text-text-muted">
          <span className="font-semibold text-[hsl(var(--ox))]">Demo mode.</span> You are exploring
          Cairn with sample data — nothing here is synced or saved to a real account.
        </p>
        <Button variant="primary" size="md" onClick={() => void handleExit()} loading={leaving}>
          Exit demo &amp; set up
        </Button>
      </div>
    </div>
  )
}
