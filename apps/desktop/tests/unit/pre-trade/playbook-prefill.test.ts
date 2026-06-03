// @vitest-environment node
//
// Unit tests for the playbook pre-fill helper.
// Pure function: no IPC, no DOM.

import { describe, it, expect } from 'vitest'
import { buildPlaybookPatch } from '../../../src/lib/playbook-prefill'
import type { Playbook } from '../../../shared/types/index'

const now = Date.UTC(2024, 0, 1)

function makePlaybook(overrides: Partial<Playbook> = {}): Playbook {
  return {
    id: 'pb-1',
    accountId: 'acc-1',
    name: 'Test Playbook',
    pairId: 'pair-eurusd',
    setupId: 'setup-fvg',
    killzoneId: 'kz-london',
    requiredConfluenceMd: null,
    defaultRiskPct: 150, // 1.5%
    defaultInvalidationChip: 'below-ob',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    ...overrides,
  }
}

describe('buildPlaybookPatch — full playbook', () => {
  it('maps pairId, setupId, killzoneId directly', () => {
    const patch = buildPlaybookPatch(makePlaybook())
    expect(patch.pairId).toBe('pair-eurusd')
    expect(patch.setupId).toBe('setup-fvg')
    expect(patch.killzoneId).toBe('kz-london')
  })

  it('converts defaultRiskPct from basis points to display string (150 → "1.5")', () => {
    expect(buildPlaybookPatch(makePlaybook({ defaultRiskPct: 150 })).riskPctStr).toBe('1.5')
  })

  it('converts 200 bps → "2"', () => {
    expect(buildPlaybookPatch(makePlaybook({ defaultRiskPct: 200 })).riskPctStr).toBe('2')
  })

  it('converts 175 bps → "1.75"', () => {
    expect(buildPlaybookPatch(makePlaybook({ defaultRiskPct: 175 })).riskPctStr).toBe('1.75')
  })

  it('resolves a known chip id to the chip label', () => {
    const patch = buildPlaybookPatch(makePlaybook({ defaultInvalidationChip: 'below-ob' }))
    // INVALIDATION_CHIPS id "below-ob" → label "Below the OB I'm entering at"
    expect(patch.invalidation).toBe("Below the OB I'm entering at")
    expect(patch.chipId).toBe('below-ob')
  })

  it('resolved chip label is ≥ 20 chars (honesty gate)', () => {
    const patch = buildPlaybookPatch(makePlaybook({ defaultInvalidationChip: 'below-ob' }))
    expect((patch.invalidation ?? '').length).toBeGreaterThanOrEqual(20)
  })
})

describe('buildPlaybookPatch — null fields', () => {
  it('returns null riskPctStr when defaultRiskPct is null', () => {
    expect(buildPlaybookPatch(makePlaybook({ defaultRiskPct: null })).riskPctStr).toBeNull()
  })

  it('returns null pairId when playbook.pairId is null', () => {
    const patch = buildPlaybookPatch(makePlaybook({ pairId: null }))
    expect(patch.pairId).toBeNull()
  })

  it('returns null killzoneId when playbook.killzoneId is null', () => {
    const patch = buildPlaybookPatch(makePlaybook({ killzoneId: null }))
    expect(patch.killzoneId).toBeNull()
  })

  it('returns null invalidation and chipId when defaultInvalidationChip is null', () => {
    const patch = buildPlaybookPatch(makePlaybook({ defaultInvalidationChip: null }))
    expect(patch.invalidation).toBeNull()
    expect(patch.chipId).toBeNull()
  })

  it('returns null invalidation for an unknown chip id (does not crash)', () => {
    const patch = buildPlaybookPatch(makePlaybook({ defaultInvalidationChip: 'nonexistent-chip' }))
    expect(patch.invalidation).toBeNull()
    expect(patch.chipId).toBeNull()
  })
})

describe('buildPlaybookPatch — all chips resolve to ≥ 20 chars', () => {
  // Verify the invariant for every shipped chip, not just one.
  const CHIP_IDS = [
    'below-ob',
    'sweep-no-rev',
    'back-in-fvg',
    'mss-opposing',
    'dxy-contradicts',
    'reclaims-struct',
    'kz-ends',
    'volume-dries',
  ] as const

  CHIP_IDS.forEach((chipId) => {
    it(`chip "${chipId}" label satisfies the 20-char honesty gate`, () => {
      const patch = buildPlaybookPatch(makePlaybook({ defaultInvalidationChip: chipId }))
      expect(patch.invalidation).not.toBeNull()
      expect((patch.invalidation ?? '').length).toBeGreaterThanOrEqual(20)
    })
  })
})
