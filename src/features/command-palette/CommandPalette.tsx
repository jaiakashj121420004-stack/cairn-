import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '../../stores/ui-store'
import { useSessionStore } from '../../stores/session-store'
import { useToast } from '../../components/ui'
import { CloseTradeModal } from '../post-trade/CloseTradeModal'
import { ipc } from '../../lib/ipc'
import { cn } from '../../lib/cn'
import { springDefault, respectReducedMotion } from '../../lib/motion'
import {
  STATIC_COMMANDS,
  SETTINGS_TAB_COMMANDS,
  buildAccountCommands,
  matchCommand,
  type CommandDef,
  type CommandDeps,
} from './registry'
import type { Account, TradeListItem } from '@shared/types/index'

export function CommandPalette() {
  const navigate = useNavigate()
  const toast = useToast()
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setNewTradeRequested,
    setBiasRequested,
    setSettingsTabRequested,
    themePreference,
    setThemePreference,
  } = useUiStore()
  const { selectedAccountId } = useSessionStore()

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [pendingCloseTrade, setPendingCloseTrade] = useState<TradeListItem | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Load accounts when palette opens
  useEffect(() => {
    if (!commandPaletteOpen) return
    setQuery('')
    setActiveIndex(0)
    void ipc.accounts.list().then((res) => {
      if (res.ok) setAccounts(res.data.filter((a) => a.deletedAt === null))
    }).catch(() => {
      // palette opened before accounts loaded — show empty list, non-fatal
    })
    // Focus input after paint
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [commandPaletteOpen])

  const close = useCallback(() => {
    setCommandPaletteOpen(false)
    setQuery('')
    setActiveIndex(0)
  }, [setCommandPaletteOpen])

  const deps: CommandDeps = {
    navigate,
    toast,
    closeCommandPalette: close,
    setNewTradeRequested,
    setBiasRequested,
    setSettingsTabRequested,
    toggleTheme: () => {
      setThemePreference(themePreference === 'dark' ? 'light' : 'dark')
    },
    onCloseTradeSelected: (trade) => {
      setPendingCloseTrade(trade)
    },
    getOpenTrade: async () => {
      if (!selectedAccountId) return null
      const res = await ipc.trades.list({ accountId: selectedAccountId, status: 'open' })
      if (!res.ok || res.data.length === 0) return null
      return res.data[0] ?? null
    },
    exportPdf: async () => {
      const res = await ipc.data.exportPdf('cairn-review.pdf')
      if (res.ok && res.data) toast('PDF saved.', 'success')
      else toast('PDF export failed.', 'error')
    },
  }

  // Build full command list, filtered by query
  const allCommands: CommandDef[] = [
    ...STATIC_COMMANDS,
    ...buildAccountCommands(accounts),
    ...SETTINGS_TAB_COMMANDS,
  ]
  const filtered = allCommands.filter((c) => matchCommand(c, query))

  // Clamp activeIndex whenever filtered list shrinks
  const safeIndex = filtered.length > 0 ? Math.min(activeIndex, filtered.length - 1) : 0

  function runCommand(cmd: CommandDef) {
    void cmd.action(deps)
  }

  // Keyboard navigation inside the palette
  useEffect(() => {
    if (!commandPaletteOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = filtered[safeIndex]
        if (cmd) runCommand(cmd)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commandPaletteOpen, filtered, safeIndex, close]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll active item into view
  useEffect(() => {
    const item = listRef.current?.children[safeIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [safeIndex])

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!commandPaletteOpen && !pendingCloseTrade) return null

  const palette = (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cp-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
            className="fixed inset-0 z-[60] bg-black/50"
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="cp-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={respectReducedMotion(springDefault)}
            className="fixed left-1/2 top-[18%] z-[61] w-full max-w-[560px] -translate-x-1/2 overflow-hidden rounded-[14px]"
            style={{
              background: 'var(--glass-modal-bg)',
              backdropFilter: 'blur(28px) saturate(200%)',
              WebkitBackdropFilter: 'blur(28px) saturate(200%)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)',
            }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.5} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands…"
                className="flex-1 bg-transparent text-body-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                aria-label="Command search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-text-muted hover:text-text-secondary"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              )}
              <kbd className="shrink-0 font-mono text-micro text-text-muted opacity-60 border border-border rounded-[4px] px-1.5 py-0.5">Esc</kbd>
            </div>

            {/* Command list */}
            <ul
              ref={listRef}
              role="listbox"
              aria-label="Commands"
              className="max-h-[340px] overflow-y-auto py-1.5"
            >
              {filtered.length === 0 ? (
                <li className="px-4 py-6 text-center text-caption text-text-muted">
                  No commands match &ldquo;{query}&rdquo;
                </li>
              ) : (
                filtered.map((cmd, i) => (
                  <li
                    key={cmd.id}
                    role="option"
                    aria-selected={i === safeIndex}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => runCommand(cmd)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between px-4 py-2.5 transition-colors',
                      i === safeIndex
                        ? 'bg-accent-a/10 text-accent-a'
                        : 'text-text-primary hover:bg-white/[0.04]',
                    )}
                  >
                    <span className="text-body-sm">{cmd.label}</span>
                    {cmd.hint && (
                      <kbd className="shrink-0 font-mono text-micro text-text-muted border border-border rounded-[4px] px-1.5 py-0.5">
                        {cmd.hint}
                      </kbd>
                    )}
                  </li>
                ))
              )}
            </ul>

            {/* Footer hint */}
            <div className="border-t border-border px-4 py-2 flex items-center gap-4">
              <span className="text-micro text-text-muted font-mono">↑↓ navigate</span>
              <span className="text-micro text-text-muted font-mono">↵ run</span>
              <span className="text-micro text-text-muted font-mono">Esc close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {typeof document !== 'undefined' && createPortal(palette, document.body)}
      <CloseTradeModal
        open={pendingCloseTrade !== null}
        trade={pendingCloseTrade}
        onClose={() => setPendingCloseTrade(null)}
        onClosed={() => {
          setPendingCloseTrade(null)
          useSessionStore.getState().bumpTradeVersion()
        }}
      />
    </>
  )
}
