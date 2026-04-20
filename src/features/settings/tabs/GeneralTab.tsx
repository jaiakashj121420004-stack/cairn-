import { useEffect, useState } from 'react'
import { ipc } from '../../../lib/ipc'
import { Select } from '../../../components/ui'
import { useToast } from '../../../components/ui'

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
  const toast = useToast()

  useEffect(() => {
    void (async () => {
      const [t, w, tz] = await Promise.all([
        ipc.settings.get<Theme>('theme'),
        ipc.settings.get<WeekStart>('week_starts_on'),
        ipc.settings.get<string>('timezone'),
      ])
      if (t.ok && t.data) setTheme(t.data)
      if (w.ok && w.data) setWeekStartsOn(w.data)
      if (tz.ok && tz.data !== null) setTimezone(tz.data)
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
        <label className="text-caption font-medium text-text-secondary">
          Timezone override
        </label>
        <input
          type="text"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          onBlur={() => void save('timezone', timezone)}
          placeholder="e.g. America/New_York (blank = system)"
          className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
        />
        <p className="text-caption text-text-muted">
          Used for killzone detection. Leave blank to use system timezone.
        </p>
      </div>
    </div>
  )
}
