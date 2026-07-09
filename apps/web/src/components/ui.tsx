import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

/**
 * Minimal glassmorphism primitives for the web auth surface (CLAUDE.md §2.8). Kept tiny
 * and self-contained — the full design system rides along with the reused desktop
 * features once the data layer is wired; these only dress the auth/sync screens.
 */

export function Card({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-2xl backdrop-blur-xl">
      {children}
    </div>
  )
}

export function Screen({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      {children}
    </main>
  )
}

export function Heading({ children, sub }: { children: ReactNode; sub?: ReactNode }): JSX.Element {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">{children}</h1>
      {sub !== undefined ? <p className="mt-1 text-sm text-white/50">{sub}</p> : null}
    </header>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/50">
        {label}
      </span>
      {children}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-border bg-black/30 px-3 py-2.5 text-sm outline-none transition focus:border-white/30 focus:bg-black/40"
    />
  )
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }): JSX.Element {
  const base =
    'w-full rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed'
  const styles =
    variant === 'primary'
      ? 'bg-white text-black hover:bg-white/90'
      : 'border border-border bg-transparent text-white/80 hover:bg-white/5'
  return (
    <button {...props} className={`${base} ${styles}`}>
      {children}
    </button>
  )
}

export function ErrorText({ children }: { children: ReactNode }): JSX.Element | null {
  if (children === null || children === undefined || children === '') return null
  return <p className="mt-2 text-sm text-red-400">{children}</p>
}

export function MutedLink({ to, children }: { to: string; children: ReactNode }): JSX.Element {
  return (
    <a
      href={to}
      className="text-sm text-white/50 underline-offset-4 hover:text-white/80 hover:underline"
    >
      {children}
    </a>
  )
}

/** A two-option segmented toggle (e.g. monthly / annual). Controlled. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { readonly value: T; readonly label: string }[]
  value: T
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div className="inline-flex rounded-lg border border-border bg-black/30 p-1" role="tablist">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active ? 'bg-white text-black' : 'text-white/60 hover:text-white/90'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
