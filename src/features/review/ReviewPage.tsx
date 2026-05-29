import { Download } from 'lucide-react'
import { Button } from '../../components/ui'
import { useToast } from '../../components/ui'
import { ipc } from '../../lib/ipc'

export function ReviewPage() {
  const toast = useToast()

  async function handleExportPdf() {
    const res = await ipc.data.exportPdf('cairn-review.pdf')
    if (res.ok && res.data) toast('PDF saved.', 'success')
    else if (res.ok) { /* cancelled */ }
    else toast('PDF export failed.', 'error')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-5 flex items-center justify-between">
        <h1 className="text-h2 font-semibold text-text-primary">Review</h1>
        <Button size="sm" variant="secondary" onClick={() => void handleExportPdf()}>
          <Download className="h-4 w-4" strokeWidth={1.5} />
          Export PDF
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <span className="font-mono text-[80px] font-bold leading-none text-text-primary/5">05</span>
        <p className="max-w-sm text-center text-body text-text-muted">
          Weekly and session reviews — structured reflection that changes behavior — coming soon.
        </p>
      </div>
    </div>
  )
}
