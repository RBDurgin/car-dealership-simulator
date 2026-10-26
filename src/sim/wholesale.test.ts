import { describe, expect, it } from 'vitest'
import { runList } from './auction'
import { BEAT_MINUTES, resultLine, startAuction, stepAuction, type RunContext } from './bidding'
import { formatMoney } from './format'
import { buildInventory, type InventoryCar } from './inventory'
import { createRng } from './rng'
import { STALE_DAYS, type UsedInfo } from './usedCars'
import {
  AUTO_WHOLESALE_DAYS,
  autoConsign,
  consign,
  consignBlocker,
  consignedLots,
  liveConsigned,
  MAX_CONSIGNED,
  returnRecord,
  RUN_FEE,
  sellerFee,
  unconsign,
  unsoldLine,
  wholesaleGross,
  wholesaleRecord,
  wholesaleSuggestions,
  withFloor,
  type ConsignBook,
} from './wholesale'

const DAY = 3

/** The opening stock with its first `n` lot cars made used, taken in on `acquired` days. */
function stock(acquired: number[]): InventoryCar[] {
  const lot = buildInventory(createRng(1)).filter((c) => c.location === 'lot')
  return lot.map((c, i) => {
    if (i >= acquired.length) return c
    const used: UsedInfo = { year: 2020, miles: 60_000, condition: 0.6, acquiredDay: acquired[i] }
    return { ...c, id: `used-${i + 1}`, used, cost: 12_000 }
  })
}

const book = (over: Partial<ConsignBook> = {}): ConsignBook => ({
  inventory: stock([1, 1]),
  purchases: [],
  consigned: [],
  open: true,
  ...over,
})

describe('consigning', () => {
  it('takes a used car of ours, or one bought today, once the auction is open', () => {
    expect(consignBlocker(book(), 'used-1')).toBeNull()
    expect(consignBlocker(book({ purchases: [{ id: 'used-3-1' }] }), 'used-3-1')).toBeNull()
    expect(consignBlocker(book({ open: false }), 'used-1')).toMatch(/isn’t open/)
    expect(consignBlocker(book(), 'nope')).toMatch(/isn’t in stock/)
    const newCar = book().inventory.find((c) => !c.used)!
    expect(consignBlocker(book(), newCar.id)).toMatch(/Only used cars/)
  })

  it('refuses a car already going, sold or away, and a full run', () => {
    const consigned = consign([], 'used-1')
    expect(consignBlocker(book({ consigned }), 'used-1')).toMatch(/already going/)
    const inventory = book().inventory.map((c) =>
      c.id === 'used-1' ? { ...c, status: 'sold' as const } : c,
    )
    expect(consignBlocker(book({ inventory }), 'used-1')).toMatch(/sold/)
    const full = Array.from({ length: MAX_CONSIGNED }, (_, i) => ({ carId: `x-${i}`, floor: 0 }))
    expect(consignBlocker(book({ consigned: full }), 'used-1')).toMatch(/up to 4/)
  })

  it('sets a floor, takes a car off, and drops one sold meanwhile', () => {
    let consigned = consign([], 'used-1', 9_040)
    expect(consigned).toEqual([{ carId: 'used-1', floor: 9_040 }])
    consigned = withFloor(consigned, 'used-1', -5)
    expect(consigned[0].floor).toBe(0)
    expect(unconsign(consigned, 'used-1')).toEqual([])
    expect(unconsign(consigned, 'used-2')).toBe(consigned)
    const inventory = stock([1, 1]).map((c) =>
      c.id === 'used-1' ? { ...c, status: 'sold' as const } : c,
    )
    const both = consign(consign([], 'used-1'), 'used-2')
    expect(liveConsigned(both, inventory)).toEqual([{ carId: 'used-2', floor: 0 }])
    expect(liveConsigned(both, stock([1, 1]))).toBe(both)
  })
})

describe('the auction morning', () => {
  it('runs consigned cars for sale after the list, and keeps the rest for next week', () => {
    const inventory = stock([1, 1]).map((c) =>
      c.id === 'used-2' ? { ...c, status: 'recon' as const } : c,
    )
    const consigned = [
      { carId: 'used-1', floor: 8_000 },
      { carId: 'used-2', floor: 0 },
    ]
    const { lots, rest } = consignedLots(consigned, inventory, 6, DAY)
    expect(lots).toHaveLength(1)
    expect(lots[0]).toMatchObject({
      id: `lot-${DAY}-yours-1`,
      order: 7,
      reading: 0.6,
      grade: 'Fair',
      consigned: consigned[0],
    })
    expect(rest).toEqual([consigned[1]])
  })

  it('auto-wholesales at twice the stale age', () => {
    expect(AUTO_WHOLESALE_DAYS).toBe(STALE_DAYS * 2)
  })

  it('suggests stale used cars, and auto-wholesale sends long-held ones while there is room', () => {
    const day = 40
    const inventory = stock([day - STALE_DAYS, day - AUTO_WHOLESALE_DAYS - 5, day - 2])
    expect(wholesaleSuggestions(inventory, [], day).map((c) => c.id)).toEqual(['used-2', 'used-1'])
    const auto = autoConsign([], inventory, day)
    expect(auto).toEqual([{ carId: 'used-2', floor: 0 }])
    expect(autoConsign(auto, inventory, day)).toBe(auto)
    const full = Array.from({ length: MAX_CONSIGNED }, (_, i) => ({ carId: `x-${i}`, floor: 0 }))
    expect(autoConsign(full, inventory, day)).toBe(full)
  })
})

describe('selling at the auction', () => {
  const lots = runList(DAY, { rank: 'main-street', tier: 'bronze' })
  const { lots: ours } = consignedLots(
    [{ carId: 'used-1', floor: 0 }],
    stock([1]),
    lots.length,
    DAY,
  )
  const run = (floor: number, seed: number) => {
    const yours = { ...ours[0], consigned: { carId: 'used-1', floor } }
    const ctx: RunContext = {
      lots: [...lots, yours],
      taken: lots.map((l) => l.id),
      day: DAY,
      rng: createRng(seed),
    }
    let s = startAuction(600, ctx)
    for (let i = 0; i < 2_000 && s.results.length === 0; i++) {
      s = stepAuction(s, s.minute + BEAT_MINUTES, ctx)
    }
    return s.results[0]
  }

  it('sells to a dealer with no floor, and not under its floor', () => {
    const sold = run(0, 1)
    expect(sold.buyer).toBeTruthy()
    expect(sold.short).toBeUndefined()
    const short = run(1_000_000, 1)
    expect(short).toMatchObject({ buyer: null, short: true, price: sold.price })
    expect(resultLine(short, formatMoney)).toMatch(/Under your floor/)
    expect(unsoldLine(ours[0], short, 'Sedan', formatMoney)).toMatch(/under your .* floor/)
  })

  it('records the sale less the seller fee, and run fees off the gross', () => {
    const car = stock([1])[0]
    const sale = wholesaleRecord(car, 10_000, 'Lakeside Auto')
    expect(sale).toMatchObject({ price: 10_000, fee: sellerFee(10_000), cost: 12_000 })
    expect(sellerFee(10_000)).toBe(250)
    const back = returnRecord(ours[0], { lotId: ours[0].id, price: 0, buyer: null })
    expect(back.fee).toBe(RUN_FEE)
    expect(returnRecord(ours[0], undefined).fee).toBe(0)
    expect(wholesaleGross({ sold: [sale], returned: [back] })).toBe(10_000 - 250 - 12_000 - RUN_FEE)
  })
})
