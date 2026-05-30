import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { ipc } from '../../../lib/ipc'
import { Button } from '../../../components/ui/button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { Select } from '../../../components/ui/select'
import { EmptyState } from '../../../components/analytics/EmptyState'
import { formatDate } from '../../../lib/formatters'
import type { ReviewSummary, ReviewPeriodType, CreateReviewInput } from '@shared/types/index'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function NewReviewForm({ onDone }: { onDone: () => void }) {
  const [periodType, setPeriodType] = useState<ReviewPeriodType>('weekly')
  const [periodStart, setPeriodStart] = useState(todayIso())
  const [periodEnd, setPeriodEnd] = useState(todayIso())
  const [topMistakes, setTopMistakes] = useState('')
  const [lessonNextPeriod, setLessonNextPeriod] = useState('')
  const [adherenceScore, setAdherenceScore] = useState(80)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const input: CreateReviewInput = {
      periodType,
      periodStart,
      periodEnd,
      topMistakes,
      lessonNextPeriod,
      adherenceScore,
    }
    const res = await ipc.analytics.createReview(input)
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Select
        label="Period type"
        options={[
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
        ]}
        value={periodType}
        onChange={(v) => setPeriodType(v as ReviewPeriodType)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Period start"
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          required
        />
        <Input
          label="Period end"
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          required
        />
      </div>
      <Textarea
        label="Top mistakes"
        value={topMistakes}
        onChange={(e) => setTopMistakes(e.target.value)}
        placeholder="What were the biggest mistakes this period?"
        required
      />
      <Textarea
        label="Lesson for next period"
        value={lessonNextPeriod}
        onChange={(e) => setLessonNextPeriod(e.target.value)}
        placeholder="What will you do differently?"
        required
      />
      <Input
        label="Adherence score (0–100)"
        type="number"
        min={0}
        max={100}
        value={adherenceScore}
        onChange={(e) => setAdherenceScore(Number(e.target.value))}
        numeric
        required
      />
      {error && <p className="text-caption text-danger">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save review'}
        </Button>
      </div>
    </form>
  )
}

export function ReviewTab() {
  const [reviews, setReviews] = useState<ReviewSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  async function refetch() {
    setLoading(true)
    const r = await ipc.analytics.listReviews()
    if (r.ok) setReviews(r.data)
    setLoading(false)
  }

  useEffect(() => {
    void refetch()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-body font-semibold text-text-primary">Past reviews</h3>
          <p className="text-caption text-text-muted">
            Reflect on the period, name the mistakes, commit to the lesson.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={14} className="mr-1" />
          New review
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-text-muted">Loading…</div>
      ) : reviews.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          description="Write your first review to lock in the lesson."
        />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-border bg-surface-elevated p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span className="text-caption uppercase tracking-wider text-text-muted">
                    {r.periodType}
                  </span>
                  <span className="ml-2 font-mono text-body-sm text-text-secondary">
                    {r.periodStart} → {r.periodEnd}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono text-body font-semibold text-text-primary">
                    {r.adherenceScore}%
                  </span>
                  <p className="text-caption text-text-muted">{formatDate(r.createdAt)}</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-caption uppercase tracking-wider text-text-muted">
                    Top mistakes
                  </p>
                  <p className="whitespace-pre-wrap text-body-sm text-text-secondary">
                    {r.topMistakes}
                  </p>
                </div>
                <div>
                  <p className="text-caption uppercase tracking-wider text-text-muted">
                    Lesson for next period
                  </p>
                  <p className="whitespace-pre-wrap text-body-sm text-text-secondary">
                    {r.lessonNextPeriod}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New review"
        maxWidth="560px"
      >
        <NewReviewForm
          onDone={() => {
            setModalOpen(false)
            void refetch()
          }}
        />
      </Modal>
    </div>
  )
}
