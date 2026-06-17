import { SpanStatusCode } from '@opentelemetry/api'
import { describe, expect, it } from 'vitest'
import { hrTimeToMillis, shouldExportSpan, traceIdToUnitInterval } from '../../src/telemetry/sampling'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'

function span(opts: {
  traceId: string
  statusCode?: SpanStatusCode
  durationMs?: number
}): Pick<ReadableSpan, 'status' | 'duration' | 'spanContext'> {
  const ms = opts.durationMs ?? 0
  return {
    status: { code: opts.statusCode ?? SpanStatusCode.OK },
    duration: [Math.floor(ms / 1000), (ms % 1000) * 1e6],
    spanContext: () => ({ traceId: opts.traceId, spanId: '0000000000000001', traceFlags: 1 }),
  }
}

describe('hrTimeToMillis', () => {
  it('converts seconds + nanoseconds to milliseconds', () => {
    expect(hrTimeToMillis([1, 500_000_000])).toBe(1500)
    expect(hrTimeToMillis([0, 0])).toBe(0)
  })
})

describe('traceIdToUnitInterval', () => {
  it('maps trace ids deterministically into [0, 1)', () => {
    expect(traceIdToUnitInterval('00000000000000000000000000000000')).toBe(0)
    expect(traceIdToUnitInterval('ffffffff00000000000000000000000000')).toBeCloseTo(1, 5)
    expect(traceIdToUnitInterval('aaaaaaaa00000000000000000000000000')).toBe(
      traceIdToUnitInterval('aaaaaaaaffffffffffffffffffffffffffff'),
    )
  })
})

describe('shouldExportSpan', () => {
  const opts = { ratio: 0.1, slowThresholdMs: 1000 }

  it('always exports error spans', () => {
    expect(
      shouldExportSpan(
        span({ traceId: 'ffffffff0000000000000000000000', statusCode: SpanStatusCode.ERROR }),
        opts,
      ),
    ).toBe(true)
  })

  it('always exports slow spans regardless of trace id', () => {
    expect(
      shouldExportSpan(span({ traceId: 'ffffffff0000000000000000000000', durationMs: 1500 }), opts),
    ).toBe(true)
  })

  it('exports a healthy fast span only when its trace id falls within the ratio', () => {
    // 0x00000000... -> unit interval 0, within a 0.1 ratio.
    expect(
      shouldExportSpan(span({ traceId: '00000000000000000000000000000000', durationMs: 5 }), opts),
    ).toBe(true)
    // 0xffffffff... -> unit interval ~1, outside a 0.1 ratio.
    expect(
      shouldExportSpan(span({ traceId: 'ffffffff0000000000000000000000', durationMs: 5 }), opts),
    ).toBe(false)
  })
})
