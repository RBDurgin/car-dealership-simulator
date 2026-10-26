import { beforeEach, describe, expect, it } from 'vitest'
import { runList } from '../sim/auction'
import { AUCTION_END, AUCTION_START } from '../sim/bidding'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { netIncome } from '../sim/deal'
import { availableCars } from '../sim/inventory'
import { freeSlots } from '../sim/ordering'
import { createRng } from '../sim/rng'
import { generateCandidates } from '../sim/staff'
import { usedStockCar } from '../sim/usedCars'
import { RUN_FEE, sellerFee } from '../sim/wholesale'
import { auctionLotsFor } from './selectors'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Day 2 is the Tuesday before the first auction, on day 3. */
const TUESDAY = 2
const WEDNESDAY = 3
const LISTED = runList(WEDNESDAY, { rank: 'main-street', tier: 'bronze' }).length

/** A new game on `day` at `rank`, with cash and a used car (`used-1`) on the lot, taken in on `acquired`. */
function openOn(day: number, rank: 'corner-lot' | 'main-street' = 'main-street', acquired = 1) {
  useGame.setState(initial, true)
  game().newGame()
  const slot = freeSlots(game().inventory, []).find((s) => s.location === 'lot')!
  const car = usedStockCar(
    'used-1',
    { model: 'sedan', year: 2020, miles: 60_000, condition: 0.6, acquiredDay: acquired },
    slot,
    12_000,
    acquired,
    1,
  )
  useGame.setState({
    clock: { day, minute: OPEN_MINUTE + 60 },
    cash: 100_000,
    career: { ...game().career, rank },
    customers: [],
    inventory: [...game().inventory, car],
  })
}

/** Closes the day, settling it. */
function settle() {
  useGame.setState({
    clock: { ...game().clock, minute: CLOSE_MINUTE - 1 },
    arrivals: { minutes: [], sources: [], spawned: 0 },
    customers: [],
  })
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
  expect(game().dayStats.settled).toBe(true)
}

/** Settles today and opens the next morning. */
function nextDay() {
  settle()
  game().startNextDay()
}

/** Runs today's auction to the end, the clock's steps 10 minutes apart. */
function runAuction() {
  const tick = (minute: number) => {
    useGame.setState({ arrivals: { minutes: [], sources: [], spawned: 0 } })
    game().tickClock({ day: game().clock.day, minute })
  }
  for (let m = AUCTION_START; m <= AUCTION_END && !game().auction?.over; m += 10) tick(m)
  expect(game().auction!.over).toBe(true)
}

const car = () => game().inventory.find((c) => c.id === 'used-1')

describe('consigning in the store', () => {
  beforeEach(() => openOn(TUESDAY))

  it('marks a used car for the next auction, and it stays for sale until then', () => {
    expect(game().consign('used-1')).toBe(true)
    expect(game().consigned).toEqual([{ carId: 'used-1', floor: 0 }])
    expect(game().notice?.text).toMatch(/goes to the next auction/)
    expect(availableCars(game().inventory).some((c) => c.id === 'used-1')).toBe(true)
    game().setFloor('used-1', 9_000)
    expect(game().consigned[0].floor).toBe(9_000)
    game().unconsign('used-1')
    expect(game().consigned).toEqual([])
  })

  it('refuses before Main Street, and a new car', () => {
    openOn(TUESDAY, 'corner-lot')
    expect(game().consign('used-1')).toBe(false)
    expect(game().notice?.text).toMatch(/isn’t open/)
    openOn(TUESDAY)
    expect(game().consign(game().inventory[0].id)).toBe(false)
    expect(game().notice?.text).toMatch(/Only used cars/)
  })

  it('a sale off the lot cancels it', () => {
    game().consign('used-1')
    game().sellCar('used-1', 15_000)
    expect(game().consigned).toEqual([])
  })

  it('a used car bought today can go straight to the auction', () => {
    game().devUsedCar()
    const [bought] = game().inventory.filter((c) => c.used && c.id !== 'used-1')
    // Bought today, the car is a purchase until the day is settled.
    useGame.setState({
      inventory: game().inventory.filter((c) => c !== bought),
      purchases: [
        {
          id: bought.id,
          customerId: 'c-1',
          sellerName: 'Ann',
          car: { ...bought.used!, model: bought.model },
          spot: 0,
          slot: { location: 'lot', index: bought.spaceIndex! },
          price: 9_000,
          cleanliness: 1,
        },
      ],
    })
    expect(game().consign(bought.id)).toBe(true)
    nextDay()
    // Stocked overnight, still going, and on auction morning it leaves the lot.
    expect(game().inventory.find((c) => c.id === bought.id)?.status).toBe('auction')
    expect(game().wholesaleLots.map((l) => l.consigned?.carId)).toEqual([bought.id])
  })
})

