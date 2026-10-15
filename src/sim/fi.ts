import type { Archetype } from './archetypes'
import type { Credit, CreditTier } from './credit'
import {
  acquisitionFee,
  approvingLenders,
  clampMarkup,
  lenderById,
  loanAmount,
  MAX_MARKUP,
  reserve,
  saveByDown,
  type LenderId,
} from './lenders'
import type { Warmth } from './negotiation'
import type { Rng } from './rng'

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
    base: 0.45,
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
/** Taken off every take chance for a cash buyer: it's a cheque, not a few dollars on the payment. */
export const CASH_TAKE = 0.15

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
 * product's base, their taste for it, less for a price toward its high end,
 * for every point of pressure and for paying cash (`CASH_TAKE`), plus
 * `bonus` (`Tuning.productTake`). 0 for a product they aren't offered.
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
    PRESSURE_DROP * pressure -
    (financing(c) ? 0 : CASH_TAKE) +
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
  /** Chargebacks that landed (see `sim/chargebacks.ts`): how many, and what they took back. */
  chargebackCount: number
  chargebacks: number
  /** Of those, the finance manager's commission share taken back off the day's commissions. */
  clawback: number
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
    chargebackCount: 0,
    chargebacks: 0,
    clawback: 0,
  }
}

/**
 * The day's F&I with a sale to a buyer with `credit` added, and its loan if
 * they had one. `menu`: the loan came with the F&I menu (the player's or the
 * finance manager's), so it counts toward penetration; a salesperson's loan
 * at the buy rate adds only its reserve and fee.
 */
export function addFiSale(
  stats: FiStats,
  credit: Credit | null,
  fi?: SaleFi,
  menu = true,
): FiStats {
  const financed = !!credit?.finance
  const out = {
    ...stats,
    financed: stats.financed + (financed ? 1 : 0),
    cash: stats.cash + (financed ? 0 : 1),
  }
  if (!fi) return out
  const money = { ...out, reserve: out.reserve + fi.reserve, fees: out.fees + fi.fee }
  if (!menu) return money
  const sold = { ...stats.sold }
  for (const p of fi.products) sold[p.id] = (sold[p.id] ?? 0) + 1
  return {
    ...money,
    menus: out.menus + 1,
    financedMenus: out.financedMenus + (fi.financed ? 1 : 0),
    productGross: out.productGross + fi.products.reduce((sum, p) => sum + p.price - p.cost, 0),
    sold,
  }
}

/** F&I over two spans added together, as the month's is from its days. */
export function addFiStats(a: FiStats, b: FiStats): FiStats {
  const sold = { ...a.sold }
  for (const id of PRODUCT_IDS) if (b.sold[id]) sold[id] = (sold[id] ?? 0) + (b.sold[id] ?? 0)
  return {
    financed: a.financed + b.financed,
    cash: a.cash + b.cash,
    declined: a.declined + b.declined,
    menus: a.menus + b.menus,
    financedMenus: a.financedMenus + b.financedMenus,
    reserve: a.reserve + b.reserve,
    productGross: a.productGross + b.productGross,
    fees: a.fees + b.fees,
    sold,
    chargebackCount: a.chargebackCount + b.chargebackCount,
    chargebacks: a.chargebacks + b.chargebacks,
    clawback: a.clawback + b.clawback,
  }
}

/** F&I gross per deal sold (every buyer, cash or financed), or null with none. */
export function fiPerDeal(stats: FiStats): number | null {
  const deals = stats.financed + stats.cash
  return deals > 0 ? fiDayGross(stats) / deals : null
}

