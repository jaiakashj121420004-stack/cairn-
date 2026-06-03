import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type RiskMode = 'dollar' | 'percent'

interface SettingsStore {
  riskMode: RiskMode
  setRiskMode: (mode: RiskMode) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      riskMode: 'percent' as RiskMode,
      setRiskMode: (riskMode) => set({ riskMode }),
    }),
    { name: 'cairn-ui-settings' },
  ),
)
