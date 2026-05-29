/**
 * One-tap emotional state presets for the pre-trade state section.
 *
 * Field mapping to DB columns:
 *   calmScore    → pre_calm_score    ("Calm", 1=scattered  / 10=focused)
 *   urgencyScore → pre_urgency_score ("Urgency", 1=patient  / 10=chasing)
 *   needScore    → pre_need_score    ("Need to win", 1=detached / 10=desperate)
 *
 * Values are chosen so that Tilted exceeds the emotional_state_gate rule's
 * default thresholds (maxUrgency=7, maxNeed=6), causing a warning.
 */
export interface EmotionPreset {
  id: 'focused' | 'neutral' | 'tilted'
  label: string
  calmScore: number
  urgencyScore: number
  needScore: number
}

export const EMOTION_PRESETS: readonly EmotionPreset[] = [
  { id: 'focused', label: 'Focused', calmScore: 8, urgencyScore: 3, needScore: 2 },
  { id: 'neutral', label: 'Neutral', calmScore: 6, urgencyScore: 5, needScore: 4 },
  { id: 'tilted',  label: 'Tilted',  calmScore: 4, urgencyScore: 8, needScore: 7 },
] as const
