/**
 * ICT-native quick-chips for the invalidation field.
 *
 * Each chip text must be ≥ 20 characters so it satisfies the honesty-gate
 * minimum without requiring free-text input (CLAUDE.md §2.3).
 *
 * To add chips: append to INVALIDATION_CHIPS only — no component changes needed.
 */
export interface InvalidationChip {
  id: string
  label: string
}

export const INVALIDATION_CHIPS: readonly InvalidationChip[] = [
  { id: 'below-ob', label: "Below the OB I'm entering at" },
  { id: 'sweep-no-rev', label: 'Liquidity sweep fails to reverse' },
  { id: 'back-in-fvg', label: 'Closes back inside the FVG' },
  { id: 'mss-opposing', label: 'MSS in opposing direction' },
  { id: 'dxy-contradicts', label: 'DXY contradicts the bias' },
  { id: 'reclaims-struct', label: 'Price reclaims the broken structure' },
  { id: 'kz-ends', label: 'Killzone ends without entry' },
  { id: 'volume-dries', label: 'Volume dries up before entry' },
] as const

/** Minimum character count that the invalidation gate enforces. */
export const INVALIDATION_MIN_CHARS = 20
