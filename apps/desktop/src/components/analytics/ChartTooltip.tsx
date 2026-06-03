interface Payload {
  name?: string
  value?: number | string
  color?: string
}

interface Props {
  active?: boolean
  payload?: Payload[]
  label?: string | number
  formatter?: (v: number | string, name?: string) => string
}

export function ChartTooltip({ active, payload, label, formatter }: Props) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-caption shadow-lg">
      {label !== undefined && (
        <p className="mb-1 font-medium text-text-secondary">{String(label)}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 font-mono text-text-primary">
          {p.color && (
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          )}
          <span className="text-text-muted">{p.name}:</span>
          <span>
            {formatter && p.value !== undefined ? formatter(p.value, p.name) : String(p.value)}
          </span>
        </p>
      ))}
    </div>
  )
}
