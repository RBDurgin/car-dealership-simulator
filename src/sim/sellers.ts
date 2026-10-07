import { ARCHETYPES, EXPECT_JITTER, type Archetype } from './archetypes'
import type { Customer } from './customers'
import { drivenCleanliness } from './driving'
import { roundTo100, type InventoryCar } from './inventory'
import type { CarModel } from './layout'
import { freeSlots, type Order, type Slot } from './ordering'
import { createRng, hashSeed, type Rng } from './rng'
import {
  appraisalNoise,
  estimateValue,
  GLANCE_NOISE,
  marketValue,
  usedStockCar,
  type Appraisal,
  type UsedInfo,
} from './usedCars'

/**
 * Sellers: visitors who drive in wanting cash for their car. Some drivers are
 * sellers; they wait by their car for an offer (haggled in
 * `sim/negotiation.ts`, `respondToBuyOffer`). A car we buy stays in customer
 * parking until closing, holding a lot space, and goes into stock when the
 * day is settled.
 */

/** What a seller wants, and what the player makes of their car. */
export interface Selling {
  /** What they hope to get for it. */
  hope: number
  /** The player's idea of its value: a quick look at first, closer once appraised. */
  estimate: Appraisal
  /** The player has looked the car over properly (`appraise`). */
  appraised: boolean
}

/** Share of drivers who come to sell their car rather than to shop. */
export const SELLER_CHANCE = 0.3

/** A seller came on purpose, so waits this much longer than a shopper would. */
export const SELLER_PATIENCE = 1.5

/** What the player learns about a seller on greeting, by archetype. */
export const SELLER_HINTS: Record<Archetype, string> = {
  regular: 'Open to offers',
  'tire-kicker': 'Testing the waters',
  decisive: 'Wants a quick sale',
  bargain: 'Wants top dollar',
  couple: 'Selling the family car',
}

/** The level's levers on sellers (`Tuning.sellerHope`, `Tuning.appraisalNoise`). */
export interface SellerOpts {
  hope?: number
  noise?: number
}

/**
 * What a seller hopes to get for a car worth `value`: a little over it, by
 * their archetype's haggle `expect` give or take `EXPECT_JITTER` (a bargain
 * hunter wants more, a decisive one less), × the level's `factor`.
 */
export function sellerHope(value: number, c: Pick<Customer, 'archetype'>, rng: Rng, factor = 1) {
  const jitter = (rng.next() * 2 - 1) * EXPECT_JITTER
  return roundTo100(value * (1 + ARCHETYPES[c.archetype].haggle.expect + jitter) * factor)
}

/**
 * Driver `c` as a seller on `day`: they don't shop, they hope to sell their
 * car, they wait `SELLER_PATIENCE` times longer, and the player has only had
 * a quick look at the car so far.
 */
export function toSeller(c: Customer, rng: Rng, day: number, opts: SellerOpts = {}): Customer {
  const car = c.vehicle!.car
  const value = marketValue(car.model, car, day)
  const noise = opts.noise ?? 1
  return {
    ...c,
    browseCarIds: [],
    browsed: 0,
    targetCarId: null,
    patience: Math.round(c.patience * SELLER_PATIENCE),
    patienceLeft: Math.round(c.patienceLeft * SELLER_PATIENCE),
    selling: {
      hope: sellerHope(value, c, rng, opts.hope),
      estimate: estimateValue(car.model, car, day, GLANCE_NOISE * noise, rng),
      appraised: false,
    },
  }
}

/** Makes `SELLER_CHANCE` of the drivers among `arrived` sellers. */
export function assignSellers(
  arrived: readonly Customer[],
  rng: Rng,
  day: number,
  opts: SellerOpts = {},
): Customer[] {
  return arrived.map((c) =>
    c.vehicle && rng.next() < SELLER_CHANCE ? toSeller(c, rng, day, opts) : c,
  )
}

/** A driver's car (a seller's, or a trade-in) sized up properly, at `noise` × an appraiser of `skill`. */
export function appraiseFor(
  c: Customer,
  day: number,
  skill: number,
  rng: Rng,
  noise = 1,
): Appraisal | null {
  const car = c.vehicle?.car
  return car ? estimateValue(car.model, car, day, appraisalNoise(skill) * noise, rng) : null
}

