import { cn } from '../../lib/cn'

interface CardProps {
  className?: string
  children: React.ReactNode
  padding?: 'compact' | 'default' | 'large'
  hoverable?: boolean
}

const paddingClasses = {
  compact: 'p-4',
  default: 'p-5',
  large: 'p-6',
}

export function Card({ className, children, padding = 'default', hoverable }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[14px] border border-border bg-surface',
        paddingClasses[padding],
        hoverable && 'transition-colors hover:border-border-strong',
        className,
      )}
    >
      {children}
    </div>
  )
}
