import { describe, expect, it } from 'vitest'
import {
  AUCTION_WEEKDAY,
  auctionCost,
  auctionDayOf,
  auctionOpen,
  auctionRecord,
  bidBlocker,
  buyerFee,
  INSPECT_FEE,
  inspectBlocker,
  inspectLot,
  isAuctionDay,
  liveBids,
  lotEstimate,
  lotHasRun,
  maxBidBlocker,
  maxBidFor,
  nextAuction,
  readCondition,
  RUN_SIZE,
  runList,
  SHEET_NOISE,
  stockWins,
  surpriseNotice,
  surprisesOf,
  wholesaleValue,
  WHOLESALE_FACTOR,
  winLot,
  withMaxBid,
} from './auction'
import { calendarOf } from './calendar'
import { emptyCareer } from './progression'
import { buildInventory } from './inventory'
import { freeSlots } from './ordering'
import { createRng } from './rng'
import { NO_CASH, NO_ROOM, reservedSlots, type BuyBook } from './sellers'
import { carName } from './interactables'
import { GRADES, gradeOf, marketValue, PLAYER_SKILL, type Grade } from './usedCars'

const OPEN = { rank: 'main-street', tier: 'bronze' } as const
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

  it('numbers its lots for the auction day, graded by the sheet’s reading', () => {
    const lots = runList(8, OPEN)
    expect(lots).toHaveLength(RUN_SIZE['main-street'])
    lots.forEach((lot, i) => {
      expect(lot.id).toBe(`lot-10-${i + 1}`)
      expect(lot.order).toBe(i + 1)
      expect(lot.grade).toBe(gradeOf(lot.reading))
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
    const lot = {
      id: 'lot-10-1',
      car,
      reading: car.condition,
      grade: gradeOf(car.condition),
      order: 1,
    }
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
      graded: lot.grade,
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
      graded: lot.grade,
    })
  })
})

describe('grades and inspection', () => {
  // Many weeks of lots, for the odds.
  const lots = Array.from({ length: 200 }, (_, w) => runList(1 + w * 7, OPEN)).flat()
  const steps = (better: Grade, worse: Grade) => GRADES.indexOf(worse) - GRADES.indexOf(better)

  it('reads the sheet up to SHEET_NOISE over the truth, never under', () => {
    for (const lot of lots) {
      expect(lot.reading).toBeGreaterThanOrEqual(lot.car.condition)
      expect(lot.reading).toBeLessThanOrEqual(Math.min(1, lot.car.condition + SHEET_NOISE) + 1e-9)
      expect(steps(lot.grade, gradeOf(lot.car.condition))).toBeLessThanOrEqual(1)
    }
  })

  it('grades about one lot in five a step better than it is', () => {
    const off = lots.filter((l) => l.grade !== gradeOf(l.car.condition)).length / lots.length
    expect(off).toBeGreaterThan(0.1)
    expect(off).toBeLessThan(0.25)
  })

  it('keeps the cars as they were before the sheet could be off', () => {
    // The sheet rolls on its own seed: the cars are 22a's.
    expect(runList(8, OPEN).map((l) => l.car.condition)).toEqual(
      runList(10, OPEN).map((l) => l.car.condition),
    )
  })

  it('narrows the reading on inspection, to about one in fifteen off', () => {
    const inspections = lots.map((l) => inspectLot(l, PLAYER_SKILL))
    lots.forEach((lot, i) => {
      const { reading } = inspections[i]
      expect(reading).toBeGreaterThanOrEqual(lot.car.condition)
      expect(reading).toBeLessThanOrEqual(lot.reading)
      expect(inspections[i].auctionDay).toBe(lot.car.acquiredDay)
    })
    const off =
      inspections.filter((x, i) => x.grade !== gradeOf(lots[i].car.condition)).length / lots.length
    expect(off).toBeLessThan(0.1)
    // The same lot reads the same twice.
    expect(inspectLot(lots[0], PLAYER_SKILL)).toEqual(inspections[0])
  })

  it('tightens the estimate once inspected', () => {
    const lot = lots[0]
    const loose = lotEstimate(lot, 10)
    const tight = lotEstimate(lot, 10, inspectLot(lot, PLAYER_SKILL))
    expect(tight.high - tight.low).toBeLessThan(loose.high - loose.low)
    expect(readCondition(0.95, SHEET_NOISE, 1)).toBe(1)
  })

  it('can be inspected until the lot runs, once, with the cash', () => {
    const lot = runList(8, OPEN)[2]
    const done = [inspectLot(lot, PLAYER_SKILL)]
    expect(inspectBlocker(lot, 8, null, [], 1_000)).toBeNull()
    expect(inspectBlocker(lot, 10, { lotIndex: 1, over: false }, [], 1_000)).toBeNull()
    expect(inspectBlocker(lot, 10, { lotIndex: 2, over: false }, [], 1_000)).toMatch(/Too late/)
    expect(inspectBlocker(lot, 10, { lotIndex: 9, over: true }, [], 1_000)).toMatch(/Too late/)
    expect(inspectBlocker(lot, 11, null, [], 1_000)).toMatch(/Too late/)
    expect(inspectBlocker(lot, 8, null, done, 1_000)).toBe('Already inspected.')
    expect(inspectBlocker(lot, 8, null, [], INSPECT_FEE - 1)).toBe(NO_CASH)
  })

  it('names a car that came in worse than it was bought on', () => {
    const lot = { ...runList(8, OPEN)[0], reading: 0.8, grade: 'Good' as const }
    const rough = { ...lot, car: { ...lot.car, condition: 0.55 } }
    const won = winLot(rough, 5_000, book(), 'used-10-1')!
    expect(won.graded).toBe('Good')
    // Bought on the inspection's grade, it's no surprise.
    const read = { lotId: lot.id, auctionDay: 10, reading: 0.55, grade: 'Fair' as const }
    const fair = winLot(rough, 5_000, book(), 'used-10-2', read)!
    expect(surprisesOf([won, fair])).toEqual([
      { model: lot.car.model, year: lot.car.year, graded: 'Good', arrived: 'Fair' },
    ])
    expect(surpriseNotice(surprisesOf([won]))).toBe(
      `The ${carName(lot.car.model)} you bought graded Good, arrived Fair.`,
    )
    expect(surpriseNotice([])).toBeNull()
  })
})

