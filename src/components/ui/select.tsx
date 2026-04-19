import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  options: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  label?: string
  hint?: string
  error?: string
  searchable?: boolean
  disabled?: boolean
  className?: string
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  label,
  hint,
  error,
  searchable,
  disabled,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    if (open && searchable) setTimeout(() => searchRef.current?.focus(), 0)
  }, [open, searchable])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleTriggerKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o) }
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  return (
    <div className={cn('relative flex flex-col gap-1.5', className)} ref={containerRef}>
      {label && (
        <label className="text-caption font-medium text-text-secondary">{label}</label>
      )}
      <button
        type="button"
        disabled={disabled}
        onKeyDown={handleTriggerKey}
        onClick={() => { if (!disabled) setOpen((o) => !o) }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-[38px] w-full items-center justify-between rounded-[10px] border border-border bg-surface-elevated px-3',
          'text-body transition-colors focus:border-accent-a focus:outline-none focus:shadow-focus',
          selected ? 'text-text-primary' : 'text-text-muted',
          error && 'border-danger',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-text-muted transition-transform duration-150', open && 'rotate-180')}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full z-50 mt-1 w-full rounded-[10px] border border-border bg-surface-elevated shadow-lg"
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.5} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted"
              />
            </div>
          )}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-body-sm text-text-muted">No results</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => { onChange?.(opt.value); setOpen(false); setQuery('') }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-body text-text-primary hover:bg-surface',
                    opt.value === value && 'text-accent-a',
                  )}
                >
                  <span>{opt.label}</span>
                  {opt.value === value && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {hint && !error && <p className="text-caption text-text-muted">{hint}</p>}
      {error && <p className="text-caption text-danger">{error}</p>}
    </div>
  )
}
