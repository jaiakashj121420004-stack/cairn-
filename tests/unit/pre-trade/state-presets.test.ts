import { describe, it, expect } from 'vitest'
import { STATE_PRESETS } from '../../../src/features/pre-trade/constants/state-presets'

describe('STATE_PRESETS', () => {
  it('contains exactly three presets: focused, neutral, tilted', () => {
    expect(STATE_PRESETS.map((p) => p.id)).toEqual(['focused', 'neutral', 'tilted'])
  })

  it('Focused maps to calmScore:8, urgencyScore:2, needScore:2', () => {
    const p = STATE_PRESETS.find((x) => x.id === 'focused')!
    expect(p.calmScore).toBe(8)
    expect(p.urgencyScore).toBe(2)
    expect(p.needScore).toBe(2)
  })

  it('Neutral maps to calmScore:5, urgencyScore:5, needScore:5', () => {
    const p = STATE_PRESETS.find((x) => x.id === 'neutral')!
    expect(p.calmScore).toBe(5)
    expect(p.urgencyScore).toBe(5)
    expect(p.needScore).toBe(5)
  })

  it('Tilted maps to calmScore:2, urgencyScore:8, needScore:8', () => {
    const p = STATE_PRESETS.find((x) => x.id === 'tilted')!
    expect(p.calmScore).toBe(2)
    expect(p.urgencyScore).toBe(8)
    expect(p.needScore).toBe(8)
  })

  it('all score values are in the 1–10 slider range', () => {
    for (const p of STATE_PRESETS) {
      for (const score of [p.calmScore, p.urgencyScore, p.needScore]) {
        expect(score).toBeGreaterThanOrEqual(1)
        expect(score).toBeLessThanOrEqual(10)
      }
    }
  })
})
