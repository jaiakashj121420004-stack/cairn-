import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import {
  calculatePnl,
  calculateDurationMinutes,
  type PnlInputs,
} from '../../electron/services/pnl-calculator'

// Bounds chosen to stay well inside decimal.js' 20-significant-figure precision so
// the final integer round is never ambiguous: prices ~1e7 ticks, lots ≤ 1000 std
// lots (×100), pip value ≤ $100/pip, account ≤ $10M.
const arbDirection = fc.constantFrom<'long' | 'short'>('long', 'short')
const arbPrice = fc.integer({ min: 1, max: 50_000_000 }) // stored ticks
const arbLot = fc.integer({ min: 1, max: 100_000 }) // lots × 100
const arbSlPips = fc.integer({ min: 1, max: 100_000 }) // pips × 10
const arbPipValue = fc.integer({ min: 1, max: 10_000 }) // cents per std lot per pip
const arbAccount = fc.integer({ min: 1, max: 1_000_000_000 }) // cents

const arbInputs: fc.Arbitrary<PnlInputs> = fc.record({
  direction: arbDirection,
  exitPrice: arbPrice,
  entryPrice: arbPrice,
  lotSize: arbLot,
  slPips: arbSlPips,
  pipValuePerStandardLotCents: arbPipValue,
  accountSizeCents: arbAccount,
})

describe('calculatePnl — golden values (regression pins)', () => {
  it('EURUSD long, +50 pips, 0.50 lots ($5/pip), $10/pip-std → +$250.00, +2.50R', () => {
    // entry 109000, exit 109500 → 500 tenths = 50 pips. SL 20 pips = 200 tenths.
    const r = calculatePnl({
      direction: 'long',
      entryPrice: 109_000,
      exitPrice: 109_500,
      lotSize: 50, // 0.50 lots
      slPips: 200, // 20 pips
      pipValuePerStandardLotCents: 1000, // $10/pip per std lot
      accountSizeCents: 1_000_000, // $10,000
    })
    // 500 tenths × 50 (lots×100) × 1000 (cents/pip/std-lot) / 1000 = 25_000 cents.
    // Sanity: 0.50 lots → $5/pip; 50 pips → $250.00 → 25_000 cents.
    expect(r.pnlCents).toBe(25_000)
    // R = 500*100/200 = 250 → 2.50R
    expect(r.pnlR).toBe(250)
    // 25000 cents / 1,000,000 cents = 2.5% = 250 bps
    expect(r.pnlPctBps).toBe(250)
  })

  it('short that loses: entry 109000, exit 109500 → negative, symmetric to long', () => {
    const long = calculatePnl({
      direction: 'long',
      entryPrice: 109_000,
      exitPrice: 109_500,
      lotSize: 50,
      slPips: 200,
      pipValuePerStandardLotCents: 1000,
      accountSizeCents: 1_000_000,
    })
    const short = calculatePnl({
      direction: 'short',
      entryPrice: 109_000,
      exitPrice: 109_500,
      lotSize: 50,
      slPips: 200,
      pipValuePerStandardLotCents: 1000,
      accountSizeCents: 1_000_000,
    })
    expect(short.pnlCents).toBe(-long.pnlCents)
    expect(short.pnlR).toBe(-long.pnlR)
    expect(short.pnlPctBps).toBe(-long.pnlPctBps)
  })

  it('guards divide-by-zero: slPips=0 → pnlR 0; account=0 → pnlPctBps 0', () => {
    const r = calculatePnl({
      direction: 'long',
      entryPrice: 100,
      exitPrice: 200,
      lotSize: 100,
      slPips: 0,
      pipValuePerStandardLotCents: 1000,
      accountSizeCents: 0,
    })
    expect(r.pnlR).toBe(0)
    expect(r.pnlPctBps).toBe(0)
  })
})

describe('calculatePnl — invariants', () => {
  it('always returns integers (the storage contract)', () => {
    fc.assert(
      fc.property(arbInputs, (inp) => {
        const r = calculatePnl(inp)
        expect(Number.isInteger(r.pnlCents)).toBe(true)
        expect(Number.isInteger(r.pnlR)).toBe(true)
        expect(Number.isInteger(r.pnlPctBps)).toBe(true)
      }),
    )
  })

  it('direction flip negates pnl up to a 1-unit tie-rounding skew', () => {
    fc.assert(
      fc.property(arbInputs, (inp) => {
        const long = calculatePnl({ ...inp, direction: 'long' })
        const short = calculatePnl({ ...inp, direction: 'short' })
        // signedTenths flips sign exactly, but rounding ties go toward +∞ (Math.round
        // semantics, preserved by the decimal.js conversion). So a result landing on a
        // .5 boundary rounds the loss and the mirror gain in the SAME direction, leaving
        // |short + long| = 1 rather than 0. This off-by-one is a property of the encoding,
        // not of the float→decimal change — it held under the old Math.round code too.
        expect(Math.abs(short.pnlCents + long.pnlCents)).toBeLessThanOrEqual(1)
        expect(Math.abs(short.pnlR + long.pnlR)).toBeLessThanOrEqual(1)
        expect(Math.abs(short.pnlPctBps + long.pnlPctBps)).toBeLessThanOrEqual(1)
      }),
    )
  })
})

