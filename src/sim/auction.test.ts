import { describe, expect, it } from 'vitest'
import {
  AUCTION_WEEKDAY,
  auctionCost,
  auctionDayOf,
  auctionOpen,
  auctionRecord,
  bidBlocker,
  buyerFee,
  isAuctionDay,
  lotEstimate,
  nextAuction,
  RUN_SIZE,
  runList,
  stockWins,
  wholesaleValue,
  WHOLESALE_FACTOR,
  winLot,
} from './auction'
import { calendarOf } from './calendar'
import { emptyCareer } from './progression'
import { buildInventory } from './inventory'
import { freeSlots } from './ordering'
import { createRng } from './rng'
import { NO_CASH, NO_ROOM, reservedSlots, type BuyBook } from './sellers'
import { gradeOf, marketValue } from './usedCars'

const OPEN = { rank: 'main-street', tier: 'bronze' } as const

describe('the auction calendar', () => {
  it('is on Wednesdays', () => {
    expect(AUCTION_WEEKDAY).toBe(2)
    expect(isAuctionDay(3)).toBe(true)
    expect(isAuctionDay(10)).toBe(true)
    for (const day of [1, 2, 4, 5, 6, 7, 8]) expect(isAuctionDay(day)).toBe(false)
    expect(calendarOf(auctionDayOf(13)).weekday).toBe(AUCTION_WEEKDAY)
  })

  it('looks ahead to this week’s auction until it’s held, then next week’s', () => {
    expect(nextAuction(1)).toBe(3)
    expect(nextAuction(3)).toBe(3)
    expect(nextAuction(4)).toBe(10)
    expect(nextAuction(7)).toBe(10)
  })

  it('opens at Main Street', () => {
    expect(auctionOpen(emptyCareer())).toBe(false)
    expect(auctionOpen({ rank: 'main-street' })).toBe(true)
    expect(auctionOpen({ rank: 'dealer-of-the-year' })).toBe(true)
  })
})

describe('runList', () => {
  it('is the same all week and differs from week to week', () => {
    const monday = runList(8, OPEN)
    expect(runList(10, OPEN)).toEqual(monday)
    expect(runList(14, OPEN)).toEqual(monday)
    expect(runList(15, OPEN)).not.toEqual(monday)
  })

  it('numbers its lots for the auction day, graded by their condition', () => {
    const lots = runList(8, OPEN)
    expect(lots).toHaveLength(RUN_SIZE['main-street'])
    lots.forEach((lot, i) => {
      expect(lot.id).toBe(`lot-10-${i + 1}`)
      expect(lot.order).toBe(i + 1)
      expect(lot.grade).toBe(gradeOf(lot.car.condition))
      expect(lot.car.acquiredDay).toBe(10)
    })
  })

  it('grows with the rank, keeping the lots it had', () => {
    const small = runList(8, OPEN)
    const big = runList(8, { ...OPEN, rank: 'dealer-of-the-year' })
    expect(big).toHaveLength(10)
    expect(big.slice(0, small.length)).toEqual(small)
  })

  it('brings luxury models only at Gold', () => {
    const models = (tier: 'bronze' | 'gold') =>
      Array.from({ length: 40 }, (_, w) => runList(1 + w * 7, { rank: 'dealer-of-the-year', tier }))
        .flat()
        .map((l) => l.car.model)
    expect(models('bronze')).not.toContain('suv-luxury')
    expect(models('bronze')).not.toContain('sedan-sports')
    expect(models('gold')).toContain('suv-luxury')
  })
})

describe('prices', () => {
  const car = {
    model: 'sedan',
    year: 2021,
    miles: 60_000,
    condition: 0.6,
    acquiredDay: 10,
  } as const

  it('the trade pays a share of market value', () => {
    const value = marketValue(car.model, car, 10)
    expect(wholesaleValue(car.model, car, 10)).toBe(
      Math.round((value * WHOLESALE_FACTOR) / 100) * 100,
    )
  })

  it('estimates a range around the wholesale value', () => {
    const lot = { id: 'lot-10-1', car, grade: gradeOf(car.condition), order: 1 }
    const value = wholesaleValue(car.model, car, 10)
    const { low, high } = lotEstimate(lot, 10)
    expect(low).toBeLessThan(value)
    expect(high).toBeGreaterThan(value)
  })

  it('charges a flat buyer fee plus a share of the price', () => {
    expect(buyerFee(10_000)).toBe(500)
    expect(auctionCost(10_000)).toBe(10_500)
  })
})

describe('buying a lot', () => {
  const inventory = buildInventory(createRng(1))
  const book = (extra: Partial<BuyBook> = {}): BuyBook => ({
    cash: 50_000,
    inventory,
    orders: [],
    purchases: [],
    auctionWins: [],
    expansions: [],
    clock: { day: 10 },
    ...extra,
  })
  const lot = runList(10, OPEN)[0]

  it('needs the price and the fee in cash', () => {
    expect(bidBlocker(book({ cash: 10_499 }), 10_000)).toBe(NO_CASH)
    expect(bidBlocker(book({ cash: 10_500 }), 10_000)).toBeNull()
  })

  it('holds a lot space, so nothing else can take it', () => {
    const win = winLot(lot, 8_000, book(), 'used-10-1')!
    expect(win.slot.location).toBe('lot')
    expect(win.fee).toBe(buyerFee(8_000))
    const free = freeSlots(inventory, [], reservedSlots([], [win]))
    expect(free).not.toContainEqual(win.slot)
    expect(winLot(lot, 8_000, book({ auctionWins: [win] }), 'used-10-2')!.slot).not.toEqual(
      win.slot,
    )
  })

  it('is refused with no lot space left', () => {
    const lotSlots = freeSlots(inventory, []).filter((s) => s.location === 'lot')
    const wins = lotSlots.map((slot, i) => ({
      id: `used-10-${i + 1}`,
      lotId: lot.id,
      car: lot.car,
      slot,
      price: 1,
      fee: 1,
    }))
    expect(bidBlocker(book({ auctionWins: wins }), 1_000)).toBe(NO_ROOM)
  })

  it('goes into stock costing the price and the fee', () => {
    const win = winLot(lot, 8_000, book(), 'used-10-1')!
    const [car] = stockWins([win], 10)
    expect(car).toMatchObject({
      id: 'used-10-1',
      model: lot.car.model,
      location: 'lot',
      spaceIndex: win.slot.index,
      cost: 8_000 + win.fee,
      floored: false,
      status: 'available',
    })
    expect(car.used).toMatchObject({ year: lot.car.year, acquiredDay: 10 })
    expect(auctionRecord(win, 10)).toEqual({
      model: lot.car.model,
      year: lot.car.year,
      price: 8_000,
      fee: win.fee,
      value: marketValue(lot.car.model, lot.car, 10),
    })
  })
})
