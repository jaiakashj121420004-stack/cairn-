import { Check } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '../../lib/cn'

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <label
        htmlFor={inputId}
        className={cn('flex cursor-pointer items-center gap-2.5', className)}
      >
        <div className="relative h-4 w-4 shrink-0">
          <input ref={ref} id={inputId} type="checkbox" className="peer sr-only" {...props} />
          <div className="h-4 w-4 rounded-[4px] border border-border bg-surface-elevated transition-colors peer-checked:border-accent-a peer-checked:bg-accent-a peer-disabled:opacity-50" />
          <Check
            className="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 text-background opacity-0 transition-opacity peer-checked:opacity-100"
            strokeWidth={2.5}
          />
        </div>
        {label && <span className="select-none text-body text-text-primary">{label}</span>}
      </label>
    )
  },
)
Checkbox.displayName = 'Checkbox'
