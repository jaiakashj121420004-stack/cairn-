import { motion } from 'framer-motion'
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
    <div className="app-canvas relative flex h-screen overflow-hidden">
      {/* ── Masthead double-rule — the almanac's page-top signature ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50" aria-hidden="true">
        <div className="h-[2px] w-full bg-[hsl(var(--ox))]" />
        <div className="mt-[2px] h-px w-full bg-border" />
      </div>

      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">
          {/* Suspense wraps a KEYED fade-in (no AnimatePresence `mode="wait"`).
              The old exit-then-wait crossfade deadlocked whenever a lazy route
              chunk suspended: the incoming page mounted but its enter animation
              never fired, leaving it at opacity:0 until a reload. Re-keying on the
              pathname remounts the page so the fade-in always plays after the
              chunk resolves. */}
          <Suspense fallback={null}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: duration.short, ease: 'easeInOut' }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </Suspense>
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
