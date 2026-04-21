import { AlertCircle } from 'lucide-react'

interface Props {
  n: number
  threshold?: number
}

export function InsufficientData({ n, threshold = 10 }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-caption text-warning">
      <AlertCircle size={14} />
      <span>
        Need ≥{threshold} trades to interpret — you have {n}.
      </span>
    </div>
  )
}
