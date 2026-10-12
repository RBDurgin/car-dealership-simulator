import type { Archetype } from './archetypes'
import type { Credit } from './credit'
import {
  acquisitionFee,
  approvingLenders,
  clampMarkup,
  lenderById,
  loanAmount,
  reserve,
  saveByDown,
  type LenderId,
} from './lenders'
import type { Warmth } from './negotiation'

/**
 * The F&I menu: once the price is agreed and the buyer is seated, the loan is
 * arranged (a lender and the markup) and products are presented one by one.
 * Each answer depends on the buyer, the price and the pressure so far, and
 * every product presented or markup point added makes the next answer harder.
 * Pure: the store rolls the answers and keeps the deal on the customer.
 */

export type ProductId = 'warranty' | 'gap' | 'protection' | 'tyre'

export interface Product {
  id: ProductId
  name: string
  /** The price range the stepper moves in. */
  low: number
  high: number
  /** What the product costs the dealer, as a share of its price. */
  costShare: number
  /** Only a buyer who takes a loan is offered it. */
  financedOnly: boolean
  /** The take chance at the low price with no pressure, before the buyer's taste. */
  base: number
}

export const PRODUCTS: Record<ProductId, Product> = {
  warranty: {
    id: 'warranty',
    name: 'Extended warranty',
    low: 1500,
    high: 2500,
    costShare: 0.45,
    financedOnly: false,
    base: 0.4,
  },
  gap: {
    id: 'gap',
    name: 'GAP cover',
    low: 600,
    high: 900,
    costShare: 0.3,
    financedOnly: true,
    base: 0.5,
  },
  protection: {
    id: 'protection',
    name: 'Paint and fabric',
    low: 400,
    high: 700,
    costShare: 0.25,
    financedOnly: false,
    base: 0.35,
  },
  tyre: {
    id: 'tyre',
    name: 'Tyre and wheel',
    low: 500,
    high: 800,
    costShare: 0.35,
    financedOnly: false,
    base: 0.35,
  },
}

/** The order the menu lists them in. */
export const PRODUCT_IDS: readonly ProductId[] = ['warranty', 'gap', 'protection', 'tyre']

/** The extended warranty's length. */
export const WARRANTY_MONTHS = 36

/** How a product's price stepper moves. */
export const PRODUCT_STEP = 50

/** Taken off the take chance from a product's low price to its high one. */
export const PRICE_DROP = 0.3
/** Taken off every take chance per point of pressure. */
export const PRESSURE_DROP = 0.06
/** Pressure added per markup point over the buy rate. */
export const MARKUP_PRESSURE = 0.8
/** Nobody is a sure thing. */
export const MAX_TAKE = 0.85

/** How each kind of buyer leans on each product: families like warranties, bargain hunters say no. */
const TASTE: Record<Archetype, Partial<Record<ProductId, number>>> = {
  regular: {},
  'tire-kicker': { warranty: -0.05, protection: -0.05 },
  decisive: { tyre: 0.05 },
  bargain: { warranty: -0.15, gap: -0.1, protection: -0.15, tyre: -0.15 },
  couple: { warranty: 0.15, gap: 0.05, protection: 0.05 },
  'used-shopper': { warranty: 0.1, protection: -0.1 },
}

/** One product's latest answer. */
export interface FiAnswer {
  id: ProductId
  price: number
  /** What it costs the dealer at that price. */
  cost: number
  taken: boolean
}

/** The F&I menu so far, kept on the customer while they're in `menu`. */
export interface FiDeal {
  /** The lender picked, or null for a cash buyer (or a loan nobody approves). */
  lender: LenderId | null
  /** Rate points over the lender's buy rate, 0 to `MAX_MARKUP`. */
  markup: number
  /** The share of the price the buyer puts down. */
  down: number
  /** Each product's latest answer, in the order answered: the last is the latest. */
  products: FiAnswer[]
  /** Products presented so far, counting one presented again. */
  presented: number
}

/** The part of a customer the menu reads. */
export type FiBuyer = { archetype: Archetype; credit: Credit | null; budget: number }

/** What the buyer pays for the car after their trade-in, which is what's financed from. */
export function netPrice(offer: { price: number; allowance?: number }): number {
  return offer.price - (offer.allowance ?? 0)
}

/** Whether `c` takes a loan. A buyer with no credit rolled pays cash. */
export function financing(c: FiBuyer): boolean {
  return !!c.credit?.finance
}

/** The products `c` is offered: GAP only on a loan. */
export function productsFor(c: FiBuyer): Product[] {
  return PRODUCT_IDS.map((id) => PRODUCTS[id]).filter((p) => !p.financedOnly || financing(c))
}

export function clampProductPrice(id: ProductId, price: number): number {
  const { low, high } = PRODUCTS[id]
  return Math.min(high, Math.max(low, Math.round(price / PRODUCT_STEP) * PRODUCT_STEP))
}