/** The day's F&I gross: reserve and products, less lenders' fees and chargebacks. */
export function fiDayGross(stats: FiStats): number {
  return stats.reserve + stats.productGross - stats.fees - stats.chargebacks
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

/** How far the finance manager eases the markup for each tier: good credit shops its rate. */
export const STAFF_MARKUP_EASE: Record<CreditTier, number> = { A: 0.5, B: 0.75, C: 1, D: 1 }
/** Added to every take chance per skill level over `STAFF_PITCH_FROM`: a better pitch. */
export const STAFF_PITCH = 0.06
/** The skill whose pitch is the player's: an average finance manager does the menu for a living. */
export const STAFF_PITCH_FROM = 2
/** The take chance under which an average (skill 3) finance manager stops presenting. */
export const STAFF_FLOOR = 0.12
/** Added to the floor per skill level over average: a good one knows when to stop. */
export const STAFF_FLOOR_STEP = 0.03
/** Where in each product's price range an average finance manager prices it (0 low, 1 high). */
export const STAFF_PRICE_ALONG = 0.25
/** Added to that per skill level over average. */
export const STAFF_PRICE_STEP = 0.05

/** The markup a finance manager of `skill` puts on a buyer of `tier`, in quarter points. */
export function staffMarkup(skill: number, tier: CreditTier): number {
  return clampMarkup(Math.round((skill / 5) * MAX_MARKUP * STAFF_MARKUP_EASE[tier] * 4) / 4)
}

/** The take chance under which a finance manager of `skill` presents nothing more. */
export function staffFloor(skill: number): number {
  return STAFF_FLOOR + (skill - 3) * STAFF_FLOOR_STEP
}

/** What a finance manager of `skill` asks for `product`. */
export function staffPrice(skill: number, product: Product): number {
  const along = Math.max(0, Math.min(1, STAFF_PRICE_ALONG + (skill - 3) * STAFF_PRICE_STEP))
  return clampProductPrice(product.id, product.low + along * (product.high - product.low))
}

/** What a finance manager of `skill` adds to a take chance on top of `bonus`. */
function staffBonus(skill: number, bonus: number): number {
  return bonus + (skill - STAFF_PITCH_FROM) * STAFF_PITCH
}

/** The loan a finance manager sets up and the products he'll present, in order. */
export interface StaffPlan {
  deal: FiDeal
  presents: { id: ProductId; price: number }[]
}

/**
 * What a finance manager of `skill` will do with `c`, who pays `net`: the
 * down payment that gets them a loan (more if nobody takes them at theirs),
 * the approving lender with the best reserve less its fee at his markup, and
 * the products in order of likely take, until the next one's chance would be
 * under his floor. Null when no lender takes them at any down payment they
 * can reach. Deterministic, so the scene can time his paperwork from it.
 */
export function staffPlan(skill: number, c: FiBuyer, net: number, bonus = 0): StaffPlan | null {
  let deal = openDeal(c, net)
  if (loanDeclined(c, deal)) {
    const down = moreDownFor(c, net)
    if (down === null) return null
    deal = withDown(c, deal, net, down)
    if (loanDeclined(c, deal)) return null
  }
  if (deal.lender && c.credit) {
    const credit = { ...c.credit, down: deal.down }
    const markup = staffMarkup(skill, c.credit.tier)
    const amount = financedAmount(c, deal, net)
    const value = (id: LenderId) =>
      reserve(amount, markup, lenderById(id)) - acquisitionFee(lenderById(id), credit)
    const ids = approvingFor(c, net, deal.down)
    const best = ids.reduce((a, b) => (value(b) > value(a) ? b : a), ids[0])
    deal = { ...deal, lender: best, markup }
  }
  const more = staffBonus(skill, bonus)
  const presents: StaffPlan['presents'] = []
  let left = productsFor(c)
  let pressure = pressureOf(deal)
  while (left.length > 0) {
    const odds = left.map((p) => {
      const price = staffPrice(skill, p)
      return { p, price, chance: productTake(c, p, price, pressure, more) }
    })
    const next = odds.reduce((a, b) => (b.chance > a.chance ? b : a))
    if (next.chance < staffFloor(skill)) break
    presents.push({ id: next.p.id, price: next.price })
    left = left.filter((p) => p !== next.p)
    pressure += 1
  }
  return { deal, presents }
}

/**
 * The finance manager of `skill` runs `c`'s menu (see `staffPlan`), each
 * answer rolled on `rng`. Null when no lender takes them.
 */
export function staffMenu(
  skill: number,
  c: FiBuyer,
  net: number,
  rng: Rng,
  bonus = 0,
): FiDeal | null {
  const plan = staffPlan(skill, c, net, bonus)
  if (!plan) return null
  const more = staffBonus(skill, bonus)
  let deal = plan.deal
  for (const { id, price } of plan.presents) {
    const chance = productTake(c, PRODUCTS[id], price, pressureOf(deal), more)
    deal = answered(deal, id, price, rng.next() < chance)
  }
  return deal
}

/**
 * A salesperson signing at their own desk: the loan from the first lender
 * that takes the buyer at the buy rate, and no products. Null when no lender
 * takes them at their down payment (a finance manager could ask for more).
 */
export function deskLoan(c: FiBuyer, net: number): FiDeal | null {
  const deal = openDeal(c, net)
  return loanDeclined(c, deal) ? null : deal
}

// Satisfaction (19e): how the menu leaves the buyer feeling, for the visit's score.

/** Markup points a buyer takes as fair. */
export const FAIR_FI_MARKUP = 1
/** Products a buyer will hear about without feeling pushed. */
export const FAIR_FI_PRESENTED = 2
/** Added for a fair menu: a loan or products, at most a point of markup and two products shown. */
export const FAIR_FI_POINTS = 3
/** Taken off per markup point over `FAIR_FI_MARKUP`. */
export const MARKUP_POINTS = 4
/** Taken off per product turned down past the second. */
export const PUSH_POINTS = 3

/** What a menu did to the buyer's score: a fair one adds, markup and pushing take off. */
export interface FiFeeling {
  /** `FAIR_FI_POINTS` for a fair menu, else 0. */
  fair: number
  /** Off for markup over `FAIR_FI_MARKUP` (0 or less), and the points of it. */
  markup: number
  /** Off for products turned down past the second (0 or less), and how many. */
  pushed: number
  declined: number
}

/**
 * How `fi` sat with the buyer. A menu that arranged a loan or showed a
 * product, with markup up to `FAIR_FI_MARKUP` and no more than
 * `FAIR_FI_PRESENTED` products shown, adds `FAIR_FI_POINTS`. Every markup
 * point over it takes `MARKUP_POINTS` off, and every product turned down
 * past the second (a re-presented one counts again) `PUSH_POINTS`. A cash
 * buyer shown nothing is left as they were.
 */
export function fiSatisfaction(fi: SaleFi): FiFeeling {
  const declined = Math.max(0, fi.presented - fi.products.length)
  const overMarkup = Math.max(0, fi.markup - FAIR_FI_MARKUP)
  const ran = fi.financed || fi.presented > 0
  const fair = ran && overMarkup === 0 && fi.presented <= FAIR_FI_PRESENTED
  return {
    fair: fair ? FAIR_FI_POINTS : 0,
    // 0 −, so nothing off is 0 and not −0.
    markup: 0 - Math.round(overMarkup * MARKUP_POINTS),
    pushed: 0 - PUSH_POINTS * Math.max(0, declined - FAIR_FI_PRESENTED),
    declined,
  }
}

/** Easy's chip on the markup stepper: fair, costing a little goodwill, or steep. */
export function markupWarmth(markup: number): Warmth {
  return markup <= FAIR_FI_MARKUP ? 'hot' : markup <= 2 ? 'warm' : 'cold'
}
