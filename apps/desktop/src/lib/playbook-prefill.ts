/**
 * Pure pre-fill logic for the New Trade panel's "Use playbook" feature.
 *
 * Returns a partial FormState patch from a Playbook. The caller merges this
 * into the current form state; live prices are never touched.
 *
 * Pure: no IPC, no side-effects — testable in vitest without DOM.
 */

import type { Playbook } from '@shared/types/index'
import { INVALIDATION_CHIPS } from '../features/pre-trade/constants/invalidation-chips'

export interface PlaybookPatch {
  pairId: string | null
  setupId: string
  killzoneId: string | null
  riskPctStr: string | null // null = don't change
  invalidation: string | null // null = don't change
  chipId: string | null // the chip id that was applied, or null
}

/**
 * Derive the form patch for a given playbook.
 *
 * Risk: `defaultRiskPct` is stored as basis points (1.5% → 150). Returns the
 * display string "1.5" for the risk-percent input, or null if not set.
 *
 * Invalidation: if `defaultInvalidationChip` is a known chip id, resolves its
 * label (which satisfies the ≥20-char honesty gate). If the chip is unknown or
 * null, returns null (leaving the current invalidation text untouched).
 */
export function buildPlaybookPatch(playbook: Playbook): PlaybookPatch {
  const chip = playbook.defaultInvalidationChip
    ? (INVALIDATION_CHIPS.find((c) => c.id === playbook.defaultInvalidationChip) ?? null)
    : null

  const riskPctStr =
    playbook.defaultRiskPct !== null
      ? (playbook.defaultRiskPct / 100).toFixed(2).replace(/\.?0+$/, '')
      : null

  return {
    pairId: playbook.pairId,
    setupId: playbook.setupId,
    killzoneId: playbook.killzoneId,
    riskPctStr,
    invalidation: chip ? chip.label : null,
    chipId: chip ? chip.id : null,
  }
}
