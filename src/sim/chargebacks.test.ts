import { describe, expect, it } from 'vitest'
import {
  CHARGEBACK_DAYS,
  chargebackChance,
  chargebackNotice,
  chargebackTotal,
  clawbackTotal,
  dueChargebacks,
  MAX_CHARGEBACK,
  rollChargebacks,
  type Chargeback,
} from './chargebacks'
import type { SaleFi } from './fi'
import { createRng } from './rng'
import { FI_COMMISSION } from './staff'

const fi = (extra: Partial<SaleFi> = {}): SaleFi => ({
  financed: true,
  lender: 'prime',
  markup: 1,
  amount: 30_000,
  reserve: 600,
  fee: 0,
  products: [
    { id: 'warranty', price: 1800, cost: 810 },
    { id: 'gap', price: 700, cost: 210 },
  ],
  presented: 2,
  pressure: 2.8,
  gross: 2080,
  ...extra,
})

const deal = { day: 10, customerName: 'Ann K.', tier: 'B' as const, financeId: null }

describe('chargebacks', () => {
  it('are likelier with pressure, markup and weaker credit', () => {
    const base = chargebackChance('warranty', 3, 1, 'A')
    expect(chargebackChance('warranty', 6, 1, 'A')).toBeGreaterThan(base)
    expect(chargebackChance('warranty', 3, 2.5, 'A')).toBeGreaterThan(base)
    expect(chargebackChance('warranty', 3, 1, 'C')).toBeGreaterThan(base)
    expect(chargebackChance('warranty', 3, 1, 'D')).toBeGreaterThan(
      chargebackChance('warranty', 3, 1, 'C'),
    )
    // Pressure under the fair line and markup up to a point cost nothing.
    expect(chargebackChance('warranty', 1, 0.5, 'A')).toBe(base)
    // The markup sends a buyer to refinance: the reserve feels it most.
    const reserveRise =
      chargebackChance('reserve', 3, 2.5, 'A') - chargebackChance('reserve', 3, 1, 'A')
    const productRise = chargebackChance('gap', 3, 2.5, 'A') - chargebackChance('gap', 3, 1, 'A')
    expect(reserveRise).toBeGreaterThan(productRise)
  })

  it('scale with the level and are capped', () => {
    const c = chargebackChance('tyre', 5, 2, 'C')
    expect(chargebackChance('tyre', 5, 2, 'C', 1.4)).toBeCloseTo(c * 1.4)
    expect(chargebackChance('tyre', 50, 2.5, 'D', 2)).toBe(MAX_CHARGEBACK)
    expect(chargebackChance('tyre', 3, 1, null, 0)).toBe(0)
  })

  it('are rolled once per product and the reserve, the same on the same seed', () => {
    const a = rollChargebacks(fi(), deal, createRng(7))
    expect(rollChargebacks(fi(), deal, createRng(7))).toEqual(a)
    let hits: Chargeback[] = []
    for (let seed = 1; seed <= 400; seed++) {
      hits = [...hits, ...rollChargebacks(fi(), deal, createRng(seed))]
    }
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) {
      expect(h.day).toBeGreaterThanOrEqual(10 + CHARGEBACK_DAYS.min)
      expect(h.day).toBeLessThanOrEqual(10 + CHARGEBACK_DAYS.max)
      expect(h.clawback).toBe(0)
      const amount = { warranty: 990, gap: 490, reserve: 600 }[h.kind as 'warranty']
      expect(h.amount).toBe(amount)
    }
  })

  it('come back more often on a deal sold hard', () => {
    const count = (f: SaleFi, tier: 'A' | 'D') => {
      let n = 0
      for (let seed = 1; seed <= 500; seed++) {
        n += rollChargebacks(f, { ...deal, tier }, createRng(seed)).length
      }
      return n
    }
    const hard = fi({ markup: 2.5, presented: 6, pressure: 8 })
    expect(count(hard, 'D')).toBeGreaterThan(count(fi(), 'A') * 2)
  })

  it('take back the finance manager’s share when he signed the deal', () => {
    let hit: Chargeback | undefined
    for (let seed = 1; !hit; seed++) {
      hit = rollChargebacks(fi(), { ...deal, financeId: 'fm-1' }, createRng(seed))[0]
    }
    expect(hit.financeId).toBe('fm-1')
    expect(hit.clawback).toBe(Math.round(hit.amount * FI_COMMISSION))
    // He's still on the payroll, or he isn't.
    expect(clawbackTotal([hit], () => true)).toBe(hit.clawback)
    expect(clawbackTotal([hit], () => false)).toBe(0)
  })

  it('land on their day, told in the morning', () => {
    const list: Chargeback[] = [
      {
        day: 30,
        amount: 990,
        customerName: 'Ann K.',
        kind: 'warranty',
        financeId: null,
        clawback: 0,
      },
      {
        day: 31,
        amount: 850,
        customerName: 'Bo L.',
        kind: 'reserve',
        financeId: null,
        clawback: 0,
      },
      { day: 40, amount: 300, customerName: 'Cy M.', kind: 'tyre', financeId: null, clawback: 0 },
    ]
    const { due, later } = dueChargebacks(list, 31)
    expect(due.map((c) => c.customerName)).toEqual(['Ann K.', 'Bo L.'])
    expect(later.map((c) => c.customerName)).toEqual(['Cy M.'])
    expect(chargebackTotal(due)).toBe(1840)
    expect(chargebackNotice(due)).toBe(
      "Two chargebacks today: -$1,840 (Ann K.'s extended warranty, Bo L.'s lender's reserve).",
    )
    expect(chargebackNotice([])).toBeNull()
  })
})
