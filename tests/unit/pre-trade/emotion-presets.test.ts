import { describe, it, expect } from 'vitest'
import { EMOTION_PRESETS } from '../../../src/features/pre-trade/constants/emotion-presets'

describe('EMOTION_PRESETS', () => {
  it('contains exactly three presets: focused, neutral, tilted', () => {
    expect(EMOTION_PRESETS.map((p) => p.id)).toEqual(['focused', 'neutral', 'tilted'])
  })

  it('Focused preset values match spec', () => {
    const p = EMOTION_PRESETS.find((x) => x.id === 'focused')!
    expect(p.calmScore).toBe(8)
    expect(p.urgencyScore).toBe(3)
    expect(p.needScore).toBe(2)
  })

  it('Neutral preset values match spec', () => {
    const p = EMOTION_PRESETS.find((x) => x.id === 'neutral')!
    expect(p.calmScore).toBe(6)
    expect(p.urgencyScore).toBe(5)
    expect(p.needScore).toBe(4)
  })

  it('Tilted preset values match spec', () => {
    const p = EMOTION_PRESETS.find((x) => x.id === 'tilted')!
    expect(p.calmScore).toBe(4)
    expect(p.urgencyScore).toBe(8)
    expect(p.needScore).toBe(7)
  })

  it('Tilted urgencyScore exceeds the emotional_state_gate default maxUrgency of 7', () => {
    const tilted = EMOTION_PRESETS.find((x) => x.id === 'tilted')!
    expect(tilted.urgencyScore).toBeGreaterThan(7)
  })

  it('Tilted needScore exceeds the emotional_state_gate default maxNeed of 6', () => {
    const tilted = EMOTION_PRESETS.find((x) => x.id === 'tilted')!
    expect(tilted.needScore).toBeGreaterThan(6)
  })

  it('all score values are within the 1–10 slider range', () => {
    for (const p of EMOTION_PRESETS) {
      for (const score of [p.calmScore, p.urgencyScore, p.needScore]) {
        expect(score).toBeGreaterThanOrEqual(1)
        expect(score).toBeLessThanOrEqual(10)
      }
    }
  })
})
