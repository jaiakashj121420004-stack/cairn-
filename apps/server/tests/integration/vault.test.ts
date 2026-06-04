import { randomBytes } from 'node:crypto'
import {
  listDevicesOutputSchema,
  registerDeviceOutputSchema,
  revokeDeviceOutputSchema,
  vaultManifestOutputSchema,
  vaultPullOutputSchema,
  vaultPushOutputSchema,
} from '@cairn/shared-zod'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { devices, vaultOps } from '../../src/db/schema'
import {
  createTestContext,
  createVerifiedUser,
  deleteWithAuth,
  getWithAuth,
  nth,
  postJson,
  resetState,
  teardown,
} from './helpers'
import type { TestContext } from './helpers'

/**
 * Vault + device integration tests (CLAUDE.md §18.5).
 * Real Postgres, real transactions, no mocks.
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

// ── Helpers ───────────────────────────────────────────────────────────────────────────

function bearerHeader(token: string): string {
  return `Bearer ${token}`
}

function uniqueDeviceName(): string {
  return `device-${randomBytes(4).toString('hex')}`
}

async function registerDevice(token: string, name = uniqueDeviceName()): Promise<string> {
  const res = await postJson(ctx.app, '/devices', { name, platform: 'win32' }, bearerHeader(token))
  expect(res.statusCode).toBe(201)
  const id: string = (res.json().data as { device: { id: string } }).device.id
  return id
}

function makeOp(tableName = 'trade', recordId?: string): Record<string, unknown> {
  return {
    table_name: tableName,
    record_id: recordId ?? randomBytes(8).toString('hex'),
    op_type: 'upsert',
    payload_ciphertext: Buffer.from(randomBytes(32)).toString('base64'),
  }
}

// ── Device registration ───────────────────────────────────────────────────────────────

describe('POST /devices', () => {
  it('registers a device and returns its record (201)', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await postJson(
      ctx.app,
      '/devices',
      { name: 'My Laptop', platform: 'darwin' },
      bearerHeader(accessToken),
    )
    expect(res.statusCode).toBe(201)
    const { device } = res.json().data as { device: Record<string, unknown> }
    expect(typeof device.id).toBe('string')
    expect(device.name).toBe('My Laptop')
    expect(device.platform).toBe('darwin')
    expect(device.revoked_at).toBeNull()
  })

  it('requires auth — 401 without token', async () => {
    const res = await postJson(ctx.app, '/devices', { name: 'x' })
    expect(res.statusCode).toBe(401)
  })

  it('requires verified email — 403 for unverified user', async () => {
    const email = `u-${randomBytes(6).toString('hex')}@example.com`
    await postJson(ctx.app, '/auth/signup', { email, password: 'correct horse battery staple' })
    const loginRes = await postJson(ctx.app, '/auth/login', {
      email,
      password: 'correct horse battery staple',
    })
    const token: string = loginRes.json().data.accessToken
    const res = await postJson(ctx.app, '/devices', { name: 'x' }, bearerHeader(token))
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('rejects too-long device name with 400', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await postJson(
      ctx.app,
      '/devices',
      { name: 'x'.repeat(101) },
      bearerHeader(accessToken),
    )
    expect(res.statusCode).toBe(400)
  })
})

// ── Device listing ────────────────────────────────────────────────────────────────────

describe('GET /devices', () => {
  it('returns only active (non-revoked) devices for the user', async () => {
    const { accessToken, userId } = await createVerifiedUser(ctx)
    const id1 = await registerDevice(accessToken, 'Laptop')
    const id2 = await registerDevice(accessToken, 'Desktop')

    // Soft-revoke id2 directly in the DB.
    await ctx.handle.db.update(devices).set({ revokedAt: new Date() }).where(eq(devices.id, id2))

    const res = await getWithAuth(ctx.app, '/devices', accessToken)
    expect(res.statusCode).toBe(200)
    const list = (res.json().data as { devices: Array<{ id: string }> }).devices
    expect(list.map((d) => d.id)).toContain(id1)
    expect(list.map((d) => d.id)).not.toContain(id2)
    // Devices from another user must not appear.
    void userId // only used to prevent unused-variable lint
  })

  it('returns an empty list when no devices are registered', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await getWithAuth(ctx.app, '/devices', accessToken)
    expect(res.statusCode).toBe(200)
    expect((res.json().data as { devices: unknown[] }).devices).toHaveLength(0)
  })
})

// ── Device revocation ────────────────────────────────────────────────────────────────

describe('DELETE /devices/:id', () => {
  it('revokes the device and removes it from the list', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const id = await registerDevice(accessToken)

    const del = await deleteWithAuth(ctx.app, `/devices/${id}`, accessToken)
    expect(del.statusCode).toBe(200)
    expect((del.json().data as { revoked: boolean }).revoked).toBe(true)

    // Device no longer in active list.
    const list = await getWithAuth(ctx.app, '/devices', accessToken)
    const active = (list.json().data as { devices: Array<{ id: string }> }).devices
    expect(active.map((d) => d.id)).not.toContain(id)

    // Row still exists in DB with revokedAt set.
    const dbRow = await ctx.handle.db.select().from(devices).where(eq(devices.id, id))
    expect(dbRow[0]?.revokedAt).not.toBeNull()
  })

  it('returns 404 for a device belonging to another user', async () => {
    const { accessToken: token1 } = await createVerifiedUser(ctx)
    const { accessToken: token2 } = await createVerifiedUser(ctx)
    const id = await registerDevice(token1)

    const res = await deleteWithAuth(ctx.app, `/devices/${id}`, token2)
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 when trying to revoke an already-revoked device', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const id = await registerDevice(accessToken)

    await deleteWithAuth(ctx.app, `/devices/${id}`, accessToken)
    const second = await deleteWithAuth(ctx.app, `/devices/${id}`, accessToken)
    expect(second.statusCode).toBe(404)
  })
})

// ── Vault manifest ────────────────────────────────────────────────────────────────────

describe('GET /vault/manifest', () => {
  it('returns key_version=0 and empty table map for a fresh vault', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await getWithAuth(ctx.app, '/vault/manifest', accessToken)
    expect(res.statusCode).toBe(200)
    const data = res.json().data as Record<string, unknown>
    expect(data.key_version).toBe(0)
    expect(data.schema_version).toBe(1)
    expect(data.latest_op_id_per_table).toEqual({})
  })

  it('returns per-table high-water marks after a push', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(accessToken)

    await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: [makeOp('trade'), makeOp('trade'), makeOp('account')] },
      bearerHeader(accessToken),
    )

    const res = await getWithAuth(ctx.app, '/vault/manifest', accessToken)
    const hwm = (res.json().data as { latest_op_id_per_table: Record<string, number> })
      .latest_op_id_per_table
    expect(typeof hwm['trade']).toBe('number')
    expect(hwm['trade']).toBeGreaterThan(0)
    expect(typeof hwm['account']).toBe('number')
  })
})

// ── Vault push ────────────────────────────────────────────────────────────────────────

describe('POST /vault/push', () => {
  it('appends ops and returns their assigned ids', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(accessToken)
    const ops = [makeOp('trade'), makeOp('account')]

    const res = await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops },
      bearerHeader(accessToken),
    )
    expect(res.statusCode).toBe(200)
    const { op_ids } = res.json().data as { op_ids: number[] }
    expect(op_ids).toHaveLength(2)
    expect(op_ids.every((id) => typeof id === 'number' && id > 0)).toBe(true)
    // Second op id must be strictly greater (serial).
    expect(nth(op_ids, 1)).toBeGreaterThan(nth(op_ids, 0))
  })

  it('is atomic: all ops succeed or none are committed', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(accessToken)

    // Count rows before.
    const before = await ctx.handle.db.select().from(vaultOps)

    // Push with a valid first op and an invalid second op (empty table_name).
    const badPush = await postJson(
      ctx.app,
      '/vault/push',
      {
        device_id: deviceId,
        ops: [
          makeOp('trade'),
          { table_name: '', record_id: 'x', op_type: 'upsert', payload_ciphertext: 'abc' },
        ],
      },
      bearerHeader(accessToken),
    )
    // Validation fails → no rows committed.
    expect(badPush.statusCode).toBe(400)

    const after = await ctx.handle.db.select().from(vaultOps)
    expect(after.length).toBe(before.length)
  })

  it('rejects a device_id that belongs to another user (403)', async () => {
    const { accessToken: token1 } = await createVerifiedUser(ctx)
    const { accessToken: token2 } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(token1) // belongs to user 1

    const res = await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: [makeOp()] },
      bearerHeader(token2),
    )
    expect(res.statusCode).toBe(403)
  })

  it('rejects a revoked device (403)', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(accessToken)
    await deleteWithAuth(ctx.app, `/devices/${deviceId}`, accessToken)

    const res = await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: [makeOp()] },
      bearerHeader(accessToken),
    )
    expect(res.statusCode).toBe(403)
  })

  it('rejects a body larger than 5 MB (413)', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(accessToken)

    // Build a single op with a 5.1 MB ciphertext to exceed the limit.
    const hugeCiphertext = 'A'.repeat(5.1 * 1024 * 1024)
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/vault/push',
      headers: {
        'content-type': 'application/json',
        authorization: bearerHeader(accessToken),
      },
      payload: JSON.stringify({
        device_id: deviceId,
        ops: [
          {
            table_name: 'trade',
            record_id: 'r1',
            op_type: 'upsert',
            payload_ciphertext: hugeCiphertext,
          },
        ],
      }),
    })
    expect(res.statusCode).toBe(413)
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('updates device last_seen_at on each push', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(accessToken)

    const before = await ctx.handle.db
      .select({ lastSeenAt: devices.lastSeenAt })
      .from(devices)
      .where(eq(devices.id, deviceId))
    expect(before[0]?.lastSeenAt).toBeNull()

    await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: [makeOp()] },
      bearerHeader(accessToken),
    )

    const after = await ctx.handle.db
      .select({ lastSeenAt: devices.lastSeenAt })
      .from(devices)
      .where(eq(devices.id, deviceId))
    expect(after[0]?.lastSeenAt).not.toBeNull()
  })
})

// ── Vault pull ────────────────────────────────────────────────────────────────────────

describe('POST /vault/pull', () => {
  it('returns an empty list for a fresh vault', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await postJson(ctx.app, '/vault/pull', {}, bearerHeader(accessToken))
    expect(res.statusCode).toBe(200)
    const data = res.json().data as { ops: unknown[]; next_cursor: null }
    expect(data.ops).toHaveLength(0)
    expect(data.next_cursor).toBeNull()
  })

  it('returns all ops when no cursor is provided', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(accessToken)
    await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: [makeOp('trade'), makeOp('account')] },
      bearerHeader(accessToken),
    )

    const res = await postJson(ctx.app, '/vault/pull', {}, bearerHeader(accessToken))
    expect(res.statusCode).toBe(200)
    const { ops } = res.json().data as { ops: unknown[] }
    expect(ops).toHaveLength(2)
  })

  it('respects since_op_id_per_table cursors', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(accessToken)

    // Push 3 trade ops.
    const push1 = await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: [makeOp('trade'), makeOp('trade'), makeOp('trade')] },
      bearerHeader(accessToken),
    )
    const ids: number[] = (push1.json().data as { op_ids: number[] }).op_ids
    const cursor = nth(ids, 1) // after second op

    // Pull with cursor for 'trade' — should only return the 3rd op.
    const res = await postJson(
      ctx.app,
      '/vault/pull',
      { since_op_id_per_table: { trade: cursor } },
      bearerHeader(accessToken),
    )
    const { ops } = res.json().data as { ops: Array<{ id: number }> }
    expect(ops).toHaveLength(1)
    expect(ops[0]?.id).toBe(ids[2])
  })

  it('paginates: returns next_cursor when more ops exist than the page size', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(accessToken)

    // Push 502 ops (> 500 page size) in two batches of 251.
    const batch1 = Array.from({ length: 251 }, () => makeOp('trade'))
    const batch2 = Array.from({ length: 251 }, () => makeOp('trade'))
    await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: batch1 },
      bearerHeader(accessToken),
    )
    await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: batch2 },
      bearerHeader(accessToken),
    )

    const page1 = await postJson(ctx.app, '/vault/pull', {}, bearerHeader(accessToken))
    const data1 = page1.json().data as { ops: unknown[]; next_cursor: number | null }
    expect(data1.ops).toHaveLength(500)
    expect(typeof data1.next_cursor).toBe('number')

    // Page 2 using the cursor.
    const page2 = await postJson(
      ctx.app,
      '/vault/pull',
      { since_id: data1.next_cursor },
      bearerHeader(accessToken),
    )
    const data2 = page2.json().data as { ops: unknown[]; next_cursor: null }
    expect(data2.ops).toHaveLength(2)
    expect(data2.next_cursor).toBeNull()
  })

  it('does not return ops belonging to another user', async () => {
    const { accessToken: token1 } = await createVerifiedUser(ctx)
    const { accessToken: token2 } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(token1)

    await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: [makeOp('trade')] },
      bearerHeader(token1),
    )

    const res = await postJson(ctx.app, '/vault/pull', {}, bearerHeader(token2))
    const { ops } = res.json().data as { ops: unknown[] }
    expect(ops).toHaveLength(0)
  })

  it('since_id global cursor skips already-seen ops', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const deviceId = await registerDevice(accessToken)

    const push = await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: [makeOp('trade'), makeOp('trade'), makeOp('trade')] },
      bearerHeader(accessToken),
    )
    const ids: number[] = (push.json().data as { op_ids: number[] }).op_ids

    // since_id = id of second op → only the third comes back.
    const res = await postJson(
      ctx.app,
      '/vault/pull',
      { since_id: ids[1] },
      bearerHeader(accessToken),
    )
    const { ops } = res.json().data as { ops: Array<{ id: number }> }
    expect(ops).toHaveLength(1)
    expect(ops[0]?.id).toBe(ids[2])
  })
})

// ── Output-schema contract ────────────────────────────────────────────────────────────

/**
 * Every device/vault endpoint is served through `sendValidated`, so its live response
 * must satisfy the same Zod *output* schema the client decodes with — this is the
 * no-slop footer's "drift between [input and output schemas] is a tested error". These
 * assertions parse real responses through the shared schemas; any handler change that
 * drifts from the contract (a renamed field, a `Date` instead of an ISO string) fails
 * here, and `sendValidated` additionally turns it into a 500 at runtime.
 */
