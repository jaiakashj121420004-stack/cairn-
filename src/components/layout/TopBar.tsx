import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, Search, Wallet } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSessionStore } from '../../stores/session-store'
import type { SessionState } from '../../stores/session-store'

const SESSION_CONFIG: Record<SessionState, { label: string; dotClass: string }> = {
  idle: { label: 'Idle', dotClass: 'bg-text-muted' },
  active: { label: 'Session Active', dotClass: 'bg-accent-a' },
  paused: { label: 'Paused', dotClass: 'bg-warning' },
  locked: { label: 'Session Locked', dotClass: 'bg-danger' },
}

export function TopBar() {
  const { sessionState } = useSessionStore()
  const [accountOpen, setAccountOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const config = SESSION_CONFIG[sessionState]

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAccountOpen(false)
      }
    }
    if (accountOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [accountOpen])

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      {/* Left: account selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setAccountOpen((o) => !o)}
          className={cn(
            'flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 transition-colors hover:bg-surface-elevated',
            accountOpen && 'bg-surface-elevated',
          )}
        >
          <Wallet className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
          <span className="text-body-sm text-text-muted">Select account</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-text-muted transition-transform duration-150',
              accountOpen && 'rotate-180',
            )}
            strokeWidth={1.5}
          />
        </button>

        {accountOpen && (
          <div className="absolute top-full left-0 z-50 mt-1.5 w-64 rounded-[10px] border border-border bg-surface-elevated p-3 shadow-lg">
            <p className="text-caption text-text-muted">
              No accounts configured.{' '}
              <NavLink
                to="/accounts"
                onClick={() => setAccountOpen(false)}
                className="text-accent-a hover:underline"
              >
                Set up an account.
              </NavLink>
            </p>
          </div>
        )}
      </div>

      {/* Right: session indicator + search shortcut */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} />
          <span className="text-caption text-text-secondary">{config.label}</span>
        </div>

        <button
          type="button"
          disabled
          aria-label="Quick search (coming soon)"
          className="flex items-center gap-2 rounded-[8px] border border-border px-2.5 py-1.5 text-caption text-text-muted transition-colors hover:border-border-strong hover:text-text-secondary disabled:pointer-events-none"
        >
          <Search className="h-3 w-3" strokeWidth={1.5} />
          <span>Search</span>
          <kbd className="font-mono text-micro">⌘K</kbd>
        </button>
      </div>
    </header>
  )
}
