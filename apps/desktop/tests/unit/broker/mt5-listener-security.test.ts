// @vitest-environment node
//
// Unit test: MT5 listener security posture (Wave 4 — docs/broker-integration.md §8).
//
// The listener must be loopback-only. These tests prove the connection guard
// refuses a non-loopback peer (destroys the socket, forwards no events) and that
// the address classifier accepts only 127.0.0.0/8 + IPv6 loopback.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import {
  handleMt5Connection,
  isLoopbackAddress,
} from '../../../electron/services/broker/mt5/listener'
import { encodeFrame } from '../../../electron/services/broker/mt5/frame'
import type { Mt5RejectReason } from '../../../electron/services/broker/mt5/listener'
import type { BrokerEvent } from '@cairn/shared-types'
import type { Socket } from 'net'

const TOKEN = 'unit-token'

/** A minimal net.Socket stand-in: an EventEmitter plus remoteAddress/destroy/write. */
function fakeSocket(remoteAddress: string | undefined): {
  socket: Socket
  destroyed: () => boolean
  emitData: (buf: Buffer) => void
} {
  const ee = new EventEmitter() as EventEmitter & {
    remoteAddress?: string
    destroy: () => void
    write: (b: Buffer) => boolean
  }
  let isDestroyed = false
  ee.remoteAddress = remoteAddress
  ee.destroy = () => {
    isDestroyed = true
  }
  ee.write = () => true
  return {
    socket: ee as unknown as Socket,
    destroyed: () => isDestroyed,
    emitData: (buf: Buffer) => ee.emit('data', buf),
  }
}

function deps(onEvent: (e: BrokerEvent) => void, onReject: (r: Mt5RejectReason) => void) {
  return {
    token: TOKEN,
    maxFrameBytes: 64 * 1024,
    onEvent,
    onGateSignal: () => {},
    onReject,
    log: () => {},
  }
}

describe('isLoopbackAddress', () => {
  it('accepts IPv4 loopback range and IPv6 loopback', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('127.5.6.7')).toBe(true)
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
  })

  it('rejects LAN, public, wildcard, and unknown addresses', () => {
    expect(isLoopbackAddress('192.168.1.10')).toBe(false)
    expect(isLoopbackAddress('10.0.0.4')).toBe(false)
    expect(isLoopbackAddress('203.0.113.7')).toBe(false)
    expect(isLoopbackAddress('0.0.0.0')).toBe(false)
    expect(isLoopbackAddress('::ffff:192.168.0.1')).toBe(false)
    expect(isLoopbackAddress(undefined)).toBe(false)
    expect(isLoopbackAddress('')).toBe(false)
  })
})

describe('handleMt5Connection — loopback enforcement', () => {
  it('refuses a connection from a non-loopback address and forwards no events', () => {
    const onEvent = vi.fn()
    const rejects: Mt5RejectReason[] = []
    const { socket, destroyed, emitData } = fakeSocket('203.0.113.7')

    handleMt5Connection(
      socket,
      deps(onEvent, (r) => rejects.push(r)),
    )

    // Even a perfectly valid, correctly-tokened frame must not be processed.
    const event: BrokerEvent = {
      type: 'position_opened',
      broker: 'mt5',
      brokerAccountId: 'A1',
      brokerTradeId: 'T1',
      symbol: 'EURUSD',
      direction: 'long',
      volumeLots: 0.1,
      price: 1.085,
      stopLoss: 1.084,
      takeProfit: 1.087,
      eventTimeMs: 1,
      raw: null,
    }
    emitData(encodeFrame({ token: TOKEN, event }))

    expect(destroyed()).toBe(true)
    expect(rejects).toContain('non_loopback')
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('accepts a loopback peer and forwards a valid event', () => {
    const received: BrokerEvent[] = []
    const { socket, destroyed, emitData } = fakeSocket('127.0.0.1')

    handleMt5Connection(
      socket,
      deps(
        (e) => received.push(e),
        () => {},
      ),
    )

    const event: BrokerEvent = {
      type: 'position_opened',
      broker: 'mt5',
      brokerAccountId: 'A1',
      brokerTradeId: 'T1',
      symbol: 'EURUSD',
      direction: 'long',
      volumeLots: 0.1,
      price: 1.085,
      stopLoss: 1.084,
      takeProfit: 1.087,
      eventTimeMs: 1,
      raw: null,
    }
    emitData(encodeFrame({ token: TOKEN, event }))

    expect(destroyed()).toBe(false)
    expect(received).toEqual([event])
  })
})
