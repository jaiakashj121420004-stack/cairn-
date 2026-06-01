import { create } from 'zustand'
import { ipc } from '../lib/ipc'

/**
 * Tracks the global count of closed trades awaiting their deferred Phase-2
 * reflection (two-phase logging). Drives the sidebar `cairn-reflection-pending`
 * badge. Counts across all accounts — the trader wants to know the total
 * outstanding regardless of which account is selected.
 */
interface ReflectionStore {
  pendingCount: number
  refresh: () => Promise<void>
}

export const useReflectionStore = create<ReflectionStore>((set) => ({
  pendingCount: 0,
  refresh: async () => {
    const res = await ipc.trades.countAwaitingReflection(null)
    if (res.ok) set({ pendingCount: res.data })
  },
}))
