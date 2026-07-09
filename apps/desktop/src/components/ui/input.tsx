import { forwardRef } from 'react'
import { cn } from '../../lib/cn'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  unit?: string
  numeric?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, unit, numeric, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-caption font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2',
              'text-body text-text-primary placeholder:text-text-muted',
              'transition-colors focus:border-primary focus:outline-none focus:shadow-focus',
              numeric && 'pr-14 text-right font-mono tabular-nums',
              error && 'border-danger focus:border-danger',
              className,
            )}
            {...props}
          />
          {unit && (
            <span className="pointer-events-none absolute right-3 select-none font-mono text-caption text-text-muted">
              {unit}
            </span>
          )}
        </div>
        {hint && !error && <p className="text-caption text-text-muted">{hint}</p>}
        {error && <p className="text-caption text-danger">{error}</p>}
      </div>
    )
  },
)
Input.displayName = 'Input'