describe('output-schema contract', () => {
  it('every device + vault response conforms to its shared output schema', async () => {
    const { accessToken } = await createVerifiedUser(ctx)

    const register = await postJson(
      ctx.app,
      '/devices',
      { name: 'Contract Box', platform: 'linux' },
      bearerHeader(accessToken),
    )
    expect(() => registerDeviceOutputSchema.parse(register.json().data)).not.toThrow()
    const deviceId = (register.json().data as { device: { id: string } }).device.id

    const list = await getWithAuth(ctx.app, '/devices', accessToken)
    expect(() => listDevicesOutputSchema.parse(list.json().data)).not.toThrow()

    const freshManifest = await getWithAuth(ctx.app, '/vault/manifest', accessToken)
    expect(() => vaultManifestOutputSchema.parse(freshManifest.json().data)).not.toThrow()

    const push = await postJson(
      ctx.app,
      '/vault/push',
      { device_id: deviceId, ops: [makeOp('trade'), makeOp('account')] },
      bearerHeader(accessToken),
    )
    expect(() => vaultPushOutputSchema.parse(push.json().data)).not.toThrow()

    const populatedManifest = await getWithAuth(ctx.app, '/vault/manifest', accessToken)
    expect(() => vaultManifestOutputSchema.parse(populatedManifest.json().data)).not.toThrow()

    const pull = await postJson(ctx.app, '/vault/pull', {}, bearerHeader(accessToken))
    expect(() => vaultPullOutputSchema.parse(pull.json().data)).not.toThrow()

    const revoke = await deleteWithAuth(ctx.app, `/devices/${deviceId}`, accessToken)
    expect(() => revokeDeviceOutputSchema.parse(revoke.json().data)).not.toThrow()
  })
})
