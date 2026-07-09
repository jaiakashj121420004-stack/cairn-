import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

interface RuleBreak {
  ruleKey: string
  count: number
}

interface Props {
  score: number
  window: number
  ruleBreakdown: RuleBreak[]
  shake?: boolean
}

const RADIUS = 104
const STROKE_WIDTH = 14
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function tierColor(score: number): string {
  if (score >= 95) return 'hsl(var(--accent-a))'
  if (score >= 80) return 'hsl(var(--accent-b))'
  if (score >= 60) return 'hsl(var(--warning))'
  return 'hsl(var(--danger))'
}

function tierLabel(score: number): string {
  if (score >= 95) return 'Elite'
  if (score >= 80) return 'Consistent'
  if (score >= 60) return 'Developing'
  return 'At Risk'
}

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0)
  const shouldReduce = useReducedMotion()
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (shouldReduce) {
      setValue(target)
      return undefined
    }
    const start = performance.now()
    const from = 0
    function step(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(from + (target - from) * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration, shouldReduce])

  return value
}

// Crack paths rendered below 60%
const CRACK_PATHS = [
  'M 163 47 L 169 38 L 173 29 L 168 22 L 176 14',
  'M 57 183 L 50 189 L 44 195 L 38 203',
  'M 105 213 L 112 218 L 118 223 L 127 218 L 134 213',
]

function ruleLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function DisciplineRing({ score, window: win, ruleBreakdown, shake = false }: Props) {
  const displayScore = useCountUp(score)
  const shouldReduce = useReducedMotion()
  const [hovered, setHovered] = useState(false)
  const color = tierColor(score)
  const hasCracks = score < 60

  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE
  const animatedOffset = shouldReduce ? offset : CIRCUMFERENCE

  const shakeVariants = {
    idle: { x: 0 },
    shake: {
      x: [0, -4, 4, -4, 4, -2, 2, 0],
      transition: { duration: 0.3 },
    },
  }

  return (
    <motion.div
      variants={shakeVariants}
      animate={shake ? 'shake' : 'idle'}
      className="summit-halo relative flex flex-col items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg viewBox="0 0 240 240" width={200} height={200} aria-label={`Discipline score ${score}%`}>
        <defs>
          {/* Neon glow — blurs the colored stroke and merges it back so the
              halo takes the current tier hue automatically. */}
          <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle
          cx={120}
          cy={120}
          r={RADIUS}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={STROKE_WIDTH}
        />

        {/* Progress arc — glowing neon sweep */}
        <motion.circle
          cx={120}
          cy={120}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          filter="url(#ring-glow)"
          initial={{ strokeDashoffset: animatedOffset }}
          animate={{ strokeDashoffset: offset }}
          transition={
            shouldReduce ? { duration: 0 } : { duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }
          }
          transform="rotate(-90 120 120)"
        />

        {/* Outer glow at ≥95% */}
        {score >= 95 && (
          <circle
            cx={120}
            cy={120}
            r={RADIUS + STROKE_WIDTH / 2 + 4}
            fill="none"
            stroke={color}
            strokeWidth={2}
            opacity={0.25}
          />
        )}

        {/* Crack paths for score < 60 */}
        {hasCracks &&
          CRACK_PATHS.map((d, i) => (
            <motion.path
              key={i}
              d={d}
              fill="none"
              stroke="hsl(var(--danger))"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.6 }}
              transition={shouldReduce ? { duration: 0 } : { duration: 0.4, delay: 0.8 + i * 0.1 }}
            />
          ))}

        {/* Center text — score */}
        <text
          x={120}
          y={112}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={38}
          fontWeight={700}
          fontFamily="'JetBrains Mono', monospace"
          fill="hsl(var(--text-primary))"
        >
          {displayScore}
        </text>
        <text
          x={120}
          y={136}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={500}
          fill={color}
          fontFamily="Inter, sans-serif"
          letterSpacing="0.05em"
        >
          {tierLabel(score).toUpperCase()}
        </text>
        <text
          x={120}
          y={152}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={10}
          fill="hsl(var(--text-muted))"
          fontFamily="Inter, sans-serif"
        >
          last {win} trades
        </text>
      </svg>

      {/* Hover breakdown */}
      <AnimatePresence>
        {hovered && ruleBreakdown.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-0 left-1/2 z-10 w-56 -translate-x-1/2 translate-y-full rounded-[10px] border border-border bg-surface-elevated p-3 shadow-lg"
          >
            <p className="mb-2 text-caption font-medium text-text-muted">Top rule breaks</p>
            <ul className="space-y-1.5">
              {ruleBreakdown.map((r) => (
                <li key={r.ruleKey} className="flex items-center justify-between">
                  <span className="truncate text-caption text-text-secondary">
                    {ruleLabel(r.ruleKey)}
                  </span>
                  <span
                    className={cn(
                      'ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-micro font-semibold',
                      r.count >= 3 ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning',
                    )}
                  >
                    ×{r.count}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
