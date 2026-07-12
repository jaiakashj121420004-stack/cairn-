// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { ASSET_CLASSES, assetClassConfig } from '../../../src/lib/asset-class'

describe('asset-class config', () => {
  it('covers all six DB-allowed asset classes, including stocks', () => {
    const values = ASSET_CLASSES.map((a) => a.value).sort()
    expect(values).toEqual(['commodities', 'crypto', 'forex', 'indices', 'other', 'stocks'].sort())
  })

  it('uses pip vocabulary for forex and point for indices/crypto/stocks', () => {
    expect(assetClassConfig('forex').unitTerm).toBe('pip')
    expect(assetClassConfig('indices').unitTerm).toBe('point')
    expect(assetClassConfig('crypto').unitTerm).toBe('point')
    expect(assetClassConfig('stocks').unitTerm).toBe('point')
  })

  it('gives forex 4-decimal / $10-per-pip defaults and indices 0-decimal defaults', () => {
    expect(assetClassConfig('forex').pipDecimalDefault).toBe(4)
    expect(assetClassConfig('forex').pipValueDefaultCents).toBe(1000)
    expect(assetClassConfig('indices').pipDecimalDefault).toBe(0)
  })

  it('falls back to "Other" for an unknown class', () => {
    const cfg = assetClassConfig('futures')
    expect(cfg.value).toBe('other')
    expect(cfg.unitTerm).toBe('point')
  })
})
