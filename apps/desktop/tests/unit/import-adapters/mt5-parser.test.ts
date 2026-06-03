// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseMt5Html } from '../../../electron/services/import-adapters/mt5/parser'

const FIXTURE = readFileSync(join(__dirname, '../../fixtures/mt5-statement.html'), 'utf-8')

describe('parseMt5Html — fixture parsing', () => {
  it('parses 8 valid deals (balance row silently skipped)', () => {
    const { deals } = parseMt5Html(FIXTURE)
    expect(deals).toHaveLength(8)
  })

  it('parses 4 orders', () => {
    const { orders } = parseMt5Html(FIXTURE)
    expect(orders).toHaveLength(4)
  })

  it('reports zero parse errors on the well-formed fixture', () => {
    const { errors } = parseMt5Html(FIXTURE)
    expect(errors).toHaveLength(0)
  })

  it('correctly maps EURUSD entry deal fields', () => {
    const { deals } = parseMt5Html(FIXTURE)
    const entry = deals.find((d) => d.dealId === '10000001')
    expect(entry).toBeDefined()
    expect(entry?.orderId).toBe('11111111')
    expect(entry?.symbol).toBe('EURUSD')
    expect(entry?.dealType).toBe('buy')
    expect(entry?.dealDirection).toBe('in')
    expect(entry?.volumeLots).toBe('0.10')
    expect(entry?.price).toBe('1.08523')
    expect(entry?.commission).toBe('-0.80')
    expect(entry?.profit).toBe('0.00')
  })

  it('correctly maps EURUSD exit deal fields', () => {
    const { deals } = parseMt5Html(FIXTURE)
    const exit = deals.find((d) => d.dealId === '10000002')
    expect(exit?.dealDirection).toBe('out')
    expect(exit?.price).toBe('1.08700')
    expect(exit?.profit).toBe('17.70')
    expect(exit?.comment).toBe('tp')
  })

  it('parses the EURUSD entry time as correct UTC ms', () => {
    const { deals } = parseMt5Html(FIXTURE)
    const entry = deals.find((d) => d.dealId === '10000001')
    // 2024-01-15 09:35:00 UTC
    expect(entry?.timeMs).toBe(Date.UTC(2024, 0, 15, 9, 35, 0))
  })

  it('parses order SL and TP for EURUSD ticket 11111111', () => {
    const { orders } = parseMt5Html(FIXTURE)
    const order = orders.find((o) => o.orderId === '11111111')
    expect(order?.stopLoss).toBe('1.08423')
    expect(order?.takeProfit).toBe('1.08723')
  })

  it('parses USDJPY order with no close time as closeTimeMs null', () => {
    const { orders } = parseMt5Html(FIXTURE)
    const order = orders.find((o) => o.orderId === '33333333')
    expect(order?.closeTimeMs).toBeNull()
    expect(order?.closePrice).toBeNull()
  })

  it('silently skips the balance/deposit row without adding an error', () => {
    const { deals, errors } = parseMt5Html(FIXTURE)
    // The deposit row has dealId 10000000; it must not appear in deals
    expect(deals.find((d) => d.dealId === '10000000')).toBeUndefined()
    expect(errors).toHaveLength(0)
  })

  it("includes XYZABC deals (symbol resolution is not the parser's job)", () => {
    const { deals } = parseMt5Html(FIXTURE)
    const xyzDeals = deals.filter((d) => d.symbol === 'XYZABC')
    expect(xyzDeals).toHaveLength(2)
  })
})

