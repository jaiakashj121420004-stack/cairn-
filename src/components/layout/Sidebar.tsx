import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Wallet,
  BookOpen,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { springSettled, duration } from '../../lib/motion'
import { useUiStore } from '../../stores/ui-store'
import { ThemeToggle } from '../shared/ThemeToggle'
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
  { to: '/settings', label: 'Settings', icon: Settings2 },
]

const TEXT_TRANSITION = { duration: duration.instant }

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore()

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={springSettled}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-surface"
    >
      {/* Header — wordmark + collapse toggle */}
      <div className="flex h-12 shrink-0 items-center px-3">
        <AnimatePresence initial={false}>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={TEXT_TRANSITION}
              className="flex-1 select-none font-sans text-h3 font-bold text-accent-a"
            >
              Cairn
            </motion.span>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'rounded-[8px] p-1.5 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary',
            sidebarCollapsed && 'mx-auto',
          )}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-1">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} collapsed={sidebarCollapsed} />
        ))}
      </nav>

      {/* Bottom — theme toggle + attribution */}
      <div className="shrink-0 border-t border-border p-2">
        <div
          className={cn(
            'flex items-center',
            sidebarCollapsed ? 'justify-center' : 'gap-2 px-1',
          )}
        >
          <ThemeToggle />
          <AnimatePresence initial={false}>
            {!sidebarCollapsed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                transition={TEXT_TRANSITION}
                className="cursor-default select-none text-[11px] tracking-[0.02em] text-text-muted transition-opacity duration-[160ms] hover:opacity-100"
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
            'flex h-9 items-center gap-3 rounded-[10px] px-2.5 transition-colors',
            isActive
              ? 'bg-surface-elevated text-text-primary'
              : 'text-text-muted hover:bg-surface-elevated hover:text-text-secondary',
            collapsed && 'justify-center px-0',
          )}
        >
          <Icon
            className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-accent-a')}
            strokeWidth={1.5}
          />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={TEXT_TRANSITION}
                className="whitespace-nowrap text-body font-medium"
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
