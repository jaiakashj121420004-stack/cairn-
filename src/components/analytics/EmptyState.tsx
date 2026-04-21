import { BarChart3 } from 'lucide-react'

interface Props {
  title?: string
  description?: string
}

export function EmptyState({
  title = 'No trades in this range',
  description = 'Adjust the filter or log trades to see analytics.',
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-elevated py-12 text-center">
      <BarChart3 className="mb-3 text-text-muted" size={32} />
      <p className="mb-1 font-medium text-text-primary">{title}</p>
      <p className="max-w-sm text-caption text-text-muted">{description}</p>
    </div>
  )
}
