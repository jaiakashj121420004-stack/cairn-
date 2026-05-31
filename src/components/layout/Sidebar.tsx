import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Wallet,
  BookOpen,
  NotebookPen,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { springSettled, duration } from '../../lib/motion'
import { useUiStore } from '../../stores/ui-store'
import { ThemeToggle } from '../shared/ThemeToggle'
import { CairnLogo } from '../shared/CairnLogo'
import { Tooltip } from '../ui/tooltip'

interface NavItemDef {
  to: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItemDef[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/trades', label: 'Trade Log', icon: ClipboardList },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/review', label: 'Review', icon: BookOpen },
  { to: '/notebook', label: 'Notebook', icon: NotebookPen },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]

const TEXT_TRANSITION = { duration: duration.instant }

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore()

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={springSettled}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-r glass-sidebar"
      style={{ borderColor: 'var(--glass-border)' }}
    >
      {/* Brand mark — Cairn logo + wordmark */}
      <div className="flex h-16 shrink-0 items-center px-3">
        <div className={cn('flex items-center gap-2.5', sidebarCollapsed && 'mx-auto')}>
          <CairnLogo size={28} />
          <AnimatePresence initial={false}>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={TEXT_TRANSITION}
                className="select-none"
              >
                <span
                  className="block font-sans text-h3 font-bold leading-none"
                  style={{
                    color: 'hsl(var(--text-primary))',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Cairn
                </span>
                <span
                  className="block text-[9.5px] font-semibold uppercase leading-none mt-1"
                  style={{
                    color: 'hsl(74,74%,62%)',
                    letterSpacing: '0.18em',
                    textShadow: '0 0 12px hsl(74,74%,59%,0.50)',
                  }}
                >
                  Discipline · Logged
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {!sidebarCollapsed && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="Collapse sidebar"
            className="ml-auto rounded-[8px] p-1.5 text-text-muted transition-colors duration-150 hover:bg-white/[0.06] hover:text-text-primary"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {sidebarCollapsed && (
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          aria-label="Expand sidebar"
          className="mx-auto mb-1 rounded-[8px] p-1.5 text-text-muted transition-colors duration-150 hover:bg-white/[0.06] hover:text-text-primary"
        >
          <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
        </button>
      )}

      {/* Nav — with trail line connecting waypoints */}
      <nav
        className={cn(
          'flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2',
          !sidebarCollapsed && 'trail-line',
        )}
      >
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} collapsed={sidebarCollapsed} />
        ))}
      </nav>

      {/* Bottom — theme + attribution */}
      <div className="shrink-0 p-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'gap-2 px-1')}>
          <ThemeToggle />
          <AnimatePresence initial={false}>
            {!sidebarCollapsed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                transition={TEXT_TRANSITION}
                className="cursor-default select-none text-[11px] tracking-[0.02em] text-text-muted transition-opacity duration-[160ms] hover:opacity-80"
              >
                Designed &amp; built by Jai Akash
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  )
}

interface NavItemProps extends NavItemDef {
  collapsed: boolean
}

function NavItem({ to, label, icon: Icon, collapsed }: NavItemProps) {
  const linkContent = (
    <NavLink to={to} end className="block">
      {({ isActive }) => (
        <div
          className={cn(
            'group relative flex h-10 items-center gap-3 rounded-[10px] pl-2.5 pr-2.5 transition-all duration-200',
            !collapsed && 'pl-7',
            collapsed && 'justify-center px-0',
            isActive
              ? 'text-text-primary'
              : 'text-text-muted hover:text-text-secondary',
            !collapsed && isActive && 'waypoint-active',
          )}
          style={
            isActive
              ? {
                  background: 'linear-gradient(90deg, hsl(74,74%,59%,0.10) 0%, hsl(74,74%,59%,0.02) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                }
              : undefined
          }
        >
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0 transition-all duration-200',
              isActive && 'text-accent-a drop-shadow-[0_0_8px_hsl(74,74%,59%,0.55)]',
              !isActive && 'group-hover:scale-[1.05]',
            )}
            strokeWidth={isActive ? 2 : 1.5}
          />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: duration.instant }}
                className={cn(
                  'whitespace-nowrap text-body font-medium transition-colors duration-150',
                  isActive && 'text-text-primary',
                )}
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}
    </NavLink>
  )

  if (collapsed) {
    return (
      <Tooltip content={label} side="right" wrapperClassName="block">
        {linkContent}
      </Tooltip>
    )
  }
  return linkContent
}
