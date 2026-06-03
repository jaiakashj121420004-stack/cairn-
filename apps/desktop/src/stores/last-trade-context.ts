import { create } from 'zustand'

/**
 * Session-scoped context from the most recently submitted trade (status=open or planned).
 *
 * NOT persisted to disk — intentionally uses plain `create` without `persist`.
 * Each app session starts empty. Only pair/setup/mode/accountId are stored;
 * fields requiring real-time self-awareness (emotional state, urgency, need) are
 * excluded per CLAUDE.md §2.3 / §14 #32.
 */

export interface LastTradeContext {
  pairId: string
  setupId: string
  mode: 'live' | 'sim' | 'backtest'
  accountId: string
  /** ms timestamp of when the context was set */
  timestamp: number
}

interface LastTradeContextStore {
  context: LastTradeContext | null
  /** Call after a trade is successfully placed (status open). Draft saves do not set context. */
  setContext: (ctx: Omit<LastTradeContext, 'timestamp'>) => void
  clear: () => void
}

export const useLastTradeContextStore = create<LastTradeContextStore>()((set) => ({
  context: null,

  setContext: (ctx) => set({ context: { ...ctx, timestamp: Date.now() } }),

  clear: () => set({ context: null }),
}))

/** Returns `context` only if it was set within the last 6 hours. */
export function getRecentContext(
  context: LastTradeContext | null,
  accountId: string | null,
  windowMs = 6 * 60 * 60 * 1000,
): LastTradeContext | null {
  if (!context) return null
  if (accountId && context.accountId !== accountId) return null
  if (Date.now() - context.timestamp > windowMs) return null
  return context
}