/** What product `id` costs the dealer at `price`. */
export function productCost(id: ProductId, price: number): number {
  return Math.round(price * PRODUCTS[id].costShare)
}

/** How hard the buyer has been pushed: products presented, and markup points. */
export function pressureOf(deal: FiDeal): number {
  return deal.presented + deal.markup * MARKUP_PRESSURE
}

/**
 * The chance `c` takes `product` at `price` with `pressure` on them: the
 * product's base, their taste for it, less for a price toward its high end
 * and for every point of pressure, plus `bonus` (`Tuning.productTake`).
 * 0 for a product they aren't offered.
 */
export function productTake(
  c: FiBuyer,
  product: Product,
  price: number,
  pressure: number,
  bonus = 0,
): number {
  if (product.financedOnly && !financing(c)) return 0
  const along = (clampProductPrice(product.id, price) - product.low) / (product.high - product.low)
  const chance =
    product.base +
    (TASTE[c.archetype][product.id] ?? 0) -
    PRICE_DROP * along -
    PRESSURE_DROP * pressure +
    bonus
  return Math.max(0, Math.min(MAX_TAKE, chance))
}

/** Easy's chip on a product: how likely `c` is to take it at `price` right now. */
export function fiWarmth(
  c: FiBuyer,
  product: Product,
  price: number,
  pressure: number,
  bonus = 0,
): Warmth {
  const chance = productTake(c, product, price, pressure, bonus)
  return chance >= 0.45 ? 'hot' : chance >= 0.2 ? 'warm' : 'cold'
}

/** What's borrowed on the deal: nothing for a cash buyer. */
export function financedAmount(c: FiBuyer, deal: FiDeal, net: number): number {
  return financing(c) ? loanAmount(net, deal.down) : 0
}

/** The lenders that would take `c`'s loan at `down`. */
export function approvingFor(c: FiBuyer, net: number, down: number): LenderId[] {
  if (!c.credit || !financing(c)) return []
  return approvingLenders({ ...c.credit, down }, loanAmount(net, down)).map((l) => l.id)
}

/**
 * The menu as it opens: a loan with the first lender that approves (the
 * cheapest buy rate) at no markup, at the down payment they brought; a cash
 * buyer has no lender.
 */
export function openDeal(c: FiBuyer, net: number): FiDeal {
  const down = financing(c) ? (c.credit?.down ?? 0) : 0
  return {
    lender: approvingFor(c, net, down)[0] ?? null,
    markup: 0,
    down,
    products: [],
    presented: 0,
  }
}

/** A financed buyer no lender will take at their down payment. */
export function loanDeclined(c: FiBuyer, deal: FiDeal): boolean {
  return financing(c) && deal.lender === null
}

/**
 * The down payment that would get `c` a loan when nobody approves them, or
 * null when their budget can't reach it (see `saveByDown`).
 */
export function moreDownFor(c: FiBuyer, net: number): number | null {
  return c.credit && financing(c) ? saveByDown(c.credit, c.budget, net) : null
}

/** The deal with `c` putting `down` down: the first lender that then approves. */
export function withDown(c: FiBuyer, deal: FiDeal, net: number, down: number): FiDeal {
  return { ...deal, down, lender: approvingFor(c, net, down)[0] ?? null }
}

/** Whether the loan can still be changed: only until the first product is presented. */
export function loanOpen(deal: FiDeal): boolean {
  return deal.presented === 0
}

/**
 * The deal with lender `id` at `markup`, or the same deal when that lender
 * won't take them or the loan is settled.
 */
export function withLoan(
  c: FiBuyer,
  deal: FiDeal,
  net: number,
  id: LenderId,
  markup: number,
): FiDeal {
  if (!loanOpen(deal) || !approvingFor(c, net, deal.down).includes(id)) return deal
  const m = clampMarkup(Math.round(markup * 4) / 4)
  return deal.lender === id && deal.markup === m ? deal : { ...deal, lender: id, markup: m }
}

/** The answer `c` last gave on product `id`, if it's been presented. */
export function answerFor(deal: FiDeal, id: ProductId): FiAnswer | undefined {
  return deal.products.find((p) => p.id === id)
}

/**
 * Whether product `id` can be presented at `price`: one they're offered and
 * haven't taken, and lower than last time if they turned it down.
 */
export function canPresent(c: FiBuyer, deal: FiDeal, id: ProductId, price: number): boolean {
  if (!productsFor(c).some((p) => p.id === id) || loanDeclined(c, deal)) return false
  const last = answerFor(deal, id)
  return !last || (!last.taken && clampProductPrice(id, price) < last.price)
}

/** The deal after `c` answered product `id` at `price`. */
export function answered(deal: FiDeal, id: ProductId, price: number, taken: boolean): FiDeal {
  const p = clampProductPrice(id, price)
  return {
    ...deal,
    products: [
      ...deal.products.filter((x) => x.id !== id),
      { id, price: p, cost: productCost(id, p), taken },
    ],
    presented: deal.presented + 1,
  }
}

