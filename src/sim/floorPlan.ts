import type { InventoryCar } from './inventory'
import type { Order } from './ordering'

/**
 * The floor plan: a credit line from the bank that pays the manufacturer for
 * stock. Each floored car accrues daily interest while it sits on the lot, and
 * the bank is repaid its cost out of the sale price (or earlier, from cash).
 */

/** The most the bank will have out on floored cars and orders at once. */
export const FLOOR_PLAN_LIMIT = 200_000

/** Interest per day on each floored car in stock: 0.2%, about $80 a day on a $40k car. */
export const FLOOR_PLAN_DAILY_RATE = 0.002

/** The cost of the floored cars in stock. */
function flooredStock(inventory: readonly InventoryCar[]): number {
  return inventory
    .filter((c) => c.floored && c.status === 'available')
    .reduce((sum, c) => sum + c.cost, 0)
}

/** What the bank is owed: floored cars still in stock plus floored orders on the way. */
export function floorBalance(inventory: readonly InventoryCar[], orders: readonly Order[]): number {
  const pending = orders.filter((o) => o.financing === 'floor').reduce((sum, o) => sum + o.cost, 0)
  return flooredStock(inventory) + pending
}

/**
 * One day's interest, to the dollar, on the floored cars in stock, with the
 * level's `rate` factor. Orders accrue nothing.
 */
export function dailyInterest(inventory: readonly InventoryCar[], rate = 1): number {
  return Math.round(flooredStock(inventory) * FLOOR_PLAN_DAILY_RATE * rate)
}

/** What goes back to the bank out of the sale price when `car` is sold. */
export function payoffOnSale(car: InventoryCar): number {
  return car.floored ? car.cost : 0
}
