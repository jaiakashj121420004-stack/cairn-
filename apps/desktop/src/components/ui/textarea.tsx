import { forwardRef } from 'react'
import { cn } from '../../lib/cn'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-caption font-medium text-text-secondary">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            'min-h-[80px] w-full resize-none rounded-[10px] border border-border bg-surface-elevated px-3 py-2',
            'text-body text-text-primary placeholder:text-text-muted',
            'transition-colors focus:border-accent-a focus:outline-none focus:shadow-focus',
            error && 'border-danger focus:border-danger',
            className,
          )}
          {...props}
        />
        {hint && !error && <p className="text-caption text-text-muted">{hint}</p>}
        {error && <p className="text-caption text-danger">{error}</p>}
      </div>
    )
  },
)
Textarea.displayName = 'Textarea'
