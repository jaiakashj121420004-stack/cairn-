import { useState } from 'react'
import { cn } from '../../lib/cn'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Applied to the tooltip popup content */
  className?: string
  /** Applied to the outer wrapper div */
  wrapperClassName?: string
}

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  wrapperClassName,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div
      className={cn('relative inline-flex', wrapperClassName)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-[6px] border border-border bg-surface-elevated px-2.5 py-1.5 text-caption text-text-primary shadow-lg',
            side === 'top' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
            side === 'bottom' && 'top-full left-1/2 mt-1.5 -translate-x-1/2',
            side === 'left' && 'right-full top-1/2 mr-1.5 -translate-y-1/2',
            side === 'right' && 'left-full top-1/2 ml-1.5 -translate-y-1/2',
            className,
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}
