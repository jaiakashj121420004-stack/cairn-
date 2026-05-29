import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemePreference = 'dark' | 'light' | 'system'
type ResolvedTheme = 'dark' | 'light'

interface UiState {
  themePreference: ThemePreference
  resolvedTheme: ResolvedTheme
  sidebarCollapsed: boolean
  activeModal: string | null
  newTradeRequested: boolean
  biasRequested: boolean
  commandPaletteOpen: boolean
  /** Which settings tab to activate on the next /settings visit. Cleared after consumed. */
  settingsTabRequested: string | null
  setThemePreference: (pref: ThemePreference) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveModal: (id: string | null) => void
  setNewTradeRequested: (v: boolean) => void
  setBiasRequested: (v: boolean) => void
  setCommandPaletteOpen: (v: boolean) => void
  setSettingsTabRequested: (tab: string | null) => void
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === 'light') return 'light'
  if (pref === 'dark') return 'dark'
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      resolvedTheme: 'dark',
      sidebarCollapsed: false,
      activeModal: null,
      newTradeRequested: false,
      biasRequested: false,
      commandPaletteOpen: false,
      settingsTabRequested: null,
      setThemePreference: (pref) => {
        const resolved = resolveTheme(pref)
        applyTheme(resolved)
        set({ themePreference: pref, resolvedTheme: resolved })
      },
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setActiveModal: (id) => set({ activeModal: id }),
      setNewTradeRequested: (v) => set({ newTradeRequested: v }),
      setBiasRequested: (v) => set({ biasRequested: v }),
      setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
      setSettingsTabRequested: (tab) => set({ settingsTabRequested: tab }),
    }),
    {
      name: 'cairn-ui',
      partialize: (state) => ({
        themePreference: state.themePreference,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = resolveTheme(state.themePreference)
          applyTheme(resolved)
          state.resolvedTheme = resolved
        }
      },
    },
  ),
)
