import { describe, expect, it } from 'vitest'
import { CLOSEOUT_REBATE, closeoutOn } from './events'
import { FLOOR_PLAN_LIMIT } from './floorPlan'
import { BASE_MSRP, buildInventory, MSRP_VARIATION, sellCar, type InventoryCar } from './inventory'
import { DISPLAY_CARS, PARKING_SPACES, parkedCarRect, type CarModel } from './layout'
import {
  ALL_SLOTS,
  cancelOrder,
  dailyIncentive,
  deliver,
  INCENTIVE_DISCOUNT,
  freeSlots,
  invoicePrice,
  orderCost,
  placeOrder,
  type Order,
  type OrderBook,
} from './ordering'
import { createRng } from './rng'

const opening = buildInventory(createRng(1))
const book = (extra: Partial<OrderBook> = {}): OrderBook => ({
  cash: 100_000,
  inventory: opening,
  orders: [],
  ...extra,
})

/** A day on which `model` isn't on incentive. */
const fullPriceDay = (model: CarModel) => {
  let day = 1
  while (dailyIncentive(day) === model) day++
  return day
}

/** Places orders one after another, failing the test if any is refused. */
function orderAll(start: OrderBook, models: CarModel[], financing: Order['financing'] = 'cash') {
  let b = { ...start, orders: [...start.orders] }
  for (const model of models) {
    const r = placeOrder(b, model, financing, 1)
    if (!r.ok) throw new Error(r.reason)
    b = { ...b, orders: r.orders, cash: r.cash }
  }
  return b
}

describe('catalog', () => {
  it('invoices at 88% of base MSRP, to the $100', () => {
    expect(invoicePrice('truck')).toBe(45_800)
    expect(invoicePrice('hatchback-sports')).toBe(21_100)
  })

  it('takes 5% off the incentive model only, the same every time for a day', () => {
    const day = 4
    const model = dailyIncentive(day)
    expect(dailyIncentive(day)).toBe(model)
    expect(orderCost(model, day)).toBe(Math.round((invoicePrice(model) * 0.95) / 100) * 100)
    const other = (Object.keys(BASE_MSRP) as CarModel[]).find((m) => m !== model)!
    expect(orderCost(other, day)).toBe(invoicePrice(other))
    // Not the same model every day.
    const models = new Set(Array.from({ length: 20 }, (_, d) => dailyIncentive(d + 1)))
    expect(models.size).toBeGreaterThan(1)
  })

  it('scales the invoice by the level’s factor, on top of the incentive', () => {
    const day = 4
    const model = dailyIncentive(day)
    const other = (Object.keys(BASE_MSRP) as CarModel[]).find((m) => m !== model)!
    expect(orderCost(other, day, 1)).toBe(invoicePrice(other))
    expect(orderCost(other, day, 1.02)).toBe(Math.round((invoicePrice(other) * 1.02) / 100) * 100)
    expect(orderCost(model, day, 0.98)).toBe(
      Math.round((invoicePrice(model) * 0.98 * 0.95) / 100) * 100,
    )
    const r = placeOrder(book({ cash: 100_000 }), other, 'cash', day, 1.02)
    expect(r.ok && r.order.cost).toBe(orderCost(other, day, 1.02))
  })

  it('takes the closeout rebate off one model at month end, stacking with the incentive', () => {
    const models = Object.keys(BASE_MSRP) as CarModel[]
    for (let day = 26; day <= 28; day++) {
      const model = closeoutOn(day)!
      const incentive = dailyIncentive(day) === model ? 1 - INCENTIVE_DISCOUNT : 1
      const factor = incentive * (1 - CLOSEOUT_REBATE)
      expect(orderCost(model, day)).toBe(Math.round((invoicePrice(model) * factor) / 100) * 100)
      for (const other of models.filter((m) => m !== model && m !== dailyIncentive(day))) {
        expect(orderCost(other, day)).toBe(invoicePrice(other))
      }
    }
  })
})

describe('free slots', () => {
  it('has 30 slots, 3 on the showroom floor', () => {
    expect(ALL_SLOTS).toHaveLength(30)
    expect(ALL_SLOTS.filter((s) => s.location === 'showroom')).toHaveLength(3)
  })

  it('lists the empty lot spaces when the showroom is full', () => {
    const free = freeSlots(opening, [])
    const taken = new Set(opening.map((c) => c.spaceIndex))
    expect(free).toEqual(
      PARKING_SPACES.map((_, index) => index)
        .filter((i) => !taken.has(i))
        .map((index) => ({ location: 'lot', index })),
    )
  })

  it('skips reserved spaces, and orders never take one', () => {
    const [first, second] = freeSlots(opening, [])
    expect(freeSlots(opening, [], [first])[0]).toEqual(second)
    const r = placeOrder({ ...book(), reserved: [first] }, 'sedan', 'cash', 1)
    expect(r.ok && r.order.slot).toEqual(second)
  })

  it('lists a sold showroom car’s platform first', () => {
    const free = freeSlots(sellCar(opening, 'display-2'), [])
    expect(free[0]).toEqual({ location: 'showroom', index: 1 })
  })

  it('never puts an order where a car or another order is', () => {
    const b = orderAll(book({ cash: 1_000_000 }), Array(11).fill('sedan'))
    expect(placeOrder(b, 'sedan', 'cash', 1)).toEqual({
      ok: false,
      reason: 'No room: every space is taken or on order.',
    })
    const delivered = deliver(b.orders, createRng(1), 2)
    const rects = [...opening, ...delivered].map((c) => c.rect)
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [a, c] = [rects[i], rects[j]]
        const overlap =
          a.tx < c.tx + c.w && c.tx < a.tx + a.w && a.tz < c.tz + c.h && c.tz < a.tz + a.h
        expect(overlap, `${i} and ${j}`).toBe(false)
      }
    }
  })
})

