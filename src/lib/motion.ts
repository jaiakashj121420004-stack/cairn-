export { useReducedMotion } from 'framer-motion'

// §4.6 Spring presets
export const springDefault = { type: 'spring' as const, stiffness: 260, damping: 26 }
export const springBouncy = { type: 'spring' as const, stiffness: 400, damping: 20 }
export const springSettled = { type: 'spring' as const, stiffness: 180, damping: 30 }

// §4.6 Standard durations (seconds, for non-spring transitions)
export const duration = {
  instant: 0.08,
  short: 0.16,
  base: 0.24,
  long: 0.4,
  hero: 0.6,
} as const

// When reduced motion is preferred, collapse animations to near-instant cross-fades.
export function respectReducedMotion<T extends object>(
  transition: T,
): T | { duration: number; type: 'tween' } {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return { duration: 0.01, type: 'tween' as const }
  }
  return transition
}

// §4.6 Reusable variant presets for Framer Motion
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const scaleIn = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.98, opacity: 0 },
}

export const slideUp = {
  initial: { y: 12, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 8, opacity: 0 },
}

// Stagger children — card grid reveal (40ms stagger per §4.6)
export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.04 } },
}

export const staggerItem = {
  initial: { y: 12, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: springDefault },
}
