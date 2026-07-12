// @vitest-environment node
//
// Renderer-side contract-spec helpers (M2c). previewPipValueCents must mirror the
// authoritative electron derivation on the exact-pip domain; encode/decode must
// round-trip.
import { describe, it, expect } from 'vitest'
import {
  decodeTickSize,
  encodeTickSize,
  previewPipValueCents,
} from '../../../src/lib/contract-spec'

describe('encodeTickSize / decodeTickSize', () => {
  it('encodes a real tick to stored units', () => {
    expect(encodeTickSize(0.25, 2)).toBe(250) // ES-style
    expect(encodeTickSize(0.0001, 4)).toBe(10) // EURUSD 1 pip
    expect(encodeTickSize(0.00001, 4)).toBe(1) // fractional pip
  })

  it('round-trips encode → decode', () => {
    expect(decodeTickSize(encodeTickSize(0.25, 2), 2)).toBeCloseTo(0.25, 10)
    expect(decodeTickSize(encodeTickSize(0.0001, 4), 4)).toBeCloseTo(0.0001, 10)
  })

  it('returns 0 for a non-finite tick', () => {
    expect(encodeTickSize(Number.NaN, 2)).toBe(0)
  })
})

describe('previewPipValueCents', () => {
  it('matches the known contract specs', () => {
    expect(previewPipValueCents(10, 1000)).toBe(1000) // EURUSD $10/pip
    expect(previewPipValueCents(250, 1250)).toBe(50) // ES $50/point
  })

  it('is 0 for a non-positive tick size', () => {
    expect(previewPipValueCents(0, 1250)).toBe(0)
    expect(previewPipValueCents(-1, 1250)).toBe(0)
  })
})
