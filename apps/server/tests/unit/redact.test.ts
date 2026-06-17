import { describe, expect, it } from 'vitest'
import { redactDeep } from '../../src/lib/redact'

describe('redactDeep', () => {
  it('redacts sensitive keys at any nesting depth, case-insensitively', () => {
    const input = {
      email: 'trader@example.com',
      Password: 'hunter2',
      nested: { accessToken: 'abc.def.ghi', ok: 'fine' },
      list: [{ refreshToken: 'rt-1', email: 'b@example.com' }],
    }
    expect(redactDeep(input)).toEqual({
      email: '[redacted]',
      Password: '[redacted]',
      nested: { accessToken: '[redacted]', ok: 'fine' },
      list: [{ refreshToken: '[redacted]', email: '[redacted]' }],
    })
  })

  it('passes through primitives, Dates, and Errors unchanged', () => {
    expect(redactDeep('hello')).toBe('hello')
    expect(redactDeep(42)).toBe(42)
    expect(redactDeep(null)).toBe(null)
    const date = new Date(0)
    expect(redactDeep(date)).toBe(date)
    const err = new Error('boom')
    expect(redactDeep(err)).toBe(err)
  })

  it('handles circular references without throwing', () => {
    const obj: Record<string, unknown> = { email: 'a@b.com' }
    obj['self'] = obj
    const result = redactDeep(obj) as Record<string, unknown>
    expect(result['email']).toBe('[redacted]')
    expect(result['self']).toBe('[circular]')
  })
})
