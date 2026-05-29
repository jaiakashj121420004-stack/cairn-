import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  STATIC_COMMANDS,
  SETTINGS_TAB_COMMANDS,
  buildAccountCommands,
  matchCommand,
} from '../../../src/features/command-palette/registry'
import type { CommandDeps, CommandDef } from '../../../src/features/command-palette/registry'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<CommandDeps> = {}): CommandDeps {
  return {
    navigate: vi.fn(),
    toast: vi.fn(),
    closeCommandPalette: vi.fn(),
    setNewTradeRequested: vi.fn(),
    setBiasRequested: vi.fn(),
    setSettingsTabRequested: vi.fn(),
    toggleTheme: vi.fn(),
    onCloseTradeSelected: vi.fn(),
    getOpenTrade: vi.fn().mockResolvedValue(null),
    exportPdf: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function findCmd(id: string): CommandDef {
  const all = [...STATIC_COMMANDS, ...SETTINGS_TAB_COMMANDS]
  const cmd = all.find((c) => c.id === id)
  if (!cmd) throw new Error(`Command "${id}" not found`)
  return cmd
}

// ─── Registry shape ───────────────────────────────────────────────────────────

describe('STATIC_COMMANDS', () => {
  it('contains all 6 required static command ids', () => {
    const ids = STATIC_COMMANDS.map((c) => c.id)
    expect(ids).toContain('new-trade')
    expect(ids).toContain('close-trade')
    expect(ids).toContain('log-bias')
    expect(ids).toContain('toggle-theme')
    expect(ids).toContain('export-pdf')
    expect(ids).toContain('settings-shortcuts')
  })

  it('all static command ids are unique', () => {
    const ids = STATIC_COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('SETTINGS_TAB_COMMANDS', () => {
  it('contains one entry per settings tab (8 tabs)', () => {
    expect(SETTINGS_TAB_COMMANDS).toHaveLength(8)
  })

  it('all settings tab command ids are unique', () => {
    const ids = SETTINGS_TAB_COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ─── matchCommand ─────────────────────────────────────────────────────────────

describe('matchCommand', () => {
  const cmd: CommandDef = {
    id: 'test', label: 'Export trade review PDF', keywords: ['pdf', 'report'],
    action: vi.fn(),
  }

  it('returns true for empty query', () => {
    expect(matchCommand(cmd, '')).toBe(true)
  })

  it('matches partial label substring', () => {
    expect(matchCommand(cmd, 'export')).toBe(true)
    expect(matchCommand(cmd, 'PDF')).toBe(true)
  })

  it('matches keyword', () => {
    expect(matchCommand(cmd, 'report')).toBe(true)
  })

  it('returns false for non-matching query', () => {
    expect(matchCommand(cmd, 'zyxwv')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(matchCommand(cmd, 'EXPORT')).toBe(true)
  })
})

// ─── buildAccountCommands ─────────────────────────────────────────────────────

describe('buildAccountCommands', () => {
  it('produces one command per account', () => {
    const accs = [
      { id: 'a1', displayName: 'FTMO 50K' },
      { id: 'a2', displayName: 'MyFundedFX' },
    ]
    const cmds = buildAccountCommands(accs)
    expect(cmds).toHaveLength(2)
  })

  it('label includes account name', () => {
    const [cmd] = buildAccountCommands([{ id: 'x', displayName: 'Darwinex' }])
    expect(cmd.label).toContain('Darwinex')
  })

  it('action closes palette and navigates', () => {
    const deps = makeDeps()
    const [cmd] = buildAccountCommands([{ id: 'a1', displayName: 'Test' }])
    cmd.action(deps)
    expect(deps.closeCommandPalette).toHaveBeenCalled()
    expect(deps.navigate).toHaveBeenCalledWith(expect.stringContaining('a1'))
  })
})

// ─── Individual command actions ───────────────────────────────────────────────

describe('new-trade command', () => {
  it('closes palette, navigates to dashboard, requests new trade', () => {
    const deps = makeDeps()
    findCmd('new-trade').action(deps)
    expect(deps.closeCommandPalette).toHaveBeenCalled()
    expect(deps.navigate).toHaveBeenCalledWith('/dashboard')
    expect(deps.setNewTradeRequested).toHaveBeenCalledWith(true)
  })
})

describe('log-bias command', () => {
  it('closes palette, navigates to dashboard, requests bias modal', () => {
    const deps = makeDeps()
    findCmd('log-bias').action(deps)
    expect(deps.closeCommandPalette).toHaveBeenCalled()
    expect(deps.navigate).toHaveBeenCalledWith('/dashboard')
    expect(deps.setBiasRequested).toHaveBeenCalledWith(true)
  })
})

describe('toggle-theme command', () => {
  it('closes palette and toggles theme', () => {
    const deps = makeDeps()
    findCmd('toggle-theme').action(deps)
    expect(deps.closeCommandPalette).toHaveBeenCalled()
    expect(deps.toggleTheme).toHaveBeenCalled()
  })
})

describe('close-trade command', () => {
  it('closes palette and toasts when no open trade', async () => {
    const deps = makeDeps({ getOpenTrade: vi.fn().mockResolvedValue(null) })
    await findCmd('close-trade').action(deps)
    expect(deps.closeCommandPalette).toHaveBeenCalled()
    expect(deps.toast).toHaveBeenCalledWith('No open trades.', 'info')
    expect(deps.onCloseTradeSelected).not.toHaveBeenCalled()
  })

  it('closes palette and calls onCloseTradeSelected when trade exists', async () => {
    const fakeTrade = { id: 't1' } as Parameters<CommandDeps['onCloseTradeSelected']>[0]
    const deps = makeDeps({ getOpenTrade: vi.fn().mockResolvedValue(fakeTrade) })
    await findCmd('close-trade').action(deps)
    expect(deps.closeCommandPalette).toHaveBeenCalled()
    expect(deps.onCloseTradeSelected).toHaveBeenCalledWith(fakeTrade)
  })
})

describe('settings-shortcuts command', () => {
  beforeEach(() => vi.clearAllMocks())

  it('closes palette, requests shortcuts tab, navigates to settings', () => {
    const deps = makeDeps()
    findCmd('settings-shortcuts').action(deps)
    expect(deps.closeCommandPalette).toHaveBeenCalled()
    expect(deps.setSettingsTabRequested).toHaveBeenCalledWith('shortcuts')
    expect(deps.navigate).toHaveBeenCalledWith('/settings')
  })
})

describe('settings tab commands', () => {
  it.each(SETTINGS_TAB_COMMANDS.map((c) => [c.id, c.label] as const))(
    '%s closes palette and requests correct tab',
    (id, _label) => {
      const deps = makeDeps()
      const cmd = findCmd(id)
      cmd.action(deps)
      expect(deps.closeCommandPalette).toHaveBeenCalled()
      expect(deps.navigate).toHaveBeenCalledWith('/settings')
      const tabId = id.replace('settings-', '')
      expect(deps.setSettingsTabRequested).toHaveBeenCalledWith(tabId)
    },
  )
})
