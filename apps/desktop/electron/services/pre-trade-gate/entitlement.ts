/**
 * Desktop-local entitlement gate for the pre-trade gate (P0.7, paid feature).
 *
 * The authoritative `EntitlementService.canUse(userId, 'pre_trade_gate')` lives on
 * the server (apps/server/src/billing), but the desktop is local-first and must
 * decide OFFLINE whether to show the gate UI. The only local signal is the session's
 * cached entitlement (`ActiveSession.entitlement`), so this is the ONE place the
 * desktop gates the feature — not scattered `if (plan === 'pro')` checks (§2.14).
 *
 * Mirrors the server's `planForEntitlement` + `planHasFeature('pre_trade_gate')`:
 * `pre_trade_gate` is a wildcard `pro` feature, so trial/pro grant it, free does not.
 * A free user still gets read-only fill CAPTURE (existing behavior) — only the gate
 * UI is paywalled (docs/pre-trade-gate-popup.md §3.2).
 */
import type { Entitlement } from '@cairn/shared-types'

/** True when the session's entitlement grants the paid pre-trade gate. */
export function canUsePreTradeGate(entitlement: Entitlement): boolean {
  return entitlement === 'pro' || entitlement === 'trial'
}