describe('wholesale at the auction', () => {
  beforeEach(() => openOn(TUESDAY))

  it('leaves the lot on auction morning and runs after the list, badged as ours', () => {
    game().consign('used-1')
    nextDay()
    expect(game().clock.day).toBe(WEDNESDAY)
    expect(car()?.status).toBe('auction')
    expect(game().consigned).toEqual([])
    const lots = auctionLotsFor(game())
    expect(lots).toHaveLength(LISTED + 1)
    expect(lots[LISTED]).toMatchObject({ order: LISTED + 1, consigned: { carId: 'used-1' } })
    expect(game().notice?.text).toMatch(/consigned car runs at today's auction/)
  })

  it('sells to a dealer for the price less the seller fee, counted in the gross', () => {
    game().consign('used-1')
    nextDay()
    // The player can't bid on their own car.
    runAuction()
    const lot = auctionLotsFor(game())[LISTED]
    const result = game().auction!.results.find((r) => r.lotId === lot.id)!
    expect(result.buyer).toBeTruthy()
    expect(car()?.status).toBe('sold')
    const [sale] = game().dayStats.wholesale.sold
    expect(sale).toMatchObject({ price: result.price, fee: sellerFee(result.price), cost: 12_000 })
    expect(game().cash).toBe(100_000 + result.price - sale.fee)
    expect(netIncome(game().dayStats)).toBe(result.price - sale.fee - 12_000)
    settle()
    game().startNextDay()
    expect(car()).toBeUndefined()
  })

  it('won’t let the player bid on it', () => {
    game().consign('used-1')
    nextDay()
    const tick = (minute: number) => {
      useGame.setState({ arrivals: { minutes: [], sources: [], spawned: 0 } })
      game().tickClock({ day: game().clock.day, minute })
    }
    tick(AUCTION_START)
    // Passing each listed lot, then a beat to put the next one up.
    for (let i = 0; i < 50 && game().auction!.lotIndex < LISTED; i++) {
      if (game().auction!.call === 'sold') game().tickAuction(game().auction!.minute + 0.5)
      else game().auctionPass()
    }
    expect(game().auction!.lotIndex).toBe(LISTED)
    expect(game().auctionBid()).toBe(false)
    expect(game().notice?.text).toBe('That’s your own car.')
  })

  it('under its floor it comes back the next morning, less the run fee', () => {
    game().consign('used-1')
    game().setFloor('used-1', 1_000_000)
    nextDay()
    runAuction()
    expect(car()?.status).toBe('auction')
    const cash = game().cash
    settle()
    expect(car()?.status).toBe('available')
    expect(game().dayStats.wholesale.returned).toEqual([
      expect.objectContaining({ floor: 1_000_000, fee: RUN_FEE }),
    ])
    expect(game().dayStats.wholesale.sold).toEqual([])
    // The run fee, and the day's wages, come out at settle.
    expect(game().cash).toBeLessThanOrEqual(cash - RUN_FEE)
    game().startNextDay()
    expect(availableCars(game().inventory).some((c) => c.id === 'used-1')).toBe(true)
  })
})

describe('auto-wholesale', () => {
  /** Hires a used-car manager from today's applicants. */
  function hireManager() {
    const day = game().clock.day
    const candidates = generateCandidates(createRng(day), day, [], undefined, true)
    useGame.setState({ candidates })
    game().hire(candidates.find((x) => x.role === 'buyer')!.id)
  }

  it('the manager sends long-held used cars the morning before an auction', () => {
    // Day 29 is a Monday: Tuesday the 30th is the morning before the auction,
    // and the car has been in stock 29 days.
    openOn(29, 'main-street', 1)
    hireManager()
    game().setAutoWholesale(true)
    nextDay()
    expect(game().consigned).toEqual([{ carId: 'used-1', floor: 0 }])
    expect(game().notice?.text).toMatch(/sending a used car to tomorrow's auction/)
  })

  it('does nothing when off, or without a manager', () => {
    openOn(29, 'main-street', 1)
    hireManager()
    nextDay()
    expect(game().consigned).toEqual([])
    openOn(29, 'main-street', 1)
    game().setAutoWholesale(true)
    nextDay()
    expect(game().consigned).toEqual([])
  })
})
