import { describe, expect, it } from 'vitest'
import type { Credit } from './credit'
import {
  addFiSale,
  answered,
  canPresent,
  emptyFiStats,
  fiDayGross,
  fiGross,
  fiWarmth,
  loanDeclined,
  loanOpen,
  MARKUP_PRESSURE,
  MAX_TAKE,
  moreDownFor,
  netPrice,
  openDeal,
  payLine,
  penetration,
  pressureOf,
  PRODUCTS,
  productsFor,
  productTake,
  saleFi,
  soldLine,
  withDown,
  withLoan,
  type FiBuyer,
} from './fi'
import { lenderById, loanAmount, MAX_MARKUP, reserve } from './lenders'

const credit = (extra: Partial<Credit> = {}): Credit => ({
  tier: 'A',
  finance: true,
  down: 0.1,
  ...extra,
})
const buyer = (extra: Partial<FiBuyer> = {}): FiBuyer => ({
  archetype: 'regular',
  credit: credit(),
  budget: 40_000,
  ...extra,
})
const cash = buyer({ credit: credit({ finance: false, down: 0 }) })
const { warranty, gap, protection } = PRODUCTS

describe('products', () => {
  it('offers GAP only on a loan', () => {
    expect(productsFor(buyer()).map((p) => p.id)).toEqual(['warranty', 'gap', 'protection', 'tyre'])
    expect(productsFor(cash).map((p) => p.id)).not.toContain('gap')
    expect(productsFor(buyer({ credit: null })).map((p) => p.id)).not.toContain('gap')
    expect(productTake(cash, gap, gap.low, 0)).toBe(0)
  })

  it('is taken less at a higher price and under more pressure', () => {
    const c = buyer()
    expect(productTake(c, warranty, warranty.high, 0)).toBeLessThan(
      productTake(c, warranty, warranty.low, 0),
    )
    expect(productTake(c, warranty, warranty.low, 3)).toBeLessThan(
      productTake(c, warranty, warranty.low, 1),
    )
  })

  it('follows the buyer: families like warranties, bargain hunters say no', () => {
    const at = (archetype: FiBuyer['archetype']) =>
      productTake(buyer({ archetype }), warranty, warranty.low, 0)
    expect(at('couple')).toBeGreaterThan(at('regular'))
    expect(at('bargain')).toBeLessThan(at('regular'))
    expect(
      productTake(buyer({ archetype: 'bargain' }), protection, protection.low, 0),
    ).toBeLessThan(productTake(buyer(), protection, protection.low, 0))
  })

  it('adds the level bonus and stays between 0 and the cap', () => {
    const c = buyer({ archetype: 'couple' })
    expect(productTake(c, warranty, warranty.low, 0, 0.05)).toBeCloseTo(
      productTake(c, warranty, warranty.low, 0) + 0.05,
    )
    expect(productTake(c, warranty, warranty.low, 0, 5)).toBe(MAX_TAKE)
    expect(productTake(c, warranty, warranty.high, 50)).toBe(0)
  })

  it('warms Easy’s chip with the odds', () => {
    const c = buyer({ archetype: 'couple' })
    expect(fiWarmth(c, warranty, warranty.low, 0)).toBe('hot')
    expect(fiWarmth(c, warranty, warranty.high, 10)).toBe('cold')
    expect(['hot', 'warm', 'cold']).toContain(fiWarmth(c, warranty, warranty.high, 1))
  })
})

