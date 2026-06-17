import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@web/components/ui'
import { useUpgradePrompt } from '@web/lib/upgrade-store'

/**
 * The upgrade prompt shown when a paid (cloud-sync) action hits a 402 (task §5, §2.14).
 *
 * Mounted once at the app root; it listens to {@link useUpgradePrompt}, which is flipped by
 * the transport's `onUpgradeRequired` hook. Copy is honest and mentor-voiced (CLAUDE.md §1
 * voice, §2.4, §14 #28): sync is the paid part; local use is free forever, and cancelling
 * never deletes local data. "Upgrade" routes to the pricing page (the in-app `/pricing`
 * route, or the server-provided deep link if it is absolute).
 */
export function UpgradeModal(): JSX.Element {
  const navigate = useNavigate()
  const { open, upgradeUrl, dismiss } = useUpgradePrompt(
    useShallow((s) => ({ open: s.open, upgradeUrl: s.upgradeUrl, dismiss: s.dismiss })),
  )

  function goUpgrade(): void {
    dismiss()
    // Relative paths stay in the SPA router; an absolute URL is a full navigation.
    if (upgradeUrl.startsWith('/')) void navigate(upgradeUrl)
    else window.location.href = upgradeUrl
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
          data-testid="upgrade-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-modal-title"
        >
          <motion.div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="upgrade-modal-title" className="text-xl font-semibold tracking-tight">
              Cloud sync is part of Cairn Pro
            </h2>
            <div className="mt-4 space-y-3 text-sm text-white/70">
              <p>
                Syncing your journal across devices is a paid feature. Your trades are{' '}
                <strong className="text-white">end-to-end encrypted</strong> — the server stores
                ciphertext only and can never read them.
              </p>
              <p>
                The desktop app stays <strong className="text-white">free, forever</strong>, fully
                usable offline with no account. Cancelling Pro later only stops sync — it never
                deletes your local data.
              </p>
            </div>
            <div className="mt-6 space-y-3">
              <Button onClick={goUpgrade} data-testid="upgrade-modal-cta">
                See Cairn Pro plans
              </Button>
              <Button variant="ghost" onClick={dismiss} data-testid="upgrade-modal-dismiss">
                Not now
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
