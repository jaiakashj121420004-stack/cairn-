// Per-asset-class configuration for instrument setup (multi-asset, M1). Pure and
// tested. Cairn's money model is already asset-class-agnostic (P&L runs off a
// calibrated value-per-unit-per-lot), but adding a non-forex instrument used to
// mean hand-deriving that number with forex ("pip") wording. This gives each
// class sensible defaults + the right vocabulary ("pip" for forex/metals, "point"
// otherwise) so the New-pair form guides instead of confuses.

import type { AssetClass } from '@shared/types/enums'

export interface AssetClassConfig {
  value: AssetClass
  label: string
  /** What one price increment is called for this class. */
  unitTerm: 'pip' | 'point'
  /** Sensible default number of price decimals that equal one unit. */
  pipDecimalDefault: number
  /** Sensible default value (cents) of one unit per standard lot / contract. */
  pipValueDefaultCents: number
}

const OTHER: AssetClassConfig = {
  value: 'other',
  label: 'Other',
  unitTerm: 'point',
  pipDecimalDefault: 2,
  pipValueDefaultCents: 100,
}

/** All asset classes, in display order. Mirrors the DB CHECK on `pairs.asset_class`. */
export const ASSET_CLASSES: readonly AssetClassConfig[] = [
  {
    value: 'forex',
    label: 'Forex',
    unitTerm: 'pip',
    pipDecimalDefault: 4,
    pipValueDefaultCents: 1000,
  },
  {
    value: 'commodities',
    label: 'Commodities',
    unitTerm: 'pip',
    pipDecimalDefault: 2,
    pipValueDefaultCents: 100,
  },
  {
    value: 'indices',
    label: 'Indices',
    unitTerm: 'point',
    pipDecimalDefault: 0,
    pipValueDefaultCents: 1000,
  },
  {
    value: 'crypto',
    label: 'Crypto',
    unitTerm: 'point',
    pipDecimalDefault: 0,
    pipValueDefaultCents: 100,
  },
  {
    value: 'stocks',
    label: 'Stocks',
    unitTerm: 'point',
    pipDecimalDefault: 2,
    pipValueDefaultCents: 100,
  },
  OTHER,
]

/** Resolve a stored `asset_class` string to its config, falling back to "Other". */
export function assetClassConfig(assetClass: string): AssetClassConfig {
  return ASSET_CLASSES.find((a) => a.value === assetClass) ?? OTHER
}
