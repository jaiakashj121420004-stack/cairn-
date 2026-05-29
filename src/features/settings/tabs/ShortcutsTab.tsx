const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

const SHORTCUTS = [
  { keys: ['N'], description: 'Open new trade panel' },
  { keys: ['B'], description: 'Open session bias modal' },
  { keys: ['Escape'], description: 'Close any open modal or panel' },
  { keys: [mod, 'E'], description: 'Navigate to Trade Log' },
  { keys: [mod, ','], description: 'Navigate to Settings' },
]

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded-[6px] border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-caption text-text-secondary">
      {children}
    </kbd>
  )
}

export function ShortcutsTab() {
  return (
    <div className="max-w-sm space-y-6">
      <div>
        <h3 className="text-body font-semibold text-text-primary mb-1">Keyboard shortcuts</h3>
        <p className="text-caption text-text-muted">Global shortcuts active whenever no text input is focused.</p>
      </div>
      <div className="divide-y divide-border rounded-[10px] border border-border overflow-hidden">
        {SHORTCUTS.map((s) => (
          <div key={s.keys.join('+')} className="flex items-center justify-between px-4 py-3 bg-surface">
            <span className="text-body text-text-primary">{s.description}</span>
            <div className="flex items-center gap-1">
              {s.keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="text-caption text-text-muted">+</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
