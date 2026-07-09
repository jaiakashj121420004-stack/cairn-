import { describe, expect, it } from 'vitest'
import { scrubBreadcrumb, scrubEvent } from '../../src/telemetry/sentry'
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/node'

const HINT: EventHint = {}

describe('scrubEvent', () => {
  it('redacts request, user, contexts, extra, and breadcrumb data', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        headers: { authorization: 'Bearer abc', 'x-trace': 'keep-me' },
        cookies: { session: 'sek' },
        data: { email: 'trader@example.com', amount: 10 },
      },
      user: { id: 'u1', email: 'trader@example.com' },
      contexts: { device: { dataKey: 'rawkey', name: 'desktop' } },
      extra: { token: 'abc.def', note: 'fine' },
      breadcrumbs: [{ category: 'http', data: { password: 'p', url: '/x' } } satisfies Breadcrumb],
    }

    const scrubbed = scrubEvent(event, HINT)

    expect(scrubbed?.request?.headers).toEqual({
      authorization: '[redacted]',
      'x-trace': 'keep-me',
    })
    expect(scrubbed?.request?.cookies).toEqual({ session: '[redacted]' })
    expect(scrubbed?.request?.data).toEqual({ email: '[redacted]', amount: 10 })
    expect(scrubbed?.user).toEqual({ id: 'u1', email: '[redacted]' })
    expect(scrubbed?.contexts?.['device']).toEqual({ dataKey: '[redacted]', name: 'desktop' })
    expect(scrubbed?.extra).toEqual({ token: '[redacted]', note: 'fine' })
    expect(scrubbed?.breadcrumbs?.[0]?.data).toEqual({ password: '[redacted]', url: '/x' })
  })

  it('passes through events with no request/user/extra', () => {
    const event: ErrorEvent = { type: undefined, message: 'boom' }
    expect(scrubEvent(event, HINT)).toEqual({ message: 'boom' })
  })
})

describe('scrubBreadcrumb', () => {
  it('redacts breadcrumb data and leaves breadcrumbs without data alone', () => {
    const withData: Breadcrumb = { category: 'fetch', data: { secret: 'shh', ok: 'yes' } }
    expect(scrubBreadcrumb(withData)).toEqual({
      category: 'fetch',
      data: { secret: '[redacted]', ok: 'yes' },
    })

    const withoutData: Breadcrumb = { category: 'navigation' }
    expect(scrubBreadcrumb(withoutData)).toEqual(withoutData)
  })
})
