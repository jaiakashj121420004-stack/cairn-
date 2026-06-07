/**
 * MT5 live-broker adapter (Wave 4 — `docs/broker-integration.md` §2.1 / §4).
 *
 * Wraps the loopback {@link createMt5Listener} as a {@link LiveBrokerAdapter} so
 * the rest of Cairn is transport-agnostic. The adapter IS the transport: it only
 * produces {@link BrokerEvent}s and never touches the DB or the broker — there is
 * deliberately no place/modify/close path (CLAUDE.md §14 #37, read-only forever).
 *
 * `status()` reflects the *transport*: `disconnected` before connect, `connected`
 * while the listener is bound, `error` on a bind failure. EA-liveness ("connected
 * / last event Xs ago") is a richer signal carried by the ingest `BrokerStatus`,
 * fed from the heartbeat/event stream this adapter forwards.
 */

import { createMt5Listener } from './listener'
import type { Mt5Listener } from './listener'
import type {
  BrokerConnConfig,
  BrokerConnectionStatus,
  BrokerEvent,
  Disposable,
  LiveBrokerAdapter,
  Result,
} from '@cairn/shared-types'

export interface Mt5AdapterOptions {
  /** Structured, PII-free log line. Defaults to a no-op. */
  log?: (message: string) => void
}

/** Pull the loopback port + pairing token out of the generic connect config. */
function readConnOptions(config: BrokerConnConfig): Result<{ port: number; token: string }> {
  const opts = config.options ?? {}
  const port = opts['port']
  const token = opts['token']
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 0 || port > 65535) {
    return {
      ok: false,
      error: { code: 'BAD_CONFIG', message: 'mt5 connect requires a numeric port' },
    }
  }
  if (typeof token !== 'string' || token.length === 0) {
    return {
      ok: false,
      error: { code: 'BAD_CONFIG', message: 'mt5 connect requires a pairing token' },
    }
  }
  return { ok: true, data: { port, token } }
}

export function createMt5Adapter(options: Mt5AdapterOptions = {}): LiveBrokerAdapter {
  const log = options.log ?? ((): void => {})
  const handlers = new Set<(e: BrokerEvent) => void>()
  let listener: Mt5Listener | null = null
  let connection: BrokerConnectionStatus = 'disconnected'

  function fanout(event: BrokerEvent): void {
    for (const handler of handlers) {
      try {
        handler(event)
      } catch {
        log('event handler threw')
      }
    }
  }

  async function connect(config: BrokerConnConfig): Promise<Result<void>> {
    const parsed = readConnOptions(config)
    if (!parsed.ok) {
      connection = 'error'
      return parsed
    }
    if (listener) return { ok: true, data: undefined }

    const l = createMt5Listener({
      port: parsed.data.port,
      token: parsed.data.token,
      onEvent: fanout,
      log,
      onReject: (reason) => log(`rejected: ${reason}`),
    })
    const started = await l.start()
    if (!started.ok) {
      connection = 'error'
      return { ok: false, error: started.error }
    }
    listener = l
    connection = 'connected'
    return { ok: true, data: undefined }
  }

  function onEvent(handler: (e: BrokerEvent) => void): Disposable {
    handlers.add(handler)
    return {
      dispose: () => {
        handlers.delete(handler)
      },
    }
  }

  function status(): BrokerConnectionStatus {
    return connection
  }

  async function disconnect(): Promise<void> {
    if (listener) {
      await listener.stop()
      listener = null
    }
    connection = 'disconnected'
  }

  return {
    name: 'mt5',
    supportsLiveStream: true,
    connect,
    onEvent,
    status,
    disconnect,
  }
}
