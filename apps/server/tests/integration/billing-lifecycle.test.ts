import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sweepExpiredGrace } from '../../src/billing/apply'
import { auditLog, subscriptions } from '../../src/db/schema'
import {
  createTestContext,
  createVerifiedUser,
  makeStripeSignature,
  postJson,
  postRaw,
  resetState,
  stripeWebhookSecret,
  teardown,
} from './helpers'
import type { TestContext } from './helpers'

/**
 * §20.5 lifecycle integration tests: invoice.* transitions, refund revocation, the
 * 14-day hard-grace sweep, illegal-transition handling, and the /vault 402 cloud-sync
 * gate. Runs against the real Postgres; signatures are real HMACs (no Stripe network).
 */

let ctx: TestContext

beforeAll(async () => {
  ctx = await createTestContext()
})
afterAll(async () => {
  await teardown(ctx)
})
beforeEach(async () => {
  await resetState(ctx)
})

function uniqueEventId(): string {
  return `evt_${randomBytes(8).toString('hex')}`
}

/** Build a signed Stripe event envelope whose data.object is `obj`. */
function makeStripeEvent(type: string, obj: Record<string, unknown>): Record<string, unknown> {
  return {
    id: uniqueEventId(),
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: obj },
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  }
}

async function sendStripe(payload: Record<string, unknown>): Promise<{ statusCode: number }> {
  const body = JSON.stringify(payload)
  return postRaw(ctx.app, '/webhooks/stripe', body, {
    'stripe-signature': makeStripeSignature(body, stripeWebhookSecret(ctx)),
  })
}

function unixIn(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 86_400
}

async function readSub(userId: string) {
  const rows = await ctx.handle.db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
  return rows[0]
}

const SUB_ID = 'sub_lifecycle'

async function seedRow(
  userId: string,
  fields: Partial<typeof subscriptions.$inferInsert>,
): Promise<void> {
  await ctx.handle.db.insert(subscriptions).values({
    userId,
    provider: 'stripe',
    providerSubscriptionId: SUB_ID,
    providerCustomerId: 'cus_lifecycle',
    ...fields,
  })
}

function invoiceObj(userId: string): Record<string, unknown> {
  return {
    object: 'invoice',
    subscription: SUB_ID,
    subscription_details: { metadata: { cairn_user_id: userId } },
    lines: { data: [{ period: { end: unixIn(30) } }] },
    period_end: unixIn(30),
  }
}

