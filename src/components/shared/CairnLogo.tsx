import { motion } from 'framer-motion'

/**
 * Cairn brand mark — three stacked stones.
 * The summit stone breathes with a slow lime glow pulse.
 */
export function CairnLogo({ size = 28, animated = true }: { size?: number; animated?: boolean }) {
  const stoneStroke = 'rgba(255,255,255,0.22)'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Stone gradient — graphite to graphite-light */}
        <linearGradient id="stone-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
        </linearGradient>
        {/* Summit stone gradient — lime accent */}
        <linearGradient id="summit-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="hsl(74,74%,72%)" />
          <stop offset="100%" stopColor="hsl(74,74%,54%)" />
        </linearGradient>
        {/* Glow filter */}
        <filter id="summit-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Bottom stone — wide, low */}
      <ellipse cx="16" cy="25" rx="10" ry="3.2" fill="url(#stone-grad)" stroke={stoneStroke} strokeWidth="0.75" />
      {/* Mid-large stone */}
      <ellipse cx="14.5" cy="19" rx="7.5" ry="2.6" fill="url(#stone-grad)" stroke={stoneStroke} strokeWidth="0.75" />
      {/* Mid stone */}
      <ellipse cx="17" cy="13.5" rx="5.5" ry="2.1" fill="url(#stone-grad)" stroke={stoneStroke} strokeWidth="0.75" />
      {/* Summit stone — lime, glowing */}
      <motion.ellipse
        cx="15.5"
        cy="8.5"
        rx="3.6"
        ry="1.6"
        fill="url(#summit-grad)"
        filter="url(#summit-glow)"
        animate={animated ? { opacity: [1, 0.78, 1] } : { opacity: 1 }}
        transition={animated ? { duration: 3.6, ease: 'easeInOut', repeat: Infinity } : {}}
      />
      {/* Summit beacon spark */}
      <motion.circle
        cx="15.5"
        cy="4.5"
        r="0.9"
        fill="hsl(74,74%,75%)"
        filter="url(#summit-glow)"
        animate={animated ? { opacity: [0.6, 1, 0.6], r: [0.9, 1.1, 0.9] } : { opacity: 0.6 }}
        transition={animated ? { duration: 2.4, ease: 'easeInOut', repeat: Infinity } : {}}
      />
    </svg>
  )
}
