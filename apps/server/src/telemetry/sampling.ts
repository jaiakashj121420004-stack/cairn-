import { SpanStatusCode } from '@opentelemetry/api'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import type { Context, HrTime } from '@opentelemetry/api'
import type { ReadableSpan, Span, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base'

/**
 * Tail-aware trace sampling (CLAUDE.md §18.9 — "head-based 10% for healthy traffic,
 * 100% for 5xx and slow requests").
 *
 * True tail-based sampling normally requires a collector (the export decision can only
 * be made once a span's full outcome — status, duration — is known). Rather than stand
 * up an OTel Collector, the SDK is configured with `AlwaysOnSampler` (every span is
 * recorded) and this processor decides, in `onEnd` — once status and duration are known
 * — whether to forward the span to the real exporter:
 *
 *   - error spans (status.code === ERROR): always exported
 *   - spans at or above `slowThresholdMs`: always exported
 *   - everything else: exported for a deterministic `ratio` of trace ids
 *
 * The ratio decision is deterministic per trace id (not per span) so that all spans in
 * a sampled-in trace are exported together.
 */

export interface TailSamplingOptions {
  /** Fraction (0–1) of healthy, fast traces to export. */
  readonly ratio: number
  /** Spans at or above this duration (ms) are always exported. */
  readonly slowThresholdMs: number
}

const HEX_32_BIT_MAX = 0xffff_ffff

/** Maps the first 8 hex chars of a trace id to a deterministic value in [0, 1). */
export function traceIdToUnitInterval(traceId: string): number {
  const prefix = traceId.slice(0, 8)
  return Number.parseInt(prefix, 16) / (HEX_32_BIT_MAX + 1)
}

/** Convert an OTel `HrTime` duration tuple to milliseconds. */
export function hrTimeToMillis(duration: HrTime): number {
  const [seconds, nanos] = duration
  return seconds * 1000 + nanos / 1e6
}

/** Pure decision function — exported for unit testing without standing up the SDK. */
export function shouldExportSpan(
  span: Pick<ReadableSpan, 'status' | 'duration' | 'spanContext'>,
  opts: TailSamplingOptions,
): boolean {
  if (span.status.code === SpanStatusCode.ERROR) return true
  if (hrTimeToMillis(span.duration) >= opts.slowThresholdMs) return true
  return traceIdToUnitInterval(span.spanContext().traceId) < opts.ratio
}

export class TailSamplingSpanProcessor implements SpanProcessor {
  private readonly inner: SpanProcessor
  private readonly opts: TailSamplingOptions

  constructor(exporter: SpanExporter, opts: TailSamplingOptions) {
    this.inner = new BatchSpanProcessor(exporter)
    this.opts = opts
  }

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext)
  }

  onEnd(span: ReadableSpan): void {
    if (shouldExportSpan(span, this.opts)) this.inner.onEnd(span)
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush()
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown()
  }
}
