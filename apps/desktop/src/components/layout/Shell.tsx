import { AnimatePresence, motion } from 'framer-motion'
import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { CommandPalette } from '../../features/command-palette/CommandPalette'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { duration } from '../../lib/motion'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function Shell() {
  const location = useLocation()
  useKeyboardShortcuts()

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      {/* ── Masthead double-rule — the almanac's page-top signature ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50" aria-hidden="true">
        <div className="h-[2px] w-full bg-[hsl(var(--ox))]" />
        <div className="mt-[2px] h-px w-full bg-border" />
      </div>

      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Suspense fallback={null}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: duration.short, ease: 'easeInOut' }}
                className="h-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
