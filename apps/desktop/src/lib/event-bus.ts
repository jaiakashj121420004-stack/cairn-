// Typed renderer-side event bus — receives push notifications from the main
// process after every mutating trade IPC call. Components subscribe here
// instead of polling or relying on each call-site bumping a version counter.
//
// Architecture:
//   main process                  preload                   renderer
//   e.sender.send('cairn:event') → ipcRenderer.on → eventListeners map → eventBus.on callbacks

export type CairnEventName =
  | 'trade.placed'
  | 'trade.closed'
  | 'trade.reflected'
  | 'trade.partial-closed'
  | 'session.locked'
  | 'session.unlocked'
  | 'rule.violated'

export interface CairnEventPayload {
  'trade.placed': { tradeId: string; accountId: string }
  'trade.closed': { tradeId: string; accountId: string; pnlCents: number }
  'trade.reflected': { tradeId: string; accountId: string }
  'trade.partial-closed': { tradeId: string; accountId: string }
  'session.locked': { accountId: string }
  'session.unlocked': { accountId: string }
  'rule.violated': { accountId: string; ruleKey: string; tradeId: string | null }
}

type Listener<N extends CairnEventName> = (payload: CairnEventPayload[N]) => void

export const eventBus = {
  on<N extends CairnEventName>(name: N, cb: Listener<N>): () => void {
    return window.api.events.on(name, cb as (p: unknown) => void)
  },

  off<N extends CairnEventName>(name: N, cb: Listener<N>): void {
    window.api.events.off(name, cb as (p: unknown) => void)
  },
}