describe('placing and cancelling orders', () => {
  it('takes cash for a cash order and claims the first free slot', () => {
    const day = fullPriceDay('suv')
    const r = placeOrder(book({ inventory: sellCar(opening, 'display-1') }), 'suv', 'cash', day)
    expect(r).toMatchObject({
      ok: true,
      cash: 100_000 - invoicePrice('suv'),
      order: {
        id: `order-${day}-1`,
        model: 'suv',
        cost: invoicePrice('suv'),
        financing: 'cash',
        slot: { location: 'showroom', index: 0 },
        day,
      },
    })
  })

  it('leaves cash alone for a floor plan order', () => {
    const r = placeOrder(book({ cash: 0 }), 'truck', 'floor', fullPriceDay('truck'))
    expect(r).toMatchObject({ ok: true, cash: 0, order: { financing: 'floor' } })
  })

  it('refuses a cash order the dealership can’t pay for', () => {
    expect(placeOrder(book({ cash: 20_000 }), 'van', 'cash', 1)).toEqual({
      ok: false,
      reason: 'Not enough cash.',
    })
  })

  it('refuses a floor plan order over the limit', () => {
    const inventory: InventoryCar[] = opening.map((c, i) =>
      i < 4 ? { ...c, floored: true, cost: 45_000 } : c,
    )
    // $180k owed; a $21k hatchback fits, a $45.8k truck doesn't.
    expect(placeOrder(book({ inventory }), 'hatchback-sports', 'floor', 1).ok).toBe(true)
    expect(placeOrder(book({ inventory }), 'truck', 'floor', fullPriceDay('truck'))).toEqual({
      ok: false,
      reason: 'Over the floor plan limit.',
    })
    expect(FLOOR_PLAN_LIMIT).toBe(200_000)
  })

  it('gives distinct ids, even after a cancel', () => {
    const b = orderAll(book({ cash: 1_000_000 }), ['sedan', 'sedan'])
    const after = cancelOrder(b, b.orders[0].id)
    const r = placeOrder({ ...b, ...after }, 'van', 'cash', 1)
    expect(r.ok && r.order.id).toBe('order-1-1')
    const ids = r.ok ? r.orders.map((o) => o.id) : []
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('refunds a cash order and frees a floored one’s credit when cancelled', () => {
    const b = orderAll(book(), ['sedan'])
    expect(cancelOrder(b, b.orders[0].id)).toEqual({ orders: [], cash: 100_000 })
    const f = orderAll(book(), ['sedan'], 'floor')
    expect(cancelOrder(f, f.orders[0].id)).toEqual({ orders: [], cash: 100_000 })
    expect(cancelOrder(b, 'nope')).toEqual({ orders: b.orders, cash: b.cash })
  })
})

describe('delivery', () => {
  it('parks each car in its slot, clean, costed at its invoice', () => {
    const inventory = sellCar(opening, 'display-3')
    const b = orderAll(book({ inventory }), ['truck', 'sedan'], 'floor')
    const [showroom, lot] = deliver(b.orders, createRng(5), 7)
    const space = PARKING_SPACES[b.orders[1].slot.index]
    expect(showroom).toMatchObject({
      id: 'stock-7-1',
      model: 'truck',
      location: 'showroom',
      spaceIndex: null,
      rect: DISPLAY_CARS[2].rect,
      facing: DISPLAY_CARS[2].facing,
      cost: b.orders[0].cost,
      status: 'available',
      cleanliness: 1,
      arrivedDay: 7,
      floored: true,
    })
    expect(lot).toMatchObject({
      id: 'stock-7-2',
      location: 'lot',
      spaceIndex: b.orders[1].slot.index,
      rect: parkedCarRect(space),
      facing: space.facing,
    })
  })

  it('rolls each MSRP within the model’s range', () => {
    const b = orderAll(book({ cash: 1_000_000 }), Array(8).fill('suv-luxury'))
    for (const car of deliver(b.orders, createRng(3), 2)) {
      expect(Math.abs(car.msrp / BASE_MSRP['suv-luxury'] - 1)).toBeLessThanOrEqual(MSRP_VARIATION)
      expect(car.msrp).toBeGreaterThan(car.cost)
    }
  })

  it('marks cash orders as owned outright', () => {
    const b = orderAll(book(), ['sedan'])
    expect(deliver(b.orders, createRng(1), 2)[0].floored).toBe(false)
  })
})