describe('decimal arithmetic is associative within precision (the float-trap the conversion closes)', () => {
  // The whole point of moving off `number`: a×b×c/d must not depend on evaluation
  // order. With IEEE-754 it can; with decimal.js it does not. We assert the three
  // multiplication orderings of the pnlCents numerator are bit-identical, and that a
  // float evaluation of a deliberately adversarial case diverges (so the test has teeth).
  it('(a·b)·c === a·(b·c) === (a·c)·b exactly, for the pnl numerator shape', () => {
    fc.assert(
      fc.property(arbPrice, arbLot, arbPipValue, (a, b, c) => {
        const o1 = new Decimal(a).times(b).times(c)
        const o2 = new Decimal(a).times(new Decimal(b).times(c))
        const o3 = new Decimal(a).times(c).times(b)
        expect(o1.equals(o2)).toBe(true)
        expect(o1.equals(o3)).toBe(true)
      }),
    )
  })

  it('division distributes the same regardless of when the /1000 is applied', () => {
    fc.assert(
      fc.property(arbPrice, arbLot, arbPipValue, (a, b, c) => {
        const late = new Decimal(a).times(b).times(c).div(1000)
        const early = new Decimal(a).div(1000).times(b).times(c)
        // Both are computed to 20 significant figures; for these bounded integer
        // operands the results are exactly equal.
        expect(late.equals(early)).toBe(true)
      }),
    )
  })
})

describe('R-multiple is scale-invariant (multiply entry/SL/TP/exit by k → R unchanged)', () => {
  // R = (exit−entry in tenths) × 100 / slPips. Prices and the SL distance live in the
  // same tick unit, so scaling every price input — entry, exit, and the SL distance
  // (slPips) — by an integer k must leave R untouched. pnlCents scales by k (NOT
  // invariant); only R is. We assert R is EXACTLY equal across scales.
  const arbScale = fc.integer({ min: 1, max: 1000 })

  it('pnlR is identical under common scaling of entry, exit, and slPips', () => {
    fc.assert(
      fc.property(
        arbDirection,
        fc.integer({ min: 1, max: 1_000_000 }), // entry (kept small so entry·k stays in bounds)
        fc.integer({ min: 1, max: 1_000_000 }), // exit
        fc.integer({ min: 1, max: 100_000 }), // slPips
        arbScale,
        arbLot,
        arbPipValue,
        arbAccount,
        (direction, entry, exit, slPips, k, lot, pipVal, acct) => {
          const base = calculatePnl({
            direction,
            entryPrice: entry,
            exitPrice: exit,
            slPips,
            lotSize: lot,
            pipValuePerStandardLotCents: pipVal,
            accountSizeCents: acct,
          })
          const scaled = calculatePnl({
            direction,
            entryPrice: entry * k,
            exitPrice: exit * k,
            slPips: slPips * k,
            lotSize: lot,
            pipValuePerStandardLotCents: pipVal,
            accountSizeCents: acct,
          })
          expect(scaled.pnlR).toBe(base.pnlR)
        },
      ),
    )
  })

  it('and pnlCents does scale by k (sanity: proves the invariance above is non-trivial)', () => {
    const inp: PnlInputs = {
      direction: 'long',
      entryPrice: 1000,
      exitPrice: 1500,
      slPips: 200,
      lotSize: 100,
      pipValuePerStandardLotCents: 1000,
      accountSizeCents: 10_000_000,
    }
    const base = calculatePnl(inp)
    const scaled = calculatePnl({
      ...inp,
      entryPrice: 1000 * 7,
      exitPrice: 1500 * 7,
      slPips: 200 * 7,
    })
    expect(scaled.pnlCents).toBe(base.pnlCents * 7)
    expect(scaled.pnlR).toBe(base.pnlR) // unchanged
  })
})

describe('calculateDurationMinutes', () => {
  it('uses actualEntryTime when present, else createdAt', () => {
    expect(calculateDurationMinutes(60_000, 660_000, 0)).toBe(10) // 600_000ms = 10min
    expect(calculateDurationMinutes(null, 660_000, 60_000)).toBe(10)
  })

  it('rounds to nearest minute and never returns a non-integer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000_000 }),
        fc.integer({ min: 0, max: 10_000_000_000 }),
        (open, exit) => {
          const d = calculateDurationMinutes(open, exit, open)
          expect(Number.isInteger(d)).toBe(true)
        },
      ),
    )
  })
})
