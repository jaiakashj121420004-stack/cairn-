import { FastifyOtelInstrumentation } from '@fastify/otel'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { AlwaysOnSampler } from '@opentelemetry/sdk-trace-base'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import { TailSamplingSpanProcessor } from './sampling'
import type { Env } from '../env'

/**
 * OpenTelemetry traces + metrics (CLAUDE.md §18.9).
 *
 * Disabled (no-op) unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set — local dev and CI never
 * export telemetry. When enabled:
 *   - Traces export via OTLP/HTTP to `${endpoint}/v1/traces`, recorded with
 *     `AlwaysOnSampler` and filtered for export by {@link TailSamplingSpanProcessor}
 *     (errors + slow spans always exported; everything else at `OTEL_TRACES_SAMPLE_RATIO`).
 *   - Metrics export via OTLP/HTTP to `${endpoint}/v1/metrics` on
 *     `OTEL_METRIC_EXPORT_INTERVAL_MS` (see `telemetry/metrics.ts` for the instruments).
 *   - `HttpInstrumentation` traces incoming requests and outgoing calls (Stripe,
 *     Razorpay, Resend). Fastify route-level spans come from `@fastify/otel`,
 *     registered as a plugin in `app.ts` (Fastify's own lifecycle, not module patching).
 *   - Drizzle/Postgres query spans come from the logger-based instrumentation in
 *     `db/client.ts` (the `postgres` driver speaks the wire protocol directly over
 *     `node:net`, so there is no official OTel auto-instrumentation for it).
 */

const SERVICE_NAME = 'cairn-api'
const SERVICE_VERSION = process.env['npm_package_version'] ?? '0.0.0'

let sdk: NodeSDK | undefined

/** Parse `OTEL_EXPORTER_OTLP_HEADERS` (`key1=value1,key2=value2`) into a header map. */
export function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  const headers: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const [key, ...rest] = pair.split('=')
    if (!key || rest.length === 0) continue
    const value = rest.join('=').trim()
    if (value.length === 0) continue
    headers[key.trim()] = value
  }
  return headers
}

export function startOtel(env: Env): void {
  if (sdk) return
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return

  const headers = parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS)
  const base = env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/+$/, '')

  const traceExporter = new OTLPTraceExporter({ url: `${base}/v1/traces`, headers })
  const metricExporter = new OTLPMetricExporter({ url: `${base}/v1/metrics`, headers })

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    }),
    sampler: new AlwaysOnSampler(),
    spanProcessors: [
      new TailSamplingSpanProcessor(traceExporter, {
        ratio: env.OTEL_TRACES_SAMPLE_RATIO,
        slowThresholdMs: env.OTEL_SLOW_SPAN_MS,
      }),
    ],
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: env.OTEL_METRIC_EXPORT_INTERVAL_MS,
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new FastifyOtelInstrumentation({ registerOnInitialization: true }),
    ],
  })
  sdk.start()
}

/** True once `startOtel` has run with an endpoint configured. */
export function isOtelEnabled(): boolean {
  return sdk !== undefined
}

/** Test-only: drop the SDK reference so a test can re-init with different env. */
export function resetOtelForTests(): void {
  sdk = undefined
}

/** Flush + shut down exporters before process exit. No-op when disabled. */
export async function shutdownOtel(): Promise<void> {
  if (!sdk) return
  await sdk.shutdown()
  sdk = undefined
}
