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
  | 'sync:toast'
  | 'guardrail.degraded'

export interface CairnEventPayload {
  'trade.placed': { tradeId: string; accountId: string }
  'trade.closed': { tradeId: string; accountId: string; pnlCents: number }
  'trade.reflected': { tradeId: string; accountId: string }
  'trade.partial-closed': { tradeId: string; accountId: string }
  'session.locked': { accountId: string }
  'session.unlocked': { accountId: string }
  'rule.violated': { accountId: string; ruleKey: string; tradeId: string | null }
  /** Emitted by the main-process sync runner when it pauses, backs off, or hits an
   *  auth/key problem. Pre-written copy only — never any vault content. */
  'sync:toast': { level: 'error' | 'warning' | 'info'; code: string; message: string }
  /** Emitted by the rules engine (electron/services/rules-engine/guardrail.ts) when
   *  a safety rule's stored `account_rules.value` JSON fails to parse — the rule is
   *  not being enforced this cycle. `GuardrailBanner` turns this into a persistent
   *  warning pointing at Settings. Never contains secrets/vault content. */
  'guardrail.degraded': { ruleKey: string; reason: string }
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
