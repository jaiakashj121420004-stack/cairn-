import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, Search, Wallet, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSessionStore } from '../../stores/session-store'
import { useUiStore } from '../../stores/ui-store'
import { ipc } from '../../lib/ipc'
import type { SessionState } from '../../stores/session-store'
import type { Account } from '@shared/types/index'

const SESSION_CONFIG: Record<SessionState, { label: string; dotClass: string; pulse: boolean }> = {
  idle:   { label: 'Idle',           dotClass: 'bg-text-muted/60',  pulse: false },
  active: { label: 'Session Active', dotClass: 'bg-accent-a',       pulse: true  },
  paused: { label: 'Paused',         dotClass: 'bg-warning',        pulse: false },
  locked: { label: 'Session Locked', dotClass: 'bg-danger',         pulse: false },
}

export function TopBar() {
  const { sessionState, selectedAccountId, setSelectedAccountId } = useSessionStore()
  const { setCommandPaletteOpen } = useUiStore()
  const [accountOpen, setAccountOpen] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const config = SESSION_CONFIG[sessionState]

  useEffect(() => {
    ipc.accounts.list().then((res) => {
      if (res.ok) {
        const active = res.data.filter((a) => a.deletedAt === null && (a.status === 'active' || a.status === 'paused'))
        setAccounts(active)
        const [firstActive] = active
        if (!selectedAccountId && firstActive) {
          setSelectedAccountId(firstActive.id)
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
    <header
      className="flex h-11 shrink-0 items-center justify-between px-4"
      style={{
        background: 'var(--glass-sidebar-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid var(--glass-border)',
      }}
    >
      {/* Account selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setAccountOpen((o) => !o)}
          className={cn(
            'flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 transition-colors duration-150',
            'hover:bg-white/[0.06] text-text-secondary hover:text-text-primary',
            accountOpen && 'bg-white/[0.06] text-text-primary',
          )}
        >
          <Wallet className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.5} />
          <span className="text-body-sm font-medium">
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
          <div
            className="absolute top-full left-0 z-50 mt-1.5 w-64 rounded-[10px] p-2"
            style={{
              background: 'var(--glass-modal-bg)',
              backdropFilter: 'blur(24px) saturate(200%)',
              WebkitBackdropFilter: 'blur(24px) saturate(200%)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.20)',
            }}
          >
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
                    className="flex w-full items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <div>
                      <p className="text-body-sm font-medium text-text-primary">{a.displayName}</p>
                      <p className="text-caption text-text-muted">Phase {a.currentPhase}/{a.stepCount}</p>
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

      {/* Right: session status + search */}
      <div className="flex items-center gap-4">
        {/* Session indicator */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              config.dotClass,
              config.pulse && 'animate-dot-pulse',
            )}
          />
          <span className="text-caption font-medium text-text-secondary">{config.label}</span>
        </div>

        {/* Command palette trigger */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="Open command palette (⌘K)"
          className={cn(
            'flex items-center gap-2 rounded-[8px] px-2.5 py-1.5',
            'border border-border text-caption text-text-muted',
            'transition-colors duration-150',
            'hover:border-border-strong hover:text-text-secondary',
          )}
        >
          <Search className="h-3 w-3" strokeWidth={1.5} />
          <span>Search</span>
          <kbd className="font-mono text-micro opacity-60">⌘K</kbd>
        </button>
      </div>
    </header>
  )
}
