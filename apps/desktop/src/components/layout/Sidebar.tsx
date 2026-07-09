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
import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { eventBus } from '../../lib/event-bus'
import { springSettled, duration } from '../../lib/motion'
import { useReflectionStore } from '../../stores/reflection-store'
import { useUiStore } from '../../stores/ui-store'
import { ThemeToggle } from '../shared/ThemeToggle'
import { Tooltip } from '../ui/tooltip'
import type { LucideIcon } from 'lucide-react'

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
  const pendingReflections = useReflectionStore((s) => s.pendingCount)
  const refreshReflections = useReflectionStore((s) => s.refresh)

  // Keep the reflection badge live: load once, then refresh whenever a trade
  // closes (a new reflection may be owed) or is reflected (one cleared).
  useEffect(() => {
    void refreshReflections()
    const offClosed = eventBus.on('trade.closed', () => void refreshReflections())
    const offReflected = eventBus.on('trade.reflected', () => void refreshReflections())
    return () => {
      offClosed()
      offReflected()
    }
  }, [refreshReflections])

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={springSettled}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-r glass-sidebar"
      style={{ borderColor: 'var(--glass-border)' }}
    >
      {/* Brand mark — wordmark only */}
      <div className="flex h-16 shrink-0 items-center px-3">
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
                  color: 'hsl(188,80%,48%)',
                  letterSpacing: '0.18em',
                  textShadow: '0 0 10px hsl(188,86%,53%,0.4)',
                }}
              >
                Discipline · Logged
              </span>
            </motion.div>
          )}
        </AnimatePresence>
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
          <NavItem
            key={item.to}
            {...item}
            collapsed={sidebarCollapsed}
            badge={item.to === '/review' ? pendingReflections : 0}
          />
        ))}
      </nav>

      {/* Bottom — theme + attribution */}
      <div className="shrink-0 p-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <div
          className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'gap-2 px-1')}
        >
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
  badge?: number
}

function NavItem({ to, label, icon: Icon, collapsed, badge = 0 }: NavItemProps) {
  const hasBadge = badge > 0
  const linkContent = (
    <NavLink to={to} end className="block">
      {({ isActive }) => (
        <div
          className={cn(
            'group relative flex h-10 items-center gap-3 rounded-[10px] pl-2.5 pr-2.5 transition-all duration-200',
            !collapsed && 'pl-7',
            collapsed && 'justify-center px-0',
            isActive ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary',
            !collapsed && isActive && 'waypoint-active',
          )}
          style={
            isActive
              ? {
                  background:
                    'linear-gradient(90deg, hsl(188,86%,53%,0.12) 0%, hsl(188,86%,53%,0.02) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(180,220,255,0.06)',
                }
              : undefined
          }
        >
          <div className="relative shrink-0">
            <Icon
              className={cn(
                'h-[18px] w-[18px] transition-all duration-200',
                isActive && 'text-info drop-shadow-[0_0_8px_hsl(188,86%,53%,0.65)]',
                !isActive && 'group-hover:scale-[1.05]',
              )}
              strokeWidth={isActive ? 2 : 1.5}
            />
            {/* Collapsed: a small dot marks pending reflections (count shown when expanded). */}
            {hasBadge && collapsed && (
              <span
                data-testid="cairn-reflection-pending"
                aria-label={`${badge} trades awaiting reflection`}
                className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-info ring-2 ring-[hsl(var(--surface))]"
              />
            )}
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: duration.instant }}
                className={cn(
                  'flex-1 whitespace-nowrap text-body font-medium transition-colors duration-150',
                  isActive && 'text-text-primary',
                )}
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
          {hasBadge && !collapsed && (
            <span
              data-testid="cairn-reflection-pending"
              aria-label={`${badge} trades awaiting reflection`}
              className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-info/15 px-1.5 text-micro font-semibold text-info"
            >
              {badge}
            </span>
          )}
        </div>
      )}
    </NavLink>
  )

  if (collapsed) {
    return (
      <Tooltip
        content={hasBadge ? `${label} · ${badge} to reflect` : label}
        side="right"
        wrapperClassName="block"
      >
        {linkContent}
      </Tooltip>
    )
  }
  return linkContent
}
