import { describe, expect, it } from 'vitest'
import { parseOtlpHeaders } from '../../src/telemetry/otel'

describe('parseOtlpHeaders', () => {
  it('returns an empty object when unset', () => {
    expect(parseOtlpHeaders(undefined)).toEqual({})
  })

  it('parses comma-separated key=value pairs', () => {
    expect(parseOtlpHeaders('x-honeycomb-team=abc123,x-other=def456')).toEqual({
      'x-honeycomb-team': 'abc123',
      'x-other': 'def456',
    })
  })

  it('preserves "=" characters within a value', () => {
    expect(parseOtlpHeaders('authorization=Basic abc=def=')).toEqual({
      authorization: 'Basic abc=def=',
    })
  })

  it('skips entries with no key or empty value', () => {
    expect(parseOtlpHeaders('valid=1,=novalue,nokey=,bare')).toEqual({ valid: '1' })
  })
})