/**
 * Salesperson `employeeId`'s (of `skill`) appraisal of customer `c`'s car on
 * `day`, the same every time they're asked, or null if there's no car.
 */
export function staffAppraisal(
  c: Customer,
  employeeId: string,
  day: number,
  skill: number,
): Appraisal | null {
  return appraiseFor(c, day, skill, createRng(hashSeed(`${c.id}:${employeeId}:appraise`)))
}

/** The low and high ends of an estimate. */
export function estimateRange(a: Appraisal): { low: number; high: number } {
  return { low: Math.max(0, a.estimate - a.margin), high: a.estimate + a.margin }
}

/** A used car bought today, parked in customer parking until closing. */
export interface Purchase {
  /** Its stock id (`used-<day>-<n>`). */
  id: string
  /** The seller's customer id: their car stays in the world under it. */
  customerId: string
  sellerName: string
  car: UsedInfo & { model: CarModel }
  /** The customer-parking space it stands in. */
  spot: number
  /** The lot space held for it, where it goes at closing. */
  slot: Slot
  price: number
  cleanliness: number
}

/** A purchase as the summary lists it. */
export interface BoughtCar {
  model: CarModel
  year: number
  sellerName: string
  price: number
  /** What it was really worth that day. */
  value: number
  /** Taken in trade on a sale (at its allowance), rather than bought for cash. */
  trade: boolean
}

/** What buying needs to know about the dealership. */
export interface BuyBook {
  cash: number
  inventory: readonly InventoryCar[]
  orders: readonly Order[]
  purchases: readonly Purchase[]
}

/** The lot spaces held for today's purchases. */
export function reservedSlots(purchases: readonly Purchase[]): Slot[] {
  return purchases.map((p) => p.slot)
}

/** The first lot space (never a showroom platform) free for a used car, or null. */
export function lotSlotFor(book: Omit<BuyBook, 'cash'>): Slot | null {
  const free = freeSlots(book.inventory, book.orders, reservedSlots(book.purchases))
  return free.find((s) => s.location === 'lot') ?? null
}

export const NO_ROOM = 'No room on the lot.'
export const NO_CASH = 'Not enough cash.'

/** Why the player can't buy a car for `price` now (no room, or no cash), or null. */
export function buyBlocker(book: BuyBook, price = 0): string | null {
  if (!lotSlotFor(book)) return NO_ROOM
  if (book.cash < price) return NO_CASH
  return null
}

/**
 * Seller `c`'s car bought for `price` on `day`, as stock id `id`, holding the
 * first free lot space. Null if there's no car or no room.
 */
export function purchaseOf(
  c: Customer,
  price: number,
  book: Omit<BuyBook, 'cash'>,
  id: string,
): Purchase | null {
  const slot = lotSlotFor(book)
  if (!c.vehicle || !slot) return null
  const { car, spot } = c.vehicle
  return {
    id,
    customerId: c.id,
    sellerName: c.name,
    car,
    spot,
    slot,
    price,
    cleanliness: drivenCleanliness(c.id, car.condition),
  }
}

/**
 * For the summary: what was bought (or, `trade`, taken in trade), for how
 * much and what it was worth on `day`.
 */
export function boughtRecord(p: Purchase, day: number, trade = false): BoughtCar {
  return {
    trade,
    model: p.car.model,
    year: p.car.year,
    sellerName: p.sellerName,
    price: p.price,
    value: marketValue(p.car.model, p.car, day),
  }
}

/** Today's purchases as stock on `day`, each in its held space, costing what we paid. */
export function stockPurchases(purchases: readonly Purchase[], day: number): InventoryCar[] {
  return purchases.map((p) => usedStockCar(p.id, p.car, p.slot, p.price, day, p.cleanliness))
}

/** What the day's used-car purchases cost, trade-ins at their allowance. */
export function boughtSpend(bought: readonly BoughtCar[]): number {
  return bought.reduce((sum, b) => sum + b.price, 0)
}

/** Action target id for the car customer `id` drove in. */
export function vehicleTargetId(id: string): string {
  return `vehicle:${id}`
}

/** The customer id behind a `vehicleTargetId`, or null for any other target. */
export function vehicleOwnerId(targetId: string): string | null {
  return targetId.startsWith('vehicle:') ? targetId.slice('vehicle:'.length) : null
}
