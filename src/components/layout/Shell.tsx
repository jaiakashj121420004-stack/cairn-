import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { duration } from '../../lib/motion'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

export function Shell() {
  const location = useLocation()
  useKeyboardShortcuts()

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      {/* ── Aurora ribbon — page-top signature accent ── */}
      <div
        className="aurora-ribbon pointer-events-none absolute inset-x-0 top-0 z-50 h-[1.5px] opacity-80"
        aria-hidden="true"
      />

      {/* ── Atmospheric depth — aurora mist + grain ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Aurora mist layer — soft drifting gradients */}
        <div className="aurora-mist absolute inset-0" />

        {/* Sharper accent orbs on top of mist */}
        <div
          className="absolute -left-24 -top-24 h-[640px] w-[640px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, hsl(74,74%,59%,0.10) 0%, hsl(74,74%,59%,0.02) 50%, transparent 75%)',
            filter: 'blur(56px)',
          }}
        />
        <div
          className="absolute -bottom-32 -right-20 h-[580px] w-[580px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, hsl(36,52%,57%,0.10) 0%, hsl(36,52%,57%,0.02) 50%, transparent 75%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute right-0 top-1/4 h-[420px] w-[420px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, hsl(220,100%,71%,0.06) 0%, transparent 70%)',
            filter: 'blur(64px)',
          }}
        />

        {/* Grain texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.022] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '128px 128px',
          }}
        />
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
    </div>
  )
}
