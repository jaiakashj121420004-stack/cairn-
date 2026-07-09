import { Loader2 } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary: [
    'bg-primary text-primary-foreground font-semibold',
    'shadow-btn-primary',
    'hover:brightness-[1.08] hover:shadow-[var(--btn-primary-shadow),0_6px_22px_hsl(var(--primary)/0.45)]',
    'active:brightness-[0.96] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.24)]',
    'focus-visible:ring-primary/40',
    'disabled:opacity-40',
  ].join(' '),
  secondary: [
    'border border-border bg-surface/60 text-text-primary',
    'shadow-btn-secondary',
    'hover:bg-surface-elevated hover:border-primary/40',
    'active:brightness-[0.96]',
    'focus-visible:ring-primary/30',
    'disabled:opacity-40',
  ].join(' '),
  ghost: [
    'bg-transparent text-text-secondary',
    'hover:bg-surface-elevated hover:text-text-primary',
    'active:brightness-[0.96]',
    'focus-visible:ring-primary/30',
    'disabled:opacity-40',
  ].join(' '),
  destructive: [
    'bg-danger text-background font-semibold',
    'shadow-btn-destructive',
    'hover:brightness-[1.08] hover:shadow-[var(--btn-destructive-shadow),0_6px_22px_hsl(var(--danger)/0.45)]',
    'active:brightness-[0.96]',
    'focus-visible:ring-danger/40',
    'disabled:opacity-40',
  ].join(' '),
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
        'inline-flex items-center justify-center gap-2 rounded-[10px] font-medium',
        'transition-[filter,box-shadow,background-color,border-color] duration-[100ms]',
        'active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2',
        'disabled:cursor-not-allowed disabled:pointer-events-none',
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