describe('the deal', () => {
  const net = 30_000

  it('opens with the cheapest lender that approves, at no markup and their own down payment', () => {
    expect(openDeal(buyer(), net)).toEqual({
      lender: 'prime',
      markup: 0,
      down: 0.1,
      products: [],
      presented: 0,
    })
    expect(openDeal(buyer({ credit: credit({ tier: 'C' }) }), net).lender).toBe('union')
    expect(openDeal(cash, net)).toMatchObject({ lender: null, down: 0 })
    expect(loanDeclined(cash, openDeal(cash, net))).toBe(false)
  })

  it('finds no lender for some, and more down can save them if their budget allows', () => {
    const d = buyer({ credit: credit({ tier: 'D', down: 0 }), budget: 40_000 })
    const deal = openDeal(d, net)
    expect(loanDeclined(d, deal)).toBe(true)
    const more = moreDownFor(d, net)
    expect(more).toBe(0.1)
    const saved = withDown(d, deal, net, more!)
    expect(saved).toMatchObject({ lender: 'subprime', down: 0.1 })
    expect(loanDeclined(d, saved)).toBe(false)
    expect(moreDownFor({ ...d, budget: net }, net)).toBeNull()
    expect(moreDownFor(cash, net)).toBeNull()
  })

  it('takes a lender that approves at a markup up to the cap, until the first product', () => {
    const c = buyer()
    const deal = openDeal(c, net)
    expect(withLoan(c, deal, net, 'union', 1)).toMatchObject({ lender: 'union', markup: 1 })
    expect(withLoan(c, deal, net, 'prime', 9).markup).toBe(MAX_MARKUP)
    expect(withLoan(c, deal, net, 'prime', -1).markup).toBe(0)
    // Subprime doesn't lend to tier A.
    expect(withLoan(c, deal, net, 'subprime', 1)).toBe(deal)
    const presented = answered(withLoan(c, deal, net, 'prime', 1), 'warranty', 1500, false)
    expect(loanOpen(presented)).toBe(false)
    expect(withLoan(c, presented, net, 'prime', 2)).toBe(presented)
  })

  it('counts every product presented and markup point as pressure', () => {
    const c = buyer()
    let deal = withLoan(c, openDeal(c, net), net, 'prime', 1)
    expect(pressureOf(deal)).toBeCloseTo(MARKUP_PRESSURE)
    deal = answered(deal, 'warranty', 2000, false)
    deal = answered(deal, 'gap', 600, true)
    expect(pressureOf(deal)).toBeCloseTo(2 + MARKUP_PRESSURE)
  })

  it('presents a product once, or again for less after a no', () => {
    const c = buyer()
    let deal = openDeal(c, net)
    expect(canPresent(c, deal, 'warranty', 2000)).toBe(true)
    deal = answered(deal, 'warranty', 2000, false)
    expect(canPresent(c, deal, 'warranty', 2000)).toBe(false)
    expect(canPresent(c, deal, 'warranty', 1800)).toBe(true)
    deal = answered(deal, 'warranty', 1800, true)
    expect(deal.products).toEqual([{ id: 'warranty', price: 1800, cost: 810, taken: true }])
    expect(deal.presented).toBe(2)
    expect(canPresent(c, deal, 'warranty', 1500)).toBe(false)
    expect(canPresent(cash, openDeal(cash, net), 'gap', 600)).toBe(false)
  })

  it('makes the reserve and the products taken, less the lender’s fee', () => {
    const c = buyer()
    let deal = withLoan(c, openDeal(c, net), net, 'prime', 1)
    deal = answered(deal, 'warranty', 2000, true)
    deal = answered(deal, 'gap', 900, false)
    const amount = loanAmount(net, 0.1)
    const res = reserve(amount, 1, lenderById('prime'))
    expect(fiGross(deal, amount, c.credit)).toBe(res + 2000 - 900)
    // Subprime charges a fee on tier D.
    const d = buyer({ credit: credit({ tier: 'D', down: 0.1 }) })
    const sub = openDeal(d, net)
    expect(fiGross(sub, amount, d.credit)).toBe(-595)
  })

  it('records the sale’s F&I', () => {
    const c = buyer()
    let deal = withLoan(c, openDeal(c, net), net, 'prime', 1)
    deal = answered(deal, 'warranty', 2000, true)
    deal = answered(deal, 'gap', 600, false)
    const fi = saleFi(c, deal, net)
    expect(fi).toMatchObject({
      financed: true,
      lender: 'prime',
      markup: 1,
      amount: 27_000,
      fee: 0,
      products: [{ id: 'warranty', price: 2000, cost: 900 }],
      presented: 2,
    })
    expect(fi.pressure).toBeCloseTo(2 + MARKUP_PRESSURE)
    expect(fi.gross).toBe(fi.reserve + 1100)
    expect(saleFi(cash, openDeal(cash, net), net)).toMatchObject({
      financed: false,
      amount: 0,
      reserve: 0,
      gross: 0,
    })
  })

  it('finances the price after the trade-in', () => {
    expect(netPrice({ price: 30_000, allowance: 8_000 })).toBe(22_000)
    expect(netPrice({ price: 30_000 })).toBe(30_000)
  })
})

describe('the day’s F&I', () => {
  it('counts how buyers paid, the menus and what they made', () => {
    const c = buyer()
    let deal = withLoan(c, openDeal(c, 30_000), 30_000, 'prime', 1)
    deal = answered(deal, 'warranty', 2000, true)
    const fi = saleFi(c, deal, 30_000)
    let stats = addFiSale(emptyFiStats(), c.credit, fi)
    stats = addFiSale(stats, cash.credit, saleFi(cash, openDeal(cash, 30_000), 30_000))
    // A staff sale: counted as paid, but no menu.
    stats = addFiSale(stats, credit(), undefined)
    expect(stats).toMatchObject({
      financed: 2,
      cash: 1,
      menus: 2,
      financedMenus: 1,
      reserve: fi.reserve,
      productGross: 1100,
      sold: { warranty: 1 },
    })
    expect(fiDayGross(stats)).toBe(fi.gross)
    expect(penetration(stats, 'warranty')).toBe(0.5)
    expect(penetration(stats, 'gap')).toBe(0)
    expect(penetration(emptyFiStats(), 'gap')).toBeNull()
    expect(soldLine(stats)).toBe('Extended warranty 1 of 2')
    expect(payLine({ ...stats, declined: 1 })).toBe('2 financed, 1 cash, 1 declined')
  })
})
