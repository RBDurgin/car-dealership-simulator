import { describe, expect, it } from 'vitest'
import { dailyInterest, FLOOR_PLAN_DAILY_RATE, floorBalance, payoffOnSale } from './floorPlan'
import { buildInventory, sellCar, type InventoryCar } from './inventory'
import type { Order } from './ordering'
import { createRng } from './rng'

const opening = buildInventory(createRng(1))
/** The opening stock with cars `ids` bought on the floor plan at `cost`. */
const floored = (ids: string[], cost = 40_000): InventoryCar[] =>
  opening.map((c) => (ids.includes(c.id) ? { ...c, floored: true, cost } : c))

const order = (financing: Order['financing'], cost: number): Order => ({
  id: `order-1-${cost}`,
  model: 'suv',
  cost,
  financing,
  slot: { location: 'lot', index: 2 },
  day: 1,
})

describe('floor plan', () => {
  it('owes nothing on stock owned outright', () => {
    expect(floorBalance(opening, [])).toBe(0)
    expect(dailyInterest(opening)).toBe(0)
  })

  it('owes the cost of floored cars in stock and floored orders', () => {
    const inventory = floored(['lot-car-1', 'lot-car-2'])
    const orders = [order('floor', 30_000), order('cash', 20_000)]
    expect(floorBalance(inventory, orders)).toBe(110_000)
    // A sold car's loan was repaid out of the sale.
    expect(floorBalance(sellCar(inventory, 'lot-car-1'), orders)).toBe(70_000)
  })

  it('charges interest only on floored cars in stock, not on orders', () => {
    const inventory = floored(['lot-car-1', 'lot-car-2'])
    expect(dailyInterest(inventory)).toBe(80_000 * FLOOR_PLAN_DAILY_RATE)
    expect(dailyInterest(inventory)).toBe(160)
    expect(dailyInterest(sellCar(inventory, 'lot-car-2'))).toBe(80)
    // A level's rate factor.
    expect(dailyInterest(inventory, 1.5)).toBe(240)
  })

  it('repays a floored car out of its sale', () => {
    const [car] = floored(['display-1'], 52_300)
    expect(payoffOnSale(car)).toBe(52_300)
    expect(payoffOnSale(opening[0])).toBe(0)
  })
})
