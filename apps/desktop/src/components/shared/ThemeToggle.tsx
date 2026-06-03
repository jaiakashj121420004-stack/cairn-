import { Sun, Moon, Monitor } from 'lucide-react'
import { useUiStore } from '../../stores/ui-store'
import { Tooltip } from '../ui/tooltip'

const icons = { dark: Moon, light: Sun, system: Monitor } as const
const labels = { dark: 'Dark mode', light: 'Light mode', system: 'System theme' } as const

export function ThemeToggle() {
  const { themePreference, setThemePreference } = useUiStore()

  function cycle() {
    const order = ['dark', 'light', 'system'] as const
    const next = order[(order.indexOf(themePreference) + 1) % order.length]
    setThemePreference(next)
  }

  const Icon = icons[themePreference]

  return (
    <Tooltip content={labels[themePreference]} side="right">
      <button
        type="button"
        onClick={cycle}
        aria-label={`Switch theme (current: ${themePreference})`}
        className="rounded-[8px] p-2 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary"
      >
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </Tooltip>
  )
}
