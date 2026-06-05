// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  buildEnvelope,
  canonicalJson,
  parseEnvelope,
  serializeEnvelope,
} from '../../../electron/services/sync'

describe('canonicalJson', () => {
  it('sorts object keys at every depth so equal content yields equal bytes', () => {
    const a = canonicalJson({ b: 1, a: { d: 4, c: 3 } })
    const b = canonicalJson({ a: { c: 3, d: 4 }, b: 1 })
    expect(a).toBe(b)
    expect(a).toBe('{"a":{"c":3,"d":4},"b":1}')
  })

  it('preserves array order (arrays are positional, not sorted)', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]')
  })

  it('emits null and integer fields verbatim', () => {
    expect(canonicalJson({ x: null, n: -230, z: 0 })).toBe('{"n":-230,"x":null,"z":0}')
  })

  it('drops undefined object properties (matching JSON.stringify), keeping null', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}')
  })

  it('throws loudly on values JSON cannot represent losslessly', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow()
    expect(() => canonicalJson(10n)).toThrow()
    expect(() => canonicalJson(() => 0)).toThrow()
  })
})

describe('envelope build + parse', () => {
  it('round-trips an upsert envelope through canonical serialization', () => {
    const env = buildEnvelope({
      opType: 'upsert',
      clock: { devA: 2 },
      updatedAt: 42,
      data: { id: 't1', pnlCents: 5 },
    })
    const parsed = parseEnvelope(serializeEnvelope(env))
    expect(parsed).toEqual(env)
    expect(parsed.data).toEqual({ id: 't1', pnlCents: 5 })
  })

  it('omits data for a delete tombstone but keeps clock + updatedAt', () => {
    const env = buildEnvelope({
      opType: 'delete',
      clock: { devA: 3 },
      updatedAt: 99,
      data: undefined,
    })
    expect('data' in env).toBe(false)
    const parsed = parseEnvelope(serializeEnvelope(env))
    expect(parsed.clock).toEqual({ devA: 3 })
    expect(parsed.updatedAt).toBe(99)
    expect('data' in parsed).toBe(false)
  })

  it('rejects a malformed envelope (turned into a quarantine by the pull path)', () => {
    expect(() => parseEnvelope('not json')).toThrow()
    expect(() => parseEnvelope(JSON.stringify({ clock: {}, updatedAt: 1 }))).toThrow() // no schemaVersion
    expect(() => parseEnvelope(JSON.stringify({ schemaVersion: 1, updatedAt: 1 }))).toThrow() // no clock
    expect(() =>
      parseEnvelope(JSON.stringify({ schemaVersion: 1, clock: { d: -1 }, updatedAt: 1 })),
    ).toThrow() // negative clock component
  })
})
