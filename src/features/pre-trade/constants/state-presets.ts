/**
 * One-tap emotional state presets for the pre-trade state section.
 * Each preset sets calmScore / urgencyScore / needScore simultaneously.
 * Manually adjusting any slider after selecting a preset clears the highlight.
 */
export interface StatePreset {
  id: 'focused' | 'neutral' | 'tilted'
  label: string
  calmScore: number
  urgencyScore: number
  needScore: number
}

export const STATE_PRESETS: readonly StatePreset[] = [
  { id: 'focused', label: 'Focused', calmScore: 8, urgencyScore: 2, needScore: 2 },
  { id: 'neutral', label: 'Neutral', calmScore: 5, urgencyScore: 5, needScore: 5 },
  { id: 'tilted',  label: 'Tilted',  calmScore: 2, urgencyScore: 8, needScore: 8 },
] as const