describe('max bids', () => {
  const [first, second] = runList(3, OPEN)

  it('sets, changes and clears a lot’s max bid', () => {
    const bids = withMaxBid([], first, 6_000)
    expect(bids).toEqual([{ lotId: first.id, auctionDay: 3, max: 6_000 }])
    expect(maxBidFor(bids, first.id)).toBe(6_000)
    expect(maxBidFor(bids, second.id)).toBe(0)
    const both = withMaxBid(withMaxBid(bids, first, 6_500), second, 4_000)
    expect(both.map((b) => [b.lotId, b.max])).toEqual([
      [first.id, 6_500],
      [second.id, 4_000],
    ])
    expect(withMaxBid(both, first, 0)).toEqual([both[1]])
  })

  it('keeps bids until their auction has run', () => {
    const bids = withMaxBid([], first, 6_000)
    expect(liveBids(bids, 3)).toBe(bids)
    expect(liveBids(bids, 4)).toEqual([])
  })

  it('needs a manager, and a lot that hasn’t run', () => {
    expect(maxBidBlocker(first, 1, null, false)).toMatch(/used-car manager/)
    expect(maxBidBlocker(first, 1, null, true)).toBeNull()
    expect(maxBidBlocker(second, 3, { lotIndex: 0, over: false }, true)).toBeNull()
    // On the block, or past.
    expect(lotHasRun(first, 3, { lotIndex: 0, over: false })).toBe(true)
    expect(maxBidBlocker(first, 3, { lotIndex: 0, over: false }, true)).toMatch(/Too late/)
    expect(maxBidBlocker(second, 4, null, true)).toMatch(/Too late/)
  })
})

describe('a senior’s closer inspection', () => {
  it('reads no further over the truth than a plain one', () => {
    for (const lot of runList(3, OPEN)) {
      const plain = inspectLot(lot, 5)
      const close = inspectLot(lot, 5, 0.5)
      expect(close.reading).toBeGreaterThanOrEqual(lot.car.condition)
      expect(close.reading - lot.car.condition).toBeLessThanOrEqual(
        plain.reading - lot.car.condition + 1e-9,
      )
    }
  })
})
