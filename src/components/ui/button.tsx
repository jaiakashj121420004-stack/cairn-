import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent-a text-background hover:brightness-110 focus-visible:ring-accent-a/30 disabled:opacity-40',
  secondary:
    'border border-border bg-transparent text-text-primary hover:bg-surface-elevated focus-visible:ring-accent-a/20 disabled:opacity-40',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface-elevated hover:text-text-primary focus-visible:ring-accent-a/20 disabled:opacity-40',
  destructive:
    'bg-danger text-background hover:brightness-110 focus-visible:ring-danger/30 disabled:opacity-40',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-body-sm',
  md: 'h-[38px] px-4 text-body',
  lg: 'h-11 px-6 text-body-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-[filter,background-color] duration-75',
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
