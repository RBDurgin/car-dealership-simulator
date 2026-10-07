import { CAR_MODELS } from './customers'
import { CLOSEOUT_REBATE, closeoutOn } from './events'
import { FLOOR_PLAN_LIMIT, floorBalance } from './floorPlan'
import { BASE_MSRP, rollMsrp, roundTo100, type CarLocation, type InventoryCar } from './inventory'
import {
  DISPLAY_CARS,
  PARKING_SPACES,
  parkedCarRect,
  type CarModel,
  type Facing,
  type Rect,
} from './layout'
import { createRng, type Rng } from './rng'

/**
 * Buying stock from the manufacturer: the catalog's invoice prices, the day's
 * incentive and month-end closeout, where a new car can go, and placing,
 * cancelling and delivering orders. Orders are delivered the next morning.
 */

/** The manufacturer's invoice is this fraction of a model's base MSRP. */
export const INVOICE_FRACTION = 0.88
/** The day's incentive model is this much off invoice. */
export const INCENTIVE_DISCOUNT = 0.05
const INCENTIVE_SEED = 15_000

export type Financing = 'cash' | 'floor'

/** A place a car can stand: a showroom platform (`DISPLAY_CARS` index) or a lot space. */
export interface Slot {
  location: CarLocation
  index: number
}

export interface Order {
  id: string
  model: CarModel
  /** The invoice paid, which becomes the car's cost. */
  cost: number
  financing: Financing
  /** Where the car will be parked when it arrives. */
  slot: Slot
  /** The day it was ordered. */
  day: number
}

/** The manufacturer's list price to the dealer for `model`, before any incentive. */
export function invoicePrice(model: CarModel): number {
  return roundTo100(BASE_MSRP[model] * INVOICE_FRACTION)
}

/** The model on incentive on `day`: the same for everyone who plays that day. */
export function dailyIncentive(day: number): CarModel {
  return createRng(INCENTIVE_SEED + day).pick(CAR_MODELS)
}

/**
 * What ordering `model` costs on `day`: the invoice, less the day's incentive
 * and the month-end closeout rebate if it's that model (both, if it's both).
 * `invoice` scales the invoice for the difficulty level.
 */
export function orderCost(model: CarModel, day: number, invoice = 1): number {
  let factor = invoice
  if (dailyIncentive(day) === model) factor *= 1 - INCENTIVE_DISCOUNT
  if (closeoutOn(day) === model) factor *= 1 - CLOSEOUT_REBATE
  const price = invoicePrice(model)
  return factor === 1 ? price : roundTo100(price * factor)
}

/** Every slot on the premises: the showroom platforms first, then the lot spaces. */
export const ALL_SLOTS: readonly Slot[] = [
  ...DISPLAY_CARS.map((_, index): Slot => ({ location: 'showroom', index })),
  ...PARKING_SPACES.map((_, index): Slot => ({ location: 'lot', index })),
]

/** Where a car in `slot` stands and which way it faces. */
export function slotPlacement(slot: Slot): { rect: Rect; facing: Facing } {
  if (slot.location === 'showroom') {
    const { rect, facing } = DISPLAY_CARS[slot.index]
    return { rect, facing }
  }
  const space = PARKING_SPACES[slot.index]
  return { rect: parkedCarRect(space), facing: space.facing }
}

const overlaps = (a: Rect, b: Rect) =>
  a.tx < b.tx + b.w && b.tx < a.tx + a.w && a.tz < b.tz + b.h && b.tz < a.tz + a.h

const sameSlot = (a: Slot, b: Slot) => a.location === b.location && a.index === b.index

/**
 * Slots with no car in stock on them and no order claiming them, showroom
 * platforms first, then lot spaces.
 */
export function freeSlots(inventory: readonly InventoryCar[], orders: readonly Order[]): Slot[] {
  const stocked = inventory.filter((c) => c.status === 'available').map((c) => c.rect)
  return ALL_SLOTS.filter((slot) => {
    if (orders.some((o) => sameSlot(o.slot, slot))) return false
    const { rect } = slotPlacement(slot)
    return !stocked.some((r) => overlaps(r, rect))
  })
}

/** Whether a car standing on `rect` would sit in a slot an order has claimed. */
export function claimedByOrder(rect: Rect, orders: readonly Order[]): boolean {
  return orders.some((o) => overlaps(slotPlacement(o.slot).rect, rect))
}

/** What ordering needs to know about the dealership. */
export interface OrderBook {
  cash: number
  inventory: readonly InventoryCar[]
  orders: readonly Order[]
}

export type OrderResult =
  { ok: true; order: Order; orders: Order[]; cash: number } | { ok: false; reason: string }

/** The first `order-<day>-<n>` id not already taken. */
function nextOrderId(orders: readonly Order[], day: number): string {
  const taken = new Set(orders.map((o) => o.id))
  let n = 1
  while (taken.has(`order-${day}-${n}`)) n++
  return `order-${day}-${n}`
}

/**
 * Orders a `model` on `day`, into the first free slot. Paid in cash now, or on
 * the floor plan. Fails with the reason when there's no room, not enough cash,
 * or the floor plan would go over its limit. `invoice` is the level's invoice
 * factor (see `orderCost`).
 */
export function placeOrder(
  book: OrderBook,
  model: CarModel,
  financing: Financing,
  day: number,
  invoice = 1,
): OrderResult {
  const slot = freeSlots(book.inventory, book.orders)[0]
  if (!slot) return { ok: false, reason: 'No room: every space is taken or on order.' }
  const cost = orderCost(model, day, invoice)
  if (financing === 'cash' && book.cash < cost) {
    return { ok: false, reason: 'Not enough cash.' }
  }
  if (
    financing === 'floor' &&
    floorBalance(book.inventory, book.orders) + cost > FLOOR_PLAN_LIMIT
  ) {
    return { ok: false, reason: 'Over the floor plan limit.' }
  }
  const order: Order = { id: nextOrderId(book.orders, day), model, cost, financing, slot, day }
  return {
    ok: true,
    order,
    orders: [...book.orders, order],
    cash: financing === 'cash' ? book.cash - cost : book.cash,
  }
}

/**
 * Cancels order `id`: a cash order is refunded, a floored one frees its credit.
 * Orders are delivered the next morning, so any pending order can be cancelled.
 * Returns the same orders and cash if there's no such order.
 */
export function cancelOrder(
  book: Pick<OrderBook, 'cash' | 'orders'>,
  id: string,
): { orders: Order[]; cash: number } {
  const order = book.orders.find((o) => o.id === id)
  if (!order) return { orders: [...book.orders], cash: book.cash }
  return {
    orders: book.orders.filter((o) => o !== order),
    cash: order.financing === 'cash' ? book.cash + order.cost : book.cash,
  }
}

/**
 * The ordered cars, parked in their slots on the morning of `day`: clean, with
 * their MSRP rolled from `rng` and the invoice they were ordered at as cost.
 */
export function deliver(orders: readonly Order[], rng: Rng, day: number): InventoryCar[] {
  return orders.map((o, i) => {
    const { rect, facing } = slotPlacement(o.slot)
    return {
      id: `stock-${day}-${i + 1}`,
      model: o.model,
      location: o.slot.location,
      spaceIndex: o.slot.location === 'lot' ? o.slot.index : null,
      rect,
      facing,
      msrp: rollMsrp(o.model, rng),
      cost: o.cost,
      status: 'available',
      cleanliness: 1,
      arrivedDay: day,
      floored: o.financing === 'floor',
    }
  })
}
