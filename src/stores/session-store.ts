import { create } from 'zustand'

export type SessionState = 'idle' | 'active' | 'paused' | 'locked'

interface SessionStore {
  sessionState: SessionState
}

// Minimal stub — expanded in session bias phase (§13.12 build order step 9)
export const useSessionStore = create<SessionStore>()(() => ({
  sessionState: 'idle',
}))
