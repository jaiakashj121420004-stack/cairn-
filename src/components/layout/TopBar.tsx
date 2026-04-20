import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, Search, Wallet, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSessionStore } from '../../stores/session-store'
import { ipc } from '../../lib/ipc'
import type { SessionState } from '../../stores/session-store'
import type { Account } from '@shared/types/index'

const SESSION_CONFIG: Record<SessionState, { label: string; dotClass: string }> = {
  idle: { label: 'Idle', dotClass: 'bg-text-muted' },
  active: { label: 'Session Active', dotClass: 'bg-accent-a' },
  paused: { label: 'Paused', dotClass: 'bg-warning' },
  locked: { label: 'Session Locked', dotClass: 'bg-danger' },
}

export function TopBar() {
  const { sessionState, selectedAccountId, setSelectedAccountId } = useSessionStore()
  const [accountOpen, setAccountOpen] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const config = SESSION_CONFIG[sessionState]

  useEffect(() => {
    ipc.accounts.list().then((res) => {
      if (res.ok) {
        const active = res.data.filter((a) => a.deletedAt === null && (a.status === 'active' || a.status === 'paused'))
        setAccounts(active)
        // Auto-select first active account if none selected
        if (!selectedAccountId && active.length > 0) {
          setSelectedAccountId(active[0]!.id)
        }
      }
    })
  }, [selectedAccountId, setSelectedAccountId])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAccountOpen(false)
      }
    }
    if (accountOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [accountOpen])

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

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
          <span className="text-body-sm text-text-secondary">
            {selectedAccount ? selectedAccount.displayName : 'Select account'}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-text-muted transition-transform duration-150',
              accountOpen && 'rotate-180',
            )}
            strokeWidth={1.5}
          />
        </button>

        {accountOpen && (
          <div className="absolute top-full left-0 z-50 mt-1.5 w-64 rounded-[10px] border border-border bg-surface-elevated p-2 shadow-lg">
            {accounts.length === 0 ? (
              <p className="px-2 py-1.5 text-caption text-text-muted">
                No active accounts.{' '}
                <NavLink
                  to="/accounts"
                  onClick={() => setAccountOpen(false)}
                  className="text-accent-a hover:underline"
                >
                  Set up an account.
                </NavLink>
              </p>
            ) : (
              <div className="space-y-0.5">
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelectedAccountId(a.id)
                      setAccountOpen(false)
                    }}
                    className="flex w-full items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left transition-colors hover:bg-surface"
                  >
                    <div>
                      <p className="text-body-sm font-medium text-text-primary">{a.displayName}</p>
                      <p className="text-caption text-text-muted">
                        Phase {a.currentPhase}/{a.stepCount}
                      </p>
                    </div>
                    {a.id === selectedAccountId && (
                      <Check className="h-3.5 w-3.5 text-accent-a" strokeWidth={2} />
                    )}
                  </button>
                ))}
              </div>
            )}
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
