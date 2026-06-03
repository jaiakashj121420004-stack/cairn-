import { desc, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { reviews } from '../../db/schema'
import type { CreateReviewInput, ReviewSummary } from '../../../shared/types/index'
import type { CairnDb } from '../../db/index'

function toSummary(r: typeof reviews.$inferSelect): ReviewSummary {
  return {
    id: r.id,
    accountId: r.accountId,
    periodType: r.periodType as 'weekly' | 'monthly',
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    topMistakes: r.topMistakes,
    bestTradeId: r.bestTradeId,
    worstTradeId: r.worstTradeId,
    lessonNextPeriod: r.lessonNextPeriod,
    ruleFocus: r.ruleFocus,
    adherenceScore: r.adherenceScore,
    notes: r.notes,
    createdAt: r.createdAt,
  }
}

export function listReviews(db: CairnDb, accountId?: string | null): ReviewSummary[] {
  const query = db.select().from(reviews).orderBy(desc(reviews.createdAt))
  const rows = accountId ? query.where(eq(reviews.accountId, accountId)).all() : query.all()
  return rows.map(toSummary)
}

export function createReview(db: CairnDb, input: CreateReviewInput): ReviewSummary {
  const now = Date.now()
  const id = uuidv7()
  db.insert(reviews)
    .values({
      id,
      accountId: input.accountId ?? null,
      periodType: input.periodType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      topMistakes: input.topMistakes,
      bestTradeId: input.bestTradeId ?? null,
      worstTradeId: input.worstTradeId ?? null,
      lessonNextPeriod: input.lessonNextPeriod,
      ruleFocus: input.ruleFocus ?? null,
      adherenceScore: input.adherenceScore,
      notes: input.notes ?? null,
      createdAt: now,
    })
    .run()

  const row = db.select().from(reviews).where(eq(reviews.id, id)).get()
  if (!row) throw new Error('Failed to read back inserted review')
  return toSummary(row)
}