/** What the products taken make the dealer: their prices less their cost. */
export function productGross(deal: FiDeal): number {
  return deal.products.reduce((sum, p) => sum + (p.taken ? p.price - p.cost : 0), 0)
}

/** The lender's reserve on `amount` at the deal's markup. */
export function dealReserve(deal: FiDeal, amount: number): number {
  return deal.lender ? reserve(amount, deal.markup, lenderById(deal.lender)) : 0
}

/** What the lender charges the dealer for the loan. */
export function dealFee(deal: FiDeal, credit: Credit | null): number {
  return deal.lender && credit ? acquisitionFee(lenderById(deal.lender), credit) : 0
}

/** The deal's F&I gross on `amount` borrowed: reserve and products, less the lender's fee. */
export function fiGross(deal: FiDeal, amount: number, credit: Credit | null): number {
  return dealReserve(deal, amount) + productGross(deal) - dealFee(deal, credit)
}

/** The F&I side of a sale, kept on the `Sale`. */
export interface SaleFi {
  financed: boolean
  lender: LenderId | null
  markup: number
  /** What was borrowed. */
  amount: number
  reserve: number
  /** The lender's acquisition fee. */
  fee: number
  /** The products taken. */
  products: { id: ProductId; price: number; cost: number }[]
  presented: number
  pressure: number
  gross: number
}

/** The record of `c`'s menu, for the sale. */
export function saleFi(c: FiBuyer, deal: FiDeal, net: number): SaleFi {
  const amount = financedAmount(c, deal, net)
  return {
    financed: financing(c),
    lender: deal.lender,
    markup: deal.markup,
    amount,
    reserve: dealReserve(deal, amount),
    fee: dealFee(deal, c.credit),
    products: deal.products
      .filter((p) => p.taken)
      .map(({ id, price, cost }) => ({ id, price, cost })),
    presented: deal.presented,
    pressure: pressureOf(deal),
    gross: fiGross(deal, amount, c.credit),
  }
}

/** The day's F&I, for the summary. */
export interface FiStats {
  /** Buyers who took a loan, and who paid cash (every sale, whoever signed it). */
  financed: number
  cash: number
  /** Buyers every lender declined who couldn't put more down, and left. */
  declined: number
  /** Deals that went through the menu, and of those the financed ones (GAP is only offered on a loan). */
  menus: number
  financedMenus: number
  reserve: number
  /** Products' prices less their cost. */
  productGross: number
  /** Lenders' acquisition fees. */
  fees: number
  /** Products sold, by product. */
  sold: Partial<Record<ProductId, number>>
}

export function emptyFiStats(): FiStats {
  return {
    financed: 0,
    cash: 0,
    declined: 0,
    menus: 0,
    financedMenus: 0,
    reserve: 0,
    productGross: 0,
    fees: 0,
    sold: {},
  }
}

/** The day's F&I with a sale to a buyer with `credit` added, and its menu if it had one. */
export function addFiSale(stats: FiStats, credit: Credit | null, fi?: SaleFi): FiStats {
  const financed = !!credit?.finance
  const out = {
    ...stats,
    financed: stats.financed + (financed ? 1 : 0),
    cash: stats.cash + (financed ? 0 : 1),
  }
  if (!fi) return out
  const sold = { ...stats.sold }
  for (const p of fi.products) sold[p.id] = (sold[p.id] ?? 0) + 1
  return {
    ...out,
    menus: out.menus + 1,
    financedMenus: out.financedMenus + (fi.financed ? 1 : 0),
    reserve: out.reserve + fi.reserve,
    productGross: out.productGross + fi.products.reduce((sum, p) => sum + p.price - p.cost, 0),
    fees: out.fees + fi.fee,
    sold,
  }
}

/** The day's F&I gross: reserve and products, less lenders' fees. */
export function fiDayGross(stats: FiStats): number {
  return stats.reserve + stats.productGross - stats.fees
}

/** The share of menus that sold product `id` (GAP: of the financed ones), or null with none. */
export function penetration(stats: FiStats, id: ProductId): number | null {
  const of = PRODUCTS[id].financedOnly ? stats.financedMenus : stats.menus
  return of > 0 ? (stats.sold[id] ?? 0) / of : null
}

/** "Extended warranty 2 of 5, GAP cover 1 of 3": products sold against the menus they could be. Empty with none. */
export function soldLine(stats: FiStats): string {
  return PRODUCT_IDS.flatMap((id) => {
    const n = stats.sold[id] ?? 0
    const of = PRODUCTS[id].financedOnly ? stats.financedMenus : stats.menus
    return n > 0 ? [`${PRODUCTS[id].name} ${n} of ${of}`] : []
  }).join(', ')
}

/** "3 financed, 2 cash, 1 declined": how the day's buyers paid. */
export function payLine(stats: FiStats): string {
  const declined = stats.declined > 0 ? `, ${stats.declined} declined` : ''
  return `${stats.financed} financed, ${stats.cash} cash${declined}`
}
