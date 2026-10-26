import type { Lot } from './auction'
import type { InventoryCar } from './inventory'
import type { CarModel } from './layout'
import type { LotResult } from './bidding'
import { gradeOf, STALE_DAYS } from './usedCars'

/**
 * Wholesale: a used car the dealership doesn't want to keep is consigned to
 * the next dealer auction. It stays for sale until auction morning, then
 * runs as a lot badged Yours and goes to the highest bidder, less the seller
 * fee. A car that doesn't reach its floor (or draws no bids) comes back the
 * next morning, less the run fee. Pure: the store keeps the consignments
 * (saved) and the day's lots (never saved).
 */

/** The auction's seller fee: a flat amount plus a share of the hammer price. */
export const SELLER_FEE = { flat: 100, share: 0.015 }
/** What a car that ran and didn't sell costs to bring back. */
export const RUN_FEE = 100
/** The most cars the dealership can run in one auction. */
export const MAX_CONSIGNED = 4
/**
 * With auto-wholesale on, the used-car manager sends used cars held this many
 * days or more: twice `STALE_DAYS` (a literal, as this module is in an import cycle with it).
 */
export const AUTO_WHOLESALE_DAYS = 20

/** A car marked for the next auction. Saved. */
export interface Consignment {
  /** Its stock id: a car in stock, or a used car bought today (stocked tonight). */
  carId: string
  /** The least it may sell for; 0 for no floor. */
  floor: number
}

/** A car of ours the trade bought. */
export interface WholesaleSale {
  model: CarModel
  year: number
  price: number
  /** The seller fee taken off the price. */
  fee: number
  /** What it cost us. */
  cost: number
  /** The dealer who bought it. */
  buyer: string
}

/** A car of ours that ran and didn't sell (or wasn't reached), back on the lot tomorrow. */
export interface WholesaleReturn {
  model: CarModel
  year: number
  /** The high bid it stopped at, 0 with no bids (or if it didn't run). */
  high: number
  floor: number
  /** The run fee, 0 if the run closed before it came up. */
  fee: number
}

/** The day's wholesale. Its gross (which can be negative) counts in `totalGross`. */
export interface WholesaleStats {
  sold: WholesaleSale[]
  returned: WholesaleReturn[]
}

export function emptyWholesaleStats(): WholesaleStats {
  return { sold: [], returned: [] }
}

/** The seller fee on a hammer price of `price`, rounded to $10. */
export function sellerFee(price: number): number {
  return Math.round((SELLER_FEE.flat + price * SELLER_FEE.share) / 10) * 10
}

/** The day's wholesale gross: each sale's price less its fee and cost, less run fees. */
export function wholesaleGross(stats: WholesaleStats): number {
  const sold = stats.sold.reduce((sum, w) => sum + w.price - w.fee - w.cost, 0)
  return sold - stats.returned.reduce((sum, r) => sum + r.fee, 0)
}

/** The consignment of car `carId`, if it's marked for the auction. */
export function consignmentOf(
  consigned: readonly Consignment[],
  carId: string,
): Consignment | undefined {
  return consigned.find((c) => c.carId === carId)
}

/** What consigning needs to know: stock, today's used-car buys and what's consigned. */
export interface ConsignBook {
  inventory: readonly InventoryCar[]
  /** Used cars bought today, by stock id: they go into stock tonight. */
  purchases: readonly { id: string }[]
  consigned: readonly Consignment[]
  /** Whether the dealership has the rank for the auction. */
  open: boolean
}

/**
 * Why car `carId` can't be consigned: the auction isn't open, it isn't a used
 * car of ours, it's already going (or gone), or the next run is full. Null if it can.
 */
export function consignBlocker(book: ConsignBook, carId: string): string | null {
  if (!book.open) return 'The dealer auction isn’t open to you yet.'
  if (consignmentOf(book.consigned, carId)) return 'It’s already going to the auction.'
  const car = book.inventory.find((c) => c.id === carId)
  const bought = book.purchases.some((p) => p.id === carId)
  if (!car && !bought) return 'That car isn’t in stock.'
  if (car && !car.used) return 'Only used cars go to the dealer auction.'
  if (car?.status === 'sold') return 'That car is sold.'
  if (car?.status === 'auction') return 'It’s at the auction today.'
  if (book.consigned.length >= MAX_CONSIGNED)
    return `The auction takes up to ${MAX_CONSIGNED} of your cars a week.`
  return null
}

/** `consigned` with car `carId` added at `floor`. */
export function consign(
  consigned: readonly Consignment[],
  carId: string,
  floor = 0,
): Consignment[] {
  return [...consigned, { carId, floor: Math.max(0, Math.round(floor)) }]
}

