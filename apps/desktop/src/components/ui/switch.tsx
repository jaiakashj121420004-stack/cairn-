import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { springDefault } from '../../lib/motion'

interface SwitchProps {
  checked?: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
}

export function Switch({ checked = false, onChange, label, disabled, className }: SwitchProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2.5',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange?.(!checked)
        }}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          checked ? 'bg-primary' : 'bg-border-strong',
        )}
      >
        <motion.div
          className="absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-sm"
          animate={{ x: checked ? 18 : 2 }}
          transition={springDefault}
        />
      </button>
      {label && <span className="select-none text-body text-text-primary">{label}</span>}
    </label>
  )
}
