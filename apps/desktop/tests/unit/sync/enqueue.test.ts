// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'

import {
  enqueueSyncOp,
  isSyncWriteEnabled,
  parseEnvelope,
  setSyncWriteContext,
  VectorClockCache,
} from '../../../electron/services/sync'
import type { CairnDb } from '../../../electron/db/index'

interface CapturedRow {
  tableName: string
  recordId: string
  opType: string
  payload: string
  createdAt: number
}

/** A minimal CairnDb stand-in capturing `insert(table).values(row).run()`. */
function fakeDb(sink: CapturedRow[]): CairnDb {
  return {
    insert: () => ({
      values: (row: CapturedRow) => ({
        run: () => {
          sink.push(row)
        },
      }),
    }),
  } as unknown as CairnDb
}

const DEVICE = '11111111-1111-1111-1111-111111111111'

afterEach(() => setSyncWriteContext(null))

describe('enqueueSyncOp', () => {
  it('is a no-op when no write context is registered (offline-first / sync off)', () => {
    const sink: CapturedRow[] = []
    setSyncWriteContext(null)
    expect(isSyncWriteEnabled()).toBe(false)
    enqueueSyncOp('trades', 't1', 'upsert', { id: 't1' })
    expect(sink).toHaveLength(0)
  })

  it('bumps the record clock and enqueues a canonical upsert envelope', () => {
    const sink: CapturedRow[] = []
    const clock = new VectorClockCache(DEVICE)
    clock.hydrate(() => [])
    setSyncWriteContext({ db: fakeDb(sink), clock, now: () => 1000 })

    enqueueSyncOp('trades', 't1', 'upsert', { id: 't1', pnlCents: 5 })

    expect(sink).toHaveLength(1)
    const row = sink[0]
    expect(row?.tableName).toBe('trades')
    expect(row?.recordId).toBe('t1')
    expect(row?.opType).toBe('upsert')
    expect(row?.createdAt).toBe(1000)

    const env = parseEnvelope(row?.payload ?? '')
    expect(env.clock).toEqual({ [DEVICE]: 1 }) // first write bumps to 1
    expect(env.updatedAt).toBe(1000)
    expect(env.data).toEqual({ id: 't1', pnlCents: 5 })

    // A second write to the same record advances this device's component.
    enqueueSyncOp('trades', 't1', 'upsert', { id: 't1', pnlCents: 9 })
    const env2 = parseEnvelope(sink[1]?.payload ?? '')
    expect(env2.clock).toEqual({ [DEVICE]: 2 })
  })

  it('never throws on an enqueue failure — logs via onError and swallows', () => {
    const clock = new VectorClockCache(DEVICE)
    clock.hydrate(() => [])
    const explodingDb = {
      insert: () => ({
        values: () => ({
          run: () => {
            throw new Error('disk full')
          },
        }),
      }),
    } as unknown as CairnDb
    let captured: unknown = null
    setSyncWriteContext({ db: explodingDb, clock, now: () => 1000, onError: (e) => (captured = e) })

    expect(() => enqueueSyncOp('trades', 't1', 'upsert', { id: 't1' })).not.toThrow()
    expect(captured).toBeInstanceOf(Error)
  })

  it('a delete enqueues a tombstone: clock + updatedAt but no data', () => {
    const sink: CapturedRow[] = []
    const clock = new VectorClockCache(DEVICE)
    clock.hydrate(() => [])
    setSyncWriteContext({ db: fakeDb(sink), clock, now: () => 2000 })

    enqueueSyncOp('trades', 't9', 'delete', null)

    const env = parseEnvelope(sink[0]?.payload ?? '')
    expect(sink[0]?.opType).toBe('delete')
    expect(env.clock).toEqual({ [DEVICE]: 1 })
    expect('data' in env).toBe(false)
  })
})
