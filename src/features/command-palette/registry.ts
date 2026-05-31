import type { NavigateFunction } from 'react-router-dom'
import type { TradeListItem } from '@shared/types/index'

export interface CommandDeps {
  navigate: NavigateFunction
  toast: (message: string, type: 'success' | 'error' | 'info') => void
  closeCommandPalette: () => void
  setNewTradeRequested: (v: boolean) => void
  setBiasRequested: (v: boolean) => void
  setSettingsTabRequested: (tab: string | null) => void
  toggleTheme: () => void
  onCloseTradeSelected: (trade: TradeListItem) => void
  getOpenTrade: () => Promise<TradeListItem | null>
  exportPdf: () => Promise<void>
}

export interface CommandDef {
  id: string
  label: string
  /** Short descriptor shown in the right gutter. */
  hint?: string
  /** Additional terms matched by fuzzy search but not shown in the UI. */
  keywords: string[]
  action: (deps: CommandDeps) => void | Promise<void>
}

/** Matches query against label + keywords. Case-insensitive substring. */
export function matchCommand(cmd: CommandDef, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  if (cmd.label.toLowerCase().includes(q)) return true
  return cmd.keywords.some((k) => k.toLowerCase().includes(q))
}

// ─── Static commands ──────────────────────────────────────────────────────────

export const STATIC_COMMANDS: readonly CommandDef[] = [
  {
    id: 'new-trade',
    label: 'New trade',
    hint: 'N',
    keywords: ['open', 'place', 'enter'],
    action: ({ navigate, setNewTradeRequested, closeCommandPalette }) => {
      closeCommandPalette()
      navigate('/dashboard')
      setNewTradeRequested(true)
    },
  },
  {
    id: 'close-trade',
    label: 'Close trade',
    keywords: ['exit', 'close', 'submit'],
    action: async ({ toast, onCloseTradeSelected, getOpenTrade, closeCommandPalette }) => {
      closeCommandPalette()
      const trade = await getOpenTrade()
      if (!trade) {
        toast('No open trades.', 'info')
        return
      }
      onCloseTradeSelected(trade)
    },
  },
  {
    id: 'log-bias',
    label: 'Log session bias',
    hint: 'B',
    keywords: ['bias', 'session', 'daily', 'htf', 'h4', 'h1'],
    action: ({ navigate, setBiasRequested, closeCommandPalette }) => {
      closeCommandPalette()
      navigate('/dashboard')
      setBiasRequested(true)
    },
  },
  {
    id: 'toggle-theme',
    label: 'Toggle theme',
    keywords: ['dark', 'light', 'theme', 'appearance', 'color'],
    action: ({ toggleTheme, closeCommandPalette }) => {
      closeCommandPalette()
      toggleTheme()
    },
  },
  {
    id: 'open-notebook',
    label: 'Open Notebook',
    keywords: ['notebook', 'notes', 'plan', 'watchlist', 'journal', 'review'],
    action: ({ navigate, closeCommandPalette }) => {
      closeCommandPalette()
      navigate('/notebook')
    },
  },
  {
    id: 'export-pdf',
    label: 'Export trade review PDF',
    keywords: ['pdf', 'export', 'report', 'review', 'download'],
    action: async ({ exportPdf, closeCommandPalette }) => {
      closeCommandPalette()
      await exportPdf()
    },
  },
  {
    id: 'settings-shortcuts',
    label: 'Show keyboard shortcuts',
    keywords: ['shortcuts', 'keys', 'hotkeys', 'keyboard', 'help'],
    action: ({ navigate, setSettingsTabRequested, closeCommandPalette }) => {
      closeCommandPalette()
      setSettingsTabRequested('shortcuts')
      navigate('/settings')
    },
  },
] as const

// ─── Dynamic command builders ─────────────────────────────────────────────────

export function buildAccountCommands(
  accounts: Array<{ id: string; displayName: string }>,
): CommandDef[] {
  return accounts.map((a) => ({
    id: `account-${a.id}`,
    label: `Jump to account: ${a.displayName}`,
    keywords: ['account', 'switch', a.displayName.toLowerCase()],
    action: ({ navigate, closeCommandPalette }) => {
      closeCommandPalette()
      navigate(`/dashboard?account=${a.id}`)
    },
  }))
}

export const SETTINGS_TAB_COMMANDS: readonly CommandDef[] = [
  { id: 'settings-general',   label: 'Settings: General',    keywords: ['settings', 'general', 'timezone', 'leverage', 'risk'], action: ({ navigate, setSettingsTabRequested, closeCommandPalette }) => { closeCommandPalette(); setSettingsTabRequested('general');   navigate('/settings') } },
  { id: 'settings-pairs',     label: 'Settings: Pairs',      keywords: ['settings', 'pairs', 'instruments', 'symbols'],          action: ({ navigate, setSettingsTabRequested, closeCommandPalette }) => { closeCommandPalette(); setSettingsTabRequested('pairs');     navigate('/settings') } },
  { id: 'settings-setups',    label: 'Settings: Setups',     keywords: ['settings', 'setups', 'strategies'],                     action: ({ navigate, setSettingsTabRequested, closeCommandPalette }) => { closeCommandPalette(); setSettingsTabRequested('setups');    navigate('/settings') } },
  { id: 'settings-killzones', label: 'Settings: Killzones',  keywords: ['settings', 'killzones', 'sessions', 'london', 'ny'],    action: ({ navigate, setSettingsTabRequested, closeCommandPalette }) => { closeCommandPalette(); setSettingsTabRequested('killzones'); navigate('/settings') } },
  { id: 'settings-firms',     label: 'Settings: Prop Firms', keywords: ['settings', 'firms', 'prop', 'ftmo', 'rules'],            action: ({ navigate, setSettingsTabRequested, closeCommandPalette }) => { closeCommandPalette(); setSettingsTabRequested('firms');     navigate('/settings') } },
  { id: 'settings-alerts',    label: 'Settings: Alerts',     keywords: ['settings', 'alerts', 'r-target', 'notifications'],      action: ({ navigate, setSettingsTabRequested, closeCommandPalette }) => { closeCommandPalette(); setSettingsTabRequested('alerts');    navigate('/settings') } },
  { id: 'settings-data',      label: 'Settings: Data',       keywords: ['settings', 'data', 'import', 'export'],                 action: ({ navigate, setSettingsTabRequested, closeCommandPalette }) => { closeCommandPalette(); setSettingsTabRequested('data');      navigate('/settings') } },
  { id: 'settings-backups',   label: 'Settings: Backups',    keywords: ['settings', 'backup', 'restore'],                        action: ({ navigate, setSettingsTabRequested, closeCommandPalette }) => { closeCommandPalette(); setSettingsTabRequested('backups');   navigate('/settings') } },
] as const
