import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'

type Highlight = 'accent-a' | 'accent-b' | 'danger' | 'info' | 'warning'

interface GlassCardProps {
  className?: string
  children: React.ReactNode
  padding?: 'none' | 'compact' | 'default' | 'large'
  delay?: number
  highlight?: Highlight
  glow?: boolean
  hero?: boolean
}

const paddingClasses = {
  none: '',
  compact: 'p-4',
  default: 'p-5',
  large: 'p-6',
}

const glowClasses: Record<Highlight, string> = {
  'accent-a': 'card-glow-a',
  'accent-b': 'card-glow-b',
  danger: 'card-glow-danger',
  info: 'card-glow-info',
  warning: '',
}

const crownClasses: Record<Highlight, string> = {
  'accent-a': 'crown-a',
  'accent-b': 'crown-b',
  danger: 'crown-danger',
  info: 'crown-info',
  warning: 'crown-warning',
}

export function GlassCard({
  className,
  children,
  padding = 'default',
  delay = 0,
  highlight,
  glow = false,
  hero = false,
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay }}
      className={cn(
        hero ? 'glass-hero' : 'glass',
        'rounded-[16px] relative',
        highlight && crownClasses[highlight],
        highlight && glow && glowClasses[highlight],
        paddingClasses[padding],
        className,
      )}
    >
      {children}
    </motion.div>
  )
}