/** `consigned` without car `carId` (the same array if it wasn't there). */
export function unconsign(consigned: Consignment[], carId: string): Consignment[] {
  return consignmentOf(consigned, carId) ? consigned.filter((c) => c.carId !== carId) : consigned
}

/** `consigned` with car `carId`'s floor set to `floor` (0 for none). */
export function withFloor(
  consigned: readonly Consignment[],
  carId: string,
  floor: number,
): Consignment[] {
  const f = Math.max(0, Math.round(floor))
  return consigned.map((c) => (c.carId === carId ? { ...c, floor: f } : c))
}

/**
 * Consignments whose car is still in stock and unsold (the same array if
 * all are): one sold or stolen meanwhile is dropped.
 */
export function liveConsigned(
  consigned: Consignment[],
  inventory: readonly InventoryCar[],
): Consignment[] {
  const live = (c: Consignment) =>
    inventory.some((car) => car.id === c.carId && car.status !== 'sold')
  return consigned.every(live) ? consigned : consigned.filter(live)
}

/**
 * On auction morning: the consigned used cars that go to the run (in stock
 * and for sale), as lots after the `listed` lots of the week's run list,
 * each badged with its consignment, and the consignments left for next week.
 */
export function consignedLots(
  consigned: readonly Consignment[],
  inventory: readonly InventoryCar[],
  listed: number,
  day: number,
): { lots: Lot[]; rest: Consignment[] } {
  const lots: Lot[] = []
  const rest: Consignment[] = []
  for (const c of consigned) {
    const car = inventory.find((x) => x.id === c.carId)
    if (!car?.used || car.status !== 'available') {
      rest.push(c)
      continue
    }
    const n = lots.length + 1
    lots.push({
      id: `lot-${day}-yours-${n}`,
      car: { ...car.used, model: car.model },
      // We know the car: the sheet reads it as it is.
      reading: car.used.condition,
      grade: gradeOf(car.used.condition),
      order: listed + n,
      consigned: c,
    })
  }
  return { lots, rest }
}

/** Used cars for sale that have been held `days` or more, oldest first, not already consigned. */
export function heldCars(
  inventory: readonly InventoryCar[],
  consigned: readonly Consignment[],
  day: number,
  days: number,
): InventoryCar[] {
  return inventory
    .filter(
      (c) =>
        c.used &&
        c.status === 'available' &&
        day - c.used.acquiredDay >= days &&
        !consignmentOf(consigned, c.id),
    )
    .sort((a, b) => a.used!.acquiredDay - b.used!.acquiredDay)
}

/** The used-car manager's picks to wholesale: stale cars (`STALE_DAYS`+), oldest first. */
export function wholesaleSuggestions(
  inventory: readonly InventoryCar[],
  consigned: readonly Consignment[],
  day: number,
): InventoryCar[] {
  return heldCars(inventory, consigned, day, STALE_DAYS)
}

/**
 * Auto-wholesale on the morning before an auction: `consigned` with used cars
 * held `AUTO_WHOLESALE_DAYS` or more added, oldest first, while the run has
 * room. No floor: the trade's price is the point.
 */
export function autoConsign(
  consigned: Consignment[],
  inventory: readonly InventoryCar[],
  day: number,
): Consignment[] {
  const room = MAX_CONSIGNED - consigned.length
  if (room <= 0) return consigned
  const picks = heldCars(inventory, consigned, day, AUTO_WHOLESALE_DAYS).slice(0, room)
  return picks.length === 0
    ? consigned
    : [...consigned, ...picks.map((c) => ({ carId: c.id, floor: 0 }))]
}

/** For the summary: car `car` sold at auction for `price` to `buyer`. */
export function wholesaleRecord(car: InventoryCar, price: number, buyer: string): WholesaleSale {
  return {
    model: car.model,
    year: car.used?.year ?? 0,
    price,
    fee: sellerFee(price),
    cost: car.cost,
    buyer,
  }
}

/** For the summary: consigned `lot` coming back, with how its run went (none if it wasn't reached). */
export function returnRecord(lot: Lot, result: LotResult | undefined): WholesaleReturn {
  return {
    model: lot.car.model,
    year: lot.car.year,
    high: result?.price ?? 0,
    floor: lot.consigned?.floor ?? 0,
    fee: result ? RUN_FEE : 0,
  }
}

/** "Your 2019 Sedan stopped at $8,200, under your $9,000 floor" or "… drew no bids". */
export function unsoldLine(
  lot: Lot,
  result: LotResult,
  name: string,
  money: (n: number) => string,
): string {
  const car = `Your ${lot.car.year} ${name}`
  const why = result.short
    ? `stopped at ${money(result.price)}, under your ${money(lot.consigned?.floor ?? 0)} floor`
    : 'drew no bids'
  return `${car} ${why}: it's back on the lot tomorrow (${money(RUN_FEE)} run fee).`
}
