import { useEffect, useState } from 'react'
import { Select } from '../../../components/ui'
import { useToast } from '../../../components/ui'
import { cn } from '../../../lib/cn'
import { ipc } from '../../../lib/ipc'

type Theme = 'system' | 'light' | 'dark'
type WeekStart = 'monday' | 'sunday'

const THEME_OPTIONS = [
  { value: 'system', label: 'System default' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const WEEK_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
]

export function GeneralTab() {
  const [theme, setTheme] = useState<Theme>('system')
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStart>('monday')
  const [timezone, setTimezone] = useState('')
  const [fastPath, setFastPath] = useState(true)
  const toast = useToast()

  useEffect(() => {
    void (async () => {
      const [t, w, tz, fp] = await Promise.all([
        ipc.settings.get<Theme>('theme'),
        ipc.settings.get<WeekStart>('week_starts_on'),
        ipc.settings.get<string>('timezone'),
        ipc.settings.get<boolean>('pre_trade.fast_path_enabled'),
      ])
      if (t.ok && t.data) setTheme(t.data)
      if (w.ok && w.data) setWeekStartsOn(w.data)
      setTimezone(tz.ok && tz.data ? tz.data : 'America/New_York')
      setFastPath(!(fp.ok && fp.data === false)) // default on
    })()
  }, [])

  async function save(key: string, value: unknown) {
    const res = await ipc.settings.set(key, value)
    if (res.ok) {
      toast('Saved', 'success')
    } else {
      toast('Save failed', 'error')
    }
  }

  return (
    <div className="max-w-sm space-y-6">
      <Select
        label="Theme"
        options={THEME_OPTIONS}
        value={theme}
        onChange={(v) => {
          setTheme(v as Theme)
          void save('theme', v)
        }}
      />
      <Select
        label="Week starts on"
        options={WEEK_OPTIONS}
        value={weekStartsOn}
        onChange={(v) => {
          setWeekStartsOn(v as WeekStart)
          void save('week_starts_on', v)
        }}
      />
      <div className="flex flex-col gap-1.5">
        <label className="text-caption font-medium text-text-secondary">Timezone</label>
        <input
          list="tz-datalist"
          type="text"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          onBlur={() => void save('timezone', timezone || 'America/New_York')}
          placeholder="America/New_York"
          className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
        />
        <datalist id="tz-datalist">
          {(Intl as unknown as { supportedValuesOf: (k: string) => string[] })
            .supportedValuesOf('timeZone')
            .map((tz) => (
              <option key={tz} value={tz} />
            ))}
        </datalist>
        <p className="text-caption text-text-muted">Used for killzone detection.</p>
      </div>

      {/* Two-phase logging (fast path) */}
      <div className="flex flex-col gap-2 border-t border-border pt-6">
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="fast-path-toggle"
            className="text-caption font-medium text-text-secondary"
          >
            Fast path (two-phase logging)
          </label>
          <button
            id="fast-path-toggle"
            type="button"
            role="switch"
            aria-checked={fastPath}
            onClick={() => {
              const next = !fastPath
              setFastPath(next)
              void save('pre_trade.fast_path_enabled', next)
            }}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
              fastPath ? 'bg-accent-a' : 'bg-surface-elevated border border-border',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                fastPath ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>
        <p className="text-caption text-text-muted leading-relaxed">
          {fastPath ? (
            <>
              <span className="text-text-secondary">On.</span> The New Trade panel asks only for
              what the rule engine needs in the moment — pair, direction, prices, one invalidation,
              one emotion tap — and defers the journal (honesty review, rules broken, MAE/MFE,
              notes) to a calm batch on the Review screen after the session.
            </>
          ) : (
            <>
              <span className="text-text-secondary">Off.</span> Every trade is logged in one pass:
              the full reflection form appears at entry and at close, with nothing deferred.
            </>
          )}
        </p>
        <p className="text-caption text-text-muted leading-relaxed">
          The rule checks, hard locks, and loss limits are identical either way. Fast path changes
          <span className="text-text-secondary"> when</span> you reflect — never
          <span className="text-text-secondary"> whether</span> the rules apply.
        </p>
      </div>
    </div>
  )
}