describe('billing lifecycle — §20.5 transitions', () => {
  it('trial → active on invoice.paid', async () => {
    const { userId } = await createVerifiedUser(ctx)
    await seedRow(userId, {
      entitlement: 'trial',
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
    })

    const res = await sendStripe(makeStripeEvent('invoice.paid', invoiceObj(userId)))
    expect(res.statusCode).toBe(200)

    const sub = await readSub(userId)
    expect(sub?.status).toBe('active')
    expect(sub?.entitlement).toBe('pro')
    expect(sub?.currentPeriodEnd).not.toBeNull()
  })

  it('active → past_due on invoice.payment_failed, with a 14-day grace window', async () => {
    const { userId } = await createVerifiedUser(ctx)
    await seedRow(userId, { entitlement: 'pro', status: 'active' })

    const res = await sendStripe(makeStripeEvent('invoice.payment_failed', invoiceObj(userId)))
    expect(res.statusCode).toBe(200)

    const sub = await readSub(userId)
    expect(sub?.status).toBe('past_due')
    expect(sub?.entitlement).toBe('pro') // still entitled during grace
    expect(sub?.graceUntil).not.toBeNull()
    const graceDays = (Number(sub?.graceUntil?.getTime()) - Date.now()) / 86_400_000
    expect(graceDays).toBeGreaterThan(13)
    expect(graceDays).toBeLessThan(15)
  })

  it('past_due → active on invoice.paid (recovery)', async () => {
    const { userId } = await createVerifiedUser(ctx)
    await seedRow(userId, {
      entitlement: 'pro',
      status: 'past_due',
      graceUntil: new Date(Date.now() + 5 * 86_400_000),
    })

    await sendStripe(makeStripeEvent('invoice.paid', invoiceObj(userId)))

    const sub = await readSub(userId)
    expect(sub?.status).toBe('active')
    expect(sub?.entitlement).toBe('pro')
    expect(sub?.graceUntil).toBeNull()
  })

  it('past_due → canceled after the 14-day hard grace (clock advanced via sweep)', async () => {
    const { userId } = await createVerifiedUser(ctx)
    // Grace already elapsed (graceUntil in the past).
    await seedRow(userId, {
      entitlement: 'pro',
      status: 'past_due',
      graceUntil: new Date(Date.now() - 60_000),
    })

    const swept = await sweepExpiredGrace(ctx.handle.db, Date.now())
    expect(swept).toContain(userId)

    const sub = await readSub(userId)
    expect(sub?.status).toBe('canceled')
    expect(sub?.entitlement).toBe('free')

    const audits = await ctx.handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.event, 'billing.state_change'))
    expect(audits.length).toBeGreaterThan(0)
  })

  it('refund revokes the entitlement immediately', async () => {
    const { userId } = await createVerifiedUser(ctx)
    await seedRow(userId, { entitlement: 'pro', status: 'active' })

    const res = await sendStripe(
      makeStripeEvent('charge.refunded', {
        object: 'charge',
        customer: 'cus_lifecycle',
        metadata: { cairn_user_id: userId },
      }),
    )
    expect(res.statusCode).toBe(200)

    const sub = await readSub(userId)
    expect(sub?.status).toBe('canceled')
    expect(sub?.entitlement).toBe('free')
  })

  it('an illegal transition is audited and swallowed (still acks 200, no state change)', async () => {
    const { userId } = await createVerifiedUser(ctx)
    await seedRow(userId, { entitlement: 'free', status: 'canceled' })

    // payment_failed on a canceled subscription is forbidden by the §20.5 graph.
    const res = await sendStripe(makeStripeEvent('invoice.payment_failed', invoiceObj(userId)))
    expect(res.statusCode).toBe(200)

    const sub = await readSub(userId)
    expect(sub?.status).toBe('canceled')
    expect(sub?.entitlement).toBe('free')

    const audits = await ctx.handle.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.event, 'billing.illegal_transition'), eq(auditLog.severity, 'warning')),
      )
    expect(audits.length).toBeGreaterThan(0)
  })
})

describe('cloud-sync 402 gate (CLAUDE.md §20, §2.14)', () => {
  function pushBody(): unknown {
    return {
      device_id: randomUUID(),
      ops: [
        {
          table_name: 'trade',
          record_id: 'r1',
          op_type: 'upsert',
          payload_ciphertext: 'AAAA',
        },
      ],
    }
  }

  it('free user pushing to the vault gets 402 UPGRADE_REQUIRED', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await postJson(ctx.app, '/vault/push', pushBody(), `Bearer ${accessToken}`)
    expect(res.statusCode).toBe(402)
    expect(res.json().error.code).toBe('UPGRADE_REQUIRED')
    expect(res.json().error.details.upgrade_url).toContain('/pricing')
  })

  it('pro user passes the gate (reaches the device check, not a 402)', async () => {
    const { accessToken, userId } = await createVerifiedUser(ctx)
    await seedRow(userId, { entitlement: 'pro', status: 'active' })

    const res = await postJson(ctx.app, '/vault/push', pushBody(), `Bearer ${accessToken}`)
    // The entitlement gate passed; the unregistered device is rejected with 403.
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('free user pulling from the vault gets 402 UPGRADE_REQUIRED', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await postJson(ctx.app, '/vault/pull', {}, `Bearer ${accessToken}`)
    expect(res.statusCode).toBe(402)
    expect(res.json().error.code).toBe('UPGRADE_REQUIRED')
  })
})
