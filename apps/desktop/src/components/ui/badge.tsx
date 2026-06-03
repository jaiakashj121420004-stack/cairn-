import { cn } from '../../lib/cn'

type Variant = 'default' | 'success' | 'process' | 'warning' | 'danger' | 'info' | 'neutral'
type Shape = 'solid' | 'outline'

interface BadgeProps {
  variant?: Variant
  shape?: Shape
  className?: string
  children: React.ReactNode
}

const solidClasses: Record<Variant, string> = {
  default: 'bg-surface-elevated text-text-secondary',
  success: 'bg-accent-a/15 text-accent-a',
  process: 'bg-accent-b/15 text-accent-b',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
  neutral: 'bg-border text-text-muted',
}

const outlineClasses: Record<Variant, string> = {
  default: 'border border-border text-text-secondary',
  success: 'border border-accent-a/40 text-accent-a',
  process: 'border border-accent-b/40 text-accent-b',
  warning: 'border border-warning/40 text-warning',
  danger: 'border border-danger/40 text-danger',
  info: 'border border-info/40 text-info',
  neutral: 'border border-border-strong text-text-muted',
}

export function Badge({ variant = 'default', shape = 'outline', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-badge px-1.5 py-0.5 font-mono text-micro font-medium uppercase tracking-wide',
        shape === 'solid' ? solidClasses[variant] : outlineClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
