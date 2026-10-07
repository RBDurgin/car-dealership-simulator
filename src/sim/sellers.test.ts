import { describe, expect, it } from 'vitest'
import { generateCustomer, reduceCustomer, type Customer } from './customers'
import { appraiseBlocker, customerActions, emptyStats, recordMissed } from './deal'
import { drivenCleanliness } from './driving'
import { buildInventory } from './inventory'
import { freeSlots } from './ordering'
import { createRng } from './rng'
import {
  assignSellers,
  boughtRecord,
  boughtSpend,
  buyBlocker,
  estimateRange,
  lotSlotFor,
  NO_CASH,
  NO_ROOM,
  purchaseOf,
  SELLER_CHANCE,
  SELLER_PATIENCE,
  sellerHope,
  stockPurchases,
  toSeller,
  vehicleOwnerId,
  vehicleTargetId,
} from './sellers'
import { GLANCE_NOISE, marketValue } from './usedCars'

const inventory = buildInventory(createRng(42))
const car = { model: 'sedan' as const, year: 2020, miles: 70_000, condition: 0.6, acquiredDay: 3 }
const driver = (id = 'd1'): Customer => ({
  ...generateCustomer(id, inventory, createRng(1)),
  vehicle: { car, spot: 2, parked: true },
})
const value = marketValue('sedan', car, 3)
const book = { cash: 50_000, inventory, orders: [], purchases: [] }

describe('sellers', () => {
  it('makes about the seller share of drivers sellers, and never walkers', () => {
    const rng = createRng(4)
    const drivers = Array.from({ length: 500 }, (_, i) => driver(`d${i}`))
    const share = assignSellers(drivers, rng, 3).filter((c) => c.selling).length / 500
    expect(share).toBeGreaterThan(SELLER_CHANCE - 0.07)
    expect(share).toBeLessThan(SELLER_CHANCE + 0.07)
    const walker = { ...driver(), vehicle: null }
    expect(assignSellers([walker], rng, 3)[0].selling).toBeNull()
  })

  it("doesn't shop, hopes for a little over the car's value, and starts with a rough estimate", () => {
    const s = toSeller(driver(), createRng(7), 3)
    expect(s).toMatchObject({ browseCarIds: [], targetCarId: null })
    expect(s.patience).toBe(Math.round(driver().patience * SELLER_PATIENCE))
    expect(s.selling!.hope).toBeGreaterThanOrEqual(value)
    expect(s.selling!.hope).toBeLessThan(value * 1.15)
    expect(s.selling!.appraised).toBe(false)
    expect(s.selling!.estimate.margin).toBe(Math.round((value * GLANCE_NOISE) / 100) * 100)
    // The level scales both.
    const hard = toSeller(driver(), createRng(7), 3, { hope: 1.05, noise: 1.2 })
    expect(hard.selling!.hope).toBeGreaterThan(s.selling!.hope)
    expect(hard.selling!.estimate.margin).toBeGreaterThan(s.selling!.estimate.margin)
  })

  it('hopes for more as a bargain hunter than as a decisive buyer', () => {
    const avg = (archetype: Customer['archetype']) =>
      Array.from({ length: 200 }, (_, i) => sellerHope(10_000, { archetype }, createRng(i))).reduce(
        (a, b) => a + b,
      ) / 200
    expect(avg('bargain')).toBeGreaterThan(avg('decisive'))
  })

  it('waits for an offer, which a greeting turns into talk, not a walk-out', () => {
    const s = toSeller(driver(), createRng(7), 3)
    expect(customerActions({ ...s, phase: 'waiting' })).toEqual(['makeOffer'])
    const talking = reduceCustomer(
      { ...s, phase: 'waiting' },
      { type: 'greet', id: s.id, carId: null, by: 'player' },
    )
    expect(talking).toMatchObject({ phase: 'talking', handlerId: 'player' })
    const offered = reduceCustomer(talking!, {
      type: 'offer',
      id: s.id,
      carId: vehicleTargetId(s.id),
      price: 8_000,
    })
    const sold = reduceCustomer(offered!, { type: 'respond', id: s.id, answer: 'accept' })
    expect(sold).toMatchObject({ phase: 'leaving', leaveReason: 'sold', vehicle: null })
  })

  it('takes an appraisal once, and not after they leave', () => {
    const s = { ...toSeller(driver(), createRng(7), 3), phase: 'waiting' as const }
    expect(appraiseBlocker(s)).toBeNull()
    const estimate = { estimate: 9_000, margin: 600 }
    const done = reduceCustomer(s, { type: 'appraised', id: s.id, estimate })!
    expect(done.selling).toMatchObject({ estimate, appraised: true })
    expect(appraiseBlocker(done)).toMatch(/already/)
    expect(appraiseBlocker({ ...s, phase: 'leaving' })).toMatch(/drove off/)
    expect(appraiseBlocker(driver())).toMatch(/isn't for sale/)
    expect(estimateRange(estimate)).toEqual({ low: 8_400, high: 9_600 })
  })

  it("aren't counted as missing a car they wanted", () => {
    const s = { ...toSeller(driver(), createRng(7), 3), preferredModels: ['van' as const] }
    expect(recordMissed(emptyStats(), [s], [])).toEqual(emptyStats())
  })

  it('names their car as an action target', () => {
    expect(vehicleOwnerId(vehicleTargetId('customer-4'))).toBe('customer-4')
    expect(vehicleOwnerId('lot-car-1')).toBeNull()
  })
})

describe('buying their car', () => {
  it('holds the first free lot space, never a showroom platform', () => {
    const showroomFree = inventory.filter((c) => c.id !== 'display-1')
    const slot = lotSlotFor({ ...book, inventory: showroomFree })
    expect(slot?.location).toBe('lot')
    const p = purchaseOf(driver(), 8_000, book, 'used-3-1')!
    expect(lotSlotFor({ ...book, purchases: [p] })).not.toEqual(p.slot)
  })

  it('needs room on the lot and the cash', () => {
    expect(buyBlocker(book, 8_000)).toBeNull()
    expect(buyBlocker({ ...book, cash: 100 }, 8_000)).toBe(NO_CASH)
    const lot = freeSlots(inventory, []).filter((s) => s.location === 'lot')
    const held = lot.map((slot, i) => ({ ...purchaseOf(driver(), 1, book, `p${i}`)!, slot }))
    expect(buyBlocker({ ...book, purchases: held }, 8_000)).toBe(NO_ROOM)
  })

  it('goes into stock in its space, used, dirty and costing what we paid', () => {
    const p = purchaseOf(driver(), 8_000, book, 'used-3-1')!
    expect(p).toMatchObject({ customerId: 'd1', spot: 2, price: 8_000 })
    expect(p.cleanliness).toBe(drivenCleanliness('d1', car.condition))
    const [stock] = stockPurchases([p], 3)
    expect(stock).toMatchObject({
      id: 'used-3-1',
      model: 'sedan',
      location: 'lot',
      spaceIndex: p.slot.index,
      cost: 8_000,
      floored: false,
      cleanliness: p.cleanliness,
      used: { year: 2020, miles: 70_000, condition: 0.6, acquiredDay: 3 },
    })
    expect(stock.cleanliness).toBeLessThan(1)
    const record = boughtRecord(p, 3)
    expect(record).toEqual({
      model: 'sedan',
      year: 2020,
      sellerName: p.sellerName,
      price: 8_000,
      value,
    })
    expect(boughtSpend([record, record])).toBe(16_000)
  })
})
