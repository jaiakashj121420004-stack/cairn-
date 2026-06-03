import { create } from 'zustand'
import type { Session, SessionStateDTO } from '@shared/types/index'
import { ipc } from '../lib/ipc'

export type SessionState = 'idle' | 'active' | 'paused' | 'locked'

interface SessionStore {
  selectedAccountId: string | null
  todaySession: Session | null
  sessionStateDTO: SessionStateDTO | null
  sessionState: SessionState
  tradeVersion: number
  setSelectedAccountId: (id: string) => void
  refresh: () => Promise<void>
  setTodaySession: (s: Session | null) => void
  bumpTradeVersion: () => void
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
  selectedAccountId: null,
  todaySession: null,
  sessionStateDTO: null,
  sessionState: 'idle',
  tradeVersion: 0,

  setSelectedAccountId: (id: string) => {
    set({ selectedAccountId: id })
    void get().refresh()
  },

  setTodaySession: (s: Session | null) => {
    set({ todaySession: s })
  },

  bumpTradeVersion: () => set((state) => ({ tradeVersion: state.tradeVersion + 1 })),

  refresh: async () => {
    const { selectedAccountId } = get()
    if (!selectedAccountId) return

    const [sessionRes, stateRes] = await Promise.all([
      ipc.sessions.getToday(selectedAccountId),
      ipc.rules.getSessionState(selectedAccountId),
    ])

    const todaySession = sessionRes.ok ? sessionRes.data : null
    const sessionStateDTO = stateRes.ok ? stateRes.data : null
    const sessionState: SessionState = sessionStateDTO?.state ?? 'idle'

    set({ todaySession, sessionStateDTO, sessionState })
  },
}))