describe('parseMt5Html — edge cases', () => {
  it('returns empty results for empty string', () => {
    const { deals, orders, errors } = parseMt5Html('')
    expect(deals).toHaveLength(0)
    expect(orders).toHaveLength(0)
    expect(errors).toHaveLength(0)
  })

  it('handles &nbsp; in cells gracefully', () => {
    const html = `
      <table><tr><td colspan=13><b>Deals</b></td></tr>
      <tr><td>Time</td><td>Deal</td><td>Symbol</td><td>Type</td><td>Direction</td>
          <td>Volume</td><td>Price</td><td>Order</td><td>Commission</td><td>Swap</td>
          <td>Profit</td><td>Balance</td><td>Comment</td></tr>
      <tr><td>2024.01.20&nbsp;10:00:00</td><td>99</td><td>EURUSD</td><td>buy</td>
          <td>in</td><td>0.10</td><td>1.09000</td><td>55</td><td>-0.80</td>
          <td>0.00</td><td>0.00</td><td>10000.00</td><td>&nbsp;</td></tr>
      </table>`
    const { deals, errors } = parseMt5Html(html)
    // The date with &nbsp; instead of space should parse correctly
    expect(deals).toHaveLength(1)
    expect(errors).toHaveLength(0)
    expect(deals[0]?.symbol).toBe('EURUSD')
  })

  it('adds a parse error for a deal row with an unparseable date', () => {
    const html = `
      <table><tr><td><b>Deals</b></td></tr>
      <tr><td>Time</td><td>Deal</td><td>Symbol</td><td>Type</td><td>Direction</td>
          <td>Volume</td><td>Price</td><td>Order</td><td>Commission</td><td>Swap</td>
          <td>Profit</td><td>Balance</td><td>Comment</td></tr>
      <tr><td>NOT A DATE</td><td>88</td><td>EURUSD</td><td>buy</td><td>in</td>
          <td>0.10</td><td>1.09000</td><td>77</td><td>-0.80</td><td>0.00</td>
          <td>0.00</td><td>10000.00</td><td></td></tr>
      </table>`
    const { deals, errors } = parseMt5Html(html)
    expect(deals).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.section).toBe('deals')
    expect(errors[0]?.reason).toContain('unparseable time')
  })

  it('tolerates missing attributes on table tags (malformed HTML)', () => {
    // MT5 sometimes emits <table border=1 cellspacing=0 cellpadding=3> without quotes
    const html = `<table border=1 cellspacing=0 cellpadding=3>
      <tr align=center bgcolor=#C0C0C0><td colspan=13><b>Deals</b></td></tr>
      <tr bgcolor=#C0C0C0>
        <td>Time</td><td>Deal</td><td>Symbol</td><td>Type</td><td>Direction</td>
        <td>Volume</td><td>Price</td><td>Order</td><td>Commission</td><td>Swap</td>
        <td>Profit</td><td>Balance</td><td>Comment</td>
      </tr>
      <tr bgcolor=#FFFFFF>
        <td>2024.03.01 12:00:00</td><td>200</td><td>GBPUSD</td><td>sell</td><td>in</td>
        <td>0.05</td><td>1.26500</td><td>300</td><td>-0.40</td><td>0.00</td>
        <td>0.00</td><td>20000.00</td><td></td>
      </tr>
    </table>`
    const { deals, errors } = parseMt5Html(html)
    expect(deals).toHaveLength(1)
    expect(errors).toHaveLength(0)
    expect(deals[0]?.symbol).toBe('GBPUSD')
  })

  it('handles a Spanish-language Deals section label', () => {
    const html = `<table><tr><td><b>Transacciones</b></td></tr>
      <tr><td>Time</td><td>Deal</td><td>Symbol</td><td>Type</td><td>Direction</td>
          <td>Volume</td><td>Price</td><td>Order</td><td>Commission</td><td>Swap</td>
          <td>Profit</td><td>Balance</td><td>Comment</td></tr>
      <tr><td>2024.02.10 15:00:00</td><td>500</td><td>EURUSD</td><td>buy</td>
          <td>in</td><td>0.10</td><td>1.07000</td><td>600</td><td>-0.80</td>
          <td>0.00</td><td>0.00</td><td>11000.00</td><td></td></tr>
      </table>`
    const { deals } = parseMt5Html(html)
    expect(deals).toHaveLength(1)
  })

  it('ignores tables that are not Deals or Orders', () => {
    // The account-info table at the top must not produce errors or phantom rows
    const { deals, orders, errors } = parseMt5Html(FIXTURE)
    expect(deals.length).toBeGreaterThan(0)
    expect(orders.length).toBeGreaterThan(0)
    expect(errors).toHaveLength(0)
  })
})
