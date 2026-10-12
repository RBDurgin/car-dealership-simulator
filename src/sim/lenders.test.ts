import { describe, expect, it } from 'vitest'
import type { Credit } from './credit'
import {
  acquisitionFee,
  approves,
  approvingLenders,
  buyerRate,
  declineReason,
  lenderById,
  loanAmount,
  MAX_MARKUP,
  monthlyPayment,
  reserve,
  saveByDown,
} from './lenders'

const credit = (tier: Credit['tier'], down = 0): Credit => ({ tier, finance: true, down })
const prime = lenderById('prime')
const union = lenderById('union')
const subprime = lenderById('subprime')
const ids = (c: Credit, amount = 30_000) => approvingLenders(c, amount).map((l) => l.id)

describe('approves', () => {
  it('lends to the tiers each lender takes', () => {
    expect(ids(credit('A'))).toEqual(['prime', 'union'])
    expect(ids(credit('B'))).toEqual(['prime', 'union'])
    expect(ids(credit('C'))).toEqual(['subprime'])
    expect(ids(credit('D', 0.1))).toEqual(['subprime'])
  })

  it('has the credit union take C only with 10% down', () => {
    expect(declineReason(union, credit('C', 0.05), 30_000)).toBe('down')
    expect(approves(union, credit('C', 0.1), 30_000)).toBe(true)
  })

  it('has subprime want 10% down on D, and cap the amount', () => {
    expect(declineReason(subprime, credit('D'), 30_000)).toBe('down')
    expect(declineReason(subprime, credit('C'), 45_000)).toBe('amount')
    expect(declineReason(prime, credit('C'), 30_000)).toBe('tier')
    expect(ids(credit('D'))).toEqual([])
  })
})

describe('rates and reserve', () => {
  it('adds the markup to the buy rate, up to MAX_MARKUP', () => {
    expect(buyerRate(prime, 0)).toBeCloseTo(prime.buyRate)
    expect(buyerRate(prime, 1.5)).toBeCloseTo(prime.buyRate + 0.015)
    expect(buyerRate(prime, 9)).toBeCloseTo(prime.buyRate + MAX_MARKUP / 100)
  })

  it('pays about 1.5% of the amount per markup point at a prime rate', () => {
    expect(reserve(30_000, 0, prime)).toBe(0)
    const one = reserve(30_000, 1, prime)
    expect(one / 30_000).toBeGreaterThan(0.013)
    expect(one / 30_000).toBeLessThan(0.017)
    expect(reserve(30_000, 2, prime)).toBeGreaterThan(one * 1.9)
    expect(reserve(30_000, 5, prime)).toBe(reserve(30_000, MAX_MARKUP, prime))
  })

  it('pays less on a subprime loan', () => {
    expect(reserve(30_000, 1, subprime)).toBeLessThan(reserve(30_000, 1, prime))
  })

  it('works out a monthly payment', () => {
    expect(monthlyPayment(60_000, 0)).toBe(1_000)
    expect(monthlyPayment(30_000, 0.06)).toBeCloseTo(580, 0)
  })

  it('charges an acquisition fee only on subprime D', () => {
    expect(acquisitionFee(subprime, credit('D', 0.1))).toBeGreaterThan(0)
    expect(acquisitionFee(subprime, credit('C'))).toBe(0)
    expect(acquisitionFee(prime, credit('A'))).toBe(0)
  })

  it('borrows the price less the down payment', () => {
    expect(loanAmount(30_000, 0.1)).toBe(27_000)
  })
})

describe('saveByDown', () => {
  it('keeps the down of a buyer someone approves', () => {
    expect(saveByDown(credit('A', 0.05), 30_000, 30_000)).toBe(0.05)
  })

  it('finds the least extra down that gets a lender to approve', () => {
    // D with 5% down needs subprime's 10%: $1,500 more on a $30k car.
    expect(saveByDown(credit('D', 0.05), 32_000, 30_000)).toBe(0.1)
  })

  it('is null when their budget does not stretch to it', () => {
    expect(saveByDown(credit('D', 0.02), 30_500, 30_000)).toBeNull()
  })

  it('brings a C buyer on a dear car under the amount cap or up to the credit union', () => {
    // At $50k, the union's 10% down beats subprime's 20%.
    expect(saveByDown(credit('C', 0.04), 55_000, 50_000)).toBe(0.1)
  })

  it('is null for cash buyers', () => {
    expect(saveByDown({ tier: 'D', finance: false, down: 0 }, 50_000, 30_000)).toBeNull()
  })
})
