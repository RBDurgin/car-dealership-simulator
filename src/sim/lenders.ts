import type { Credit, CreditTier } from './credit'

/**
 * The banks that lend to our buyers. Each approves some credit tiers at its
 * buy rate; the dealer may add up to `MAX_MARKUP` points on top, and the
 * lender pays back a share of that extra interest up front as the reserve.
 */

export type LenderId = 'prime' | 'union' | 'subprime'

export interface Lender {
  id: LenderId
  name: string
  /** The tiers it lends to. */
  tiers: readonly CreditTier[]
  /** Its rate to the dealer, a yearly fraction (0.049 is 4.9%). */
  buyRate: number
  /** × the usual reserve: a subprime lender keeps more of the markup. */
  reserveShare: number
  /** The least down payment it needs from a tier, as a share of the price. */
  minDown: Partial<Record<CreditTier, number>>
  /** The most it lends, or null for no limit. */
  maxAmount: number | null
  /** What it charges the dealer for buying a loan from a tier. */
  acquisitionFee: Partial<Record<CreditTier, number>>
}

export const LENDERS: readonly Lender[] = [
  {
    id: 'prime',
    name: 'Prime Bank',
    tiers: ['A', 'B'],
    buyRate: 0.049,
    reserveShare: 1,
    minDown: {},
    maxAmount: null,
    acquisitionFee: {},
  },
  {
    id: 'union',
    name: 'Credit Union',
    tiers: ['A', 'B', 'C'],
    buyRate: 0.059,
    reserveShare: 1,
    minDown: { C: 0.1 },
    maxAmount: null,
    acquisitionFee: {},
  },
  {
    id: 'subprime',
    name: 'Subprime Auto',
    tiers: ['C', 'D'],
    buyRate: 0.129,
    reserveShare: 0.6,
    minDown: { D: 0.1 },
    maxAmount: 40_000,
    acquisitionFee: { D: 595 },
  },
]

export function lenderById(id: LenderId): Lender {
  return LENDERS.find((l) => l.id === id)!
}

/** The most the dealer may add to a lender's buy rate, in rate points. */
export const MAX_MARKUP = 2.5

/** Every loan runs this many months. */
export const TERM_MONTHS = 60

/** The share of the markup's extra interest a lender pays the dealer up front (× `reserveShare`). */
export const RESERVE_SHARE = 0.55

/** Why a lender turns a buyer down. */
export type DeclineReason = 'tier' | 'down' | 'amount'

/**
 * Why `lender` won't lend `amount` (the price less the down payment) to a
 * buyer with `credit`, or null when it will.
 */
export function declineReason(
  lender: Lender,
  credit: Credit,
  amount: number,
): DeclineReason | null {
  if (!lender.tiers.includes(credit.tier)) return 'tier'
  if (credit.down < (lender.minDown[credit.tier] ?? 0)) return 'down'
  if (lender.maxAmount !== null && amount > lender.maxAmount) return 'amount'
  return null
}

export function approves(lender: Lender, credit: Credit, amount: number): boolean {
  return declineReason(lender, credit, amount) === null
}

/** The lenders that would lend `amount` to a buyer with `credit`. */
export function approvingLenders(credit: Credit, amount: number): Lender[] {
  return LENDERS.filter((l) => approves(l, credit, amount))
}

/** What's borrowed on a car at `price` with `down` (a share) put down. */
export function loanAmount(price: number, down: number): number {
  return Math.round(price * (1 - down))
}

/** `markup` held between 0 and `MAX_MARKUP`. */
export function clampMarkup(markup: number): number {
  return Math.min(MAX_MARKUP, Math.max(0, markup))
}

/** The buyer's yearly rate: the lender's buy rate plus the dealer's markup points. */
export function buyerRate(lender: Lender, markup: number): number {
  return lender.buyRate + clampMarkup(markup) / 100
}

/** The monthly payment on `amount` at yearly `rate` over `months`. */
export function monthlyPayment(amount: number, rate: number, months = TERM_MONTHS): number {
  const r = rate / 12
  if (r === 0) return amount / months
  return (amount * r) / (1 - (1 + r) ** -months)
}

/** All the interest paid on `amount` at `rate` over the term. */
function totalInterest(amount: number, rate: number): number {
  return monthlyPayment(amount, rate) * TERM_MONTHS - amount
}

/**
 * What the lender pays the dealer up front for `markup` points on `amount`:
 * a share of the extra interest the buyer pays over the term, about 1.5% of
 * the amount per point at a prime rate.
 */
export function reserve(amount: number, markup: number, lender: Lender): number {
  const m = clampMarkup(markup)
  if (m === 0 || amount <= 0) return 0
  const extra =
    totalInterest(amount, buyerRate(lender, m)) - totalInterest(amount, buyerRate(lender, 0))
  return Math.round(extra * RESERVE_SHARE * lender.reserveShare)
}

/** The fee `lender` charges the dealer for a loan to a buyer with `credit`. */
export function acquisitionFee(lender: Lender, credit: Credit): number {
  return lender.acquisitionFee[credit.tier] ?? 0
}

/**
 * The down payment (a share of `price`) that would get some lender to
 * approve a buyer every lender declines, or null when they can't reach it.
 * They can add what's left of their `budget` over the price to what they
 * meant to put down. A buyer one lender already approves keeps their down.
 */
export function saveByDown(credit: Credit, budget: number, price: number): number | null {
  if (!credit.finance || price <= 0) return null
  if (approvingLenders(credit, loanAmount(price, credit.down)).length > 0) return credit.down
  const most = credit.down + Math.max(0, budget - price) / price
  let best: number | null = null
  for (const l of LENDERS) {
    if (!l.tiers.includes(credit.tier)) continue
    const forAmount = l.maxAmount === null ? 0 : 1 - l.maxAmount / price
    const need = Math.max(credit.down, l.minDown[credit.tier] ?? 0, forAmount)
    // Rounded up to a whole percent, then checked again against the lender.
    const share = Math.ceil(need * 100 - 1e-9) / 100
    if (!approves(l, { ...credit, down: share }, loanAmount(price, share))) continue
    if (best === null || share < best) best = share
  }
  return best !== null && best <= most + 1e-9 ? best : null
}
