import { beforeEach, describe, expect, it } from 'vitest'
import { INSPECT_FEE, lotValue, maxBidFor, runList, type Lot } from '../sim/auction'
import { AUCTION_END, AUCTION_START, BEAT_MINUTES, nextBid } from '../sim/bidding'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { PLAYER_ID } from '../sim/customers'
import { freeSlots } from '../sim/ordering'
import { netIncome } from '../sim/deal'
import { NO_CASH, NO_ROOM } from '../sim/sellers'
import { createRng } from '../sim/rng'
import { generateCandidates } from '../sim/staff'
import { gradeOf } from '../sim/usedCars'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Day 3 is the first Wednesday. */
const WEDNESDAY = 3

/** A new game on `day` at Main Street, with cash to spend. */
function openOn(
  day: number,
  rank: 'corner-lot' | 'main-street' = 'main-street',
  minute = OPEN_MINUTE + 60,
) {
  useGame.setState(initial, true)
  game().newGame()
  useGame.setState({
    clock: { day, minute },
    cash: 100_000,
    career: { ...game().career, rank },
    customers: [],
  })
}

const firstLot = () => runList(WEDNESDAY, { rank: 'main-street', tier: 'bronze' })[0]

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

describe('the auction in the store', () => {
  beforeEach(() => openOn(WEDNESDAY))

  it('buys a lot for its price plus the fee, holding a lot space', () => {
    const lots = freeSlots(game().inventory, []).filter((s) => s.location === 'lot').length
    expect(game().buyLot(firstLot().id, 8_000)).toBe(true)
    const [win] = game().auctionWins
    expect(game().cash).toBe(100_000 - 8_000 - win.fee)
    expect(game().dayStats.auction.bought).toHaveLength(1)
    // Off net income, like any used car bought.
    expect(game().dayStats.wages).toBe(0)
    const free = freeSlots(game().inventory, [], [win.slot]).filter((s) => s.location === 'lot')
    expect(free).toHaveLength(lots - 1)
  })

  it('won’t buy the same lot twice', () => {
    game().buyLot(firstLot().id, 8_000)
    expect(game().buyLot(firstLot().id, 8_000)).toBe(false)
    expect(game().notice?.text).toBe('Already bought.')
  })

  it('stocks the win when the day is settled, and it’s there the next morning', () => {
    game().buyLot(firstLot().id, 8_000)
    const win = game().auctionWins[0]
    settle()
    expect(game().auctionWins).toEqual([])
    const car = game().inventory.find((c) => c.id === win.id)!
    expect(car).toMatchObject({
      model: firstLot().car.model,
      cost: 8_000 + win.fee,
      spaceIndex: win.slot.index,
      location: 'lot',
    })
    game().startNextDay()
    expect(game().clock.day).toBe(WEDNESDAY + 1)
    expect(game().inventory.some((c) => c.id === win.id)).toBe(true)
    expect(game().auctionWins).toEqual([])
  })

  it('is refused once the last lot space is held', () => {
    // Fill every lot space but one with used cars.
    const free = () => freeSlots(game().inventory, []).filter((s) => s.location === 'lot').length
    while (free() > 1) game().devUsedCar()
    const runs = runList(WEDNESDAY, { rank: 'main-street', tier: 'bronze' })
    expect(game().buyLot(runs[0].id, 1_000)).toBe(true)
    expect(game().buyLot(runs[1].id, 1_000)).toBe(false)
    expect(game().notice?.text).toBe(NO_ROOM)
    // Nor can a used car bought any other way take it.
    game().devUsedCar()
    expect(free()).toBe(1)
  })

  it('only on auction day', () => {
    openOn(WEDNESDAY + 1)
    expect(game().buyLot(firstLot().id, 8_000)).toBe(false)
    expect(game().auctionWins).toEqual([])
  })

  it('only from Main Street', () => {
    openOn(WEDNESDAY, 'corner-lot')
    expect(game().buyLot(firstLot().id, 8_000)).toBe(false)
    expect(game().notice?.text).toBe('The auction opens at Main Street.')
  })

  it('the dev key buys the next lot at its wholesale value', () => {
    game().devAuctionBuy()
    game().devAuctionBuy()
    const lots = runList(WEDNESDAY, { rank: 'main-street', tier: 'bronze' })
    expect(game().auctionWins.map((w) => w.lotId)).toEqual([lots[0].id, lots[1].id])
    expect(game().auctionWins[0].price).toBe(lotValue(lots[0], WEDNESDAY))
  })
})

describe('the live auction in the store', () => {
  beforeEach(() => openOn(WEDNESDAY, 'main-street', OPEN_MINUTE))

  /** The clock's step at `minute`, with nobody arriving. */
  const tickTo = (minute: number) => {
    useGame.setState({ arrivals: { minutes: [], sources: [], spawned: 0 } })
    game().tickClock({ day: game().clock.day, minute })
  }
  /** Beats of the run between the clock's steps, as the scene's clock calls them. */
  const beats = (n: number) => {
    for (let i = 0; i < n; i++) game().tickAuction(game().auction!.minute + BEAT_MINUTES)
  }

  it('starts at its hour on auction day, with a notice', () => {
    tickTo(AUCTION_START - 10)
    expect(game().auction).toBeNull()
    tickTo(AUCTION_START)
    expect(game().auction).toMatchObject({ lotIndex: 0, call: 'open', over: false })
    expect(game().notice?.text).toMatch(/auction is starting/)
    beats(3)
    expect(game().auction!.minute).toBe(AUCTION_START + 3 * BEAT_MINUTES)
  })

  it('doesn’t run on other days, or before Main Street', () => {
    openOn(WEDNESDAY + 1, 'main-street', OPEN_MINUTE)
    tickTo(AUCTION_START)
    expect(game().auction).toBeNull()
    openOn(WEDNESDAY, 'corner-lot', OPEN_MINUTE)
    tickTo(AUCTION_START)
    expect(game().auction).toBeNull()
  })

  it('a lot the player wins is bought when it’s hammered', () => {
    tickTo(AUCTION_START)
    const lot = runList(WEDNESDAY, { rank: 'main-street', tier: 'bronze' })[0]
    for (let i = 0; i < 2_000 && game().auction!.results.length === 0; i++) {
      if (game().auction!.high !== PLAYER_ID) expect(game().auctionBid()).toBe(true)
      beats(1)
    }
    const [result] = game().auction!.results
    expect(result.buyer).toBe(PLAYER_ID)
    expect(game().auctionWins).toEqual([
      expect.objectContaining({ lotId: lot.id, price: result.price }),
    ])
    expect(game().dayStats.auction.bought).toHaveLength(1)
  })

  it('refuses a bid the cash can’t cover', () => {
    tickTo(AUCTION_START)
    useGame.setState({ cash: nextBid(game().auction!) })
    expect(game().auctionBid()).toBe(false)
    expect(game().notice?.text).toBe(NO_CASH)
    expect(game().auction!.high).not.toBe(PLAYER_ID)
  })

  it('passing sells the lot to a dealer at once', () => {
    tickTo(AUCTION_START)
    game().auctionPass()
    const run = game().auction!
    expect(run.call).toBe('sold')
    expect(run.results[0].buyer).not.toBe(PLAYER_ID)
    expect(game().auctionWins).toEqual([])
  })

  it('runs every lot well before closing, and the morning clears it', () => {
    tickTo(AUCTION_START)
    for (let m = AUCTION_START + 10; m <= AUCTION_END && !game().auction!.over; m += 10) tickTo(m)
    expect(game().auction!.over).toBe(true)
    expect(game().auction!.results).toHaveLength(
      runList(WEDNESDAY, { rank: 'main-street', tier: 'bronze' }).length,
    )
    settle()
    game().startNextDay()
    expect(game().auction).toBeNull()
  })

  it('tells the morning of an auction day', () => {
    openOn(WEDNESDAY - 1)
    settle()
    game().startNextDay()
    expect(game().clock.day).toBe(WEDNESDAY)
    expect(game().notice?.text).toMatch(/auction day/)
  })
})

describe('inspection in the store', () => {
  /** The first Wednesday with a lot the sheet grades better than it is, and that lot. */
  function surpriseLot(): { day: number; lot: Lot } {
    for (let day = WEDNESDAY; ; day += 7) {
      const lot = runList(day, { rank: 'main-street', tier: 'bronze' }).find(
        (l) => l.grade !== gradeOf(l.car.condition),
      )
      if (lot) return { day, lot }
    }
  }

  it('inspects a lot on Monday for the fee, and it holds to the auction', () => {
    openOn(WEDNESDAY - 2)
    const lot = firstLot()
    expect(game().inspectLot(lot.id)).toBe(true)
    expect(game().cash).toBe(100_000 - INSPECT_FEE)
    expect(game().dayStats.auction.inspections).toBe(INSPECT_FEE)
    expect(game().notice?.text).toMatch(/inspected/)
    expect(game().inspectLot(lot.id)).toBe(false)
    expect(game().notice?.text).toBe('Already inspected.')
    settle()
    expect(game().log.at(-1)!.net).toBe(Math.round(netIncome(game().dayStats)))
    game().startNextDay()
    settle()
    game().startNextDay()
    expect(game().clock.day).toBe(WEDNESDAY)
    expect(game().inspected.map((i) => i.lotId)).toEqual([lot.id])
    // Bought on the inspection's grade.
    expect(game().buyLot(lot.id, 5_000)).toBe(true)
    expect(game().auctionWins[0].graded).toBe(game().inspected[0].grade)
    settle()
    game().startNextDay()
    expect(game().inspected).toEqual([])
  })

  it('won’t inspect a lot that has run, or before Main Street', () => {
    openOn(WEDNESDAY + 1)
    expect(game().inspectLot(firstLot().id)).toBe(false)
    expect(game().notice?.text).toMatch(/Too late/)
    openOn(WEDNESDAY - 1, 'corner-lot')
    expect(game().inspectLot(firstLot().id)).toBe(false)
    expect(game().cash).toBe(100_000)
  })

  it('stocks a lot at its true condition, and the morning names the surprise', () => {
    const { day, lot } = surpriseLot()
    openOn(day)
    expect(game().buyLot(lot.id, 3_000)).toBe(true)
    const { id } = game().auctionWins[0]
    settle()
    expect(game().dayStats.auction.surprises).toEqual([
      {
        model: lot.car.model,
        year: lot.car.year,
        graded: lot.grade,
        arrived: gradeOf(lot.car.condition),
      },
    ])
    expect(game().inventory.find((c) => c.id === id)!.used!.condition).toBe(lot.car.condition)
    game().startNextDay()
    expect(game().notice?.text).toContain(
      `graded ${lot.grade}, arrived ${gradeOf(lot.car.condition)}.`,
    )
  })
})

describe('the used-car manager in the store', () => {
  beforeEach(() => openOn(WEDNESDAY, 'main-street', OPEN_MINUTE))

  /** Hires a used-car manager from today's applicants and has them reach their post. */
  function hireManager(): string {
    const day = game().clock.day
    const candidates = generateCandidates(createRng(day), day, [], undefined, true)
    useGame.setState({ candidates })
    const c = candidates.find((x) => x.role === 'buyer')!
    game().hire(c.id)
    game().dispatchStaff({ type: 'atPost', id: c.id })
    return c.id
  }
  const tickTo = (minute: number) => {
    useGame.setState({ arrivals: { minutes: [], sources: [], spawned: 0 } })
    game().tickClock({ day: game().clock.day, minute })
  }

  it('is hired only once the auction is open', () => {
    openOn(WEDNESDAY, 'corner-lot')
    const candidates = generateCandidates(createRng(1), WEDNESDAY, [], undefined, true)
    useGame.setState({ candidates })
    game().hire(candidates.find((x) => x.role === 'buyer')!.id)
    expect(game().roster).toEqual([])
    expect(game().notice?.text).toMatch(/auction is open/)
  })

  it('takes max bids only with a manager, and drops them once the auction has run', () => {
    game().setMaxBid(firstLot().id, 5_000)
    expect(game().auctionBids).toEqual([])
    expect(game().notice?.text).toMatch(/used-car manager/)
    hireManager()
    game().setMaxBid(firstLot().id, 5_000)
    expect(maxBidFor(game().auctionBids, firstLot().id)).toBe(5_000)
    game().setMaxBid(firstLot().id, 0)
    expect(game().auctionBids).toEqual([])
    game().setMaxBid(firstLot().id, 5_000)
    settle()
    game().startNextDay()
    expect(game().auctionBids).toEqual([])
  })

  it('inspects lots for free, once each, counted as their work', () => {
    const id = hireManager()
    game().staffInspect(id, firstLot().id)
    game().staffInspect(id, firstLot().id)
    expect(game().inspected.map((i) => i.lotId)).toEqual([firstLot().id])
    expect(game().cash).toBe(100_000)
    expect(game().dayStats.staffWork[id].inspections).toBe(1)
    // Only the manager.
    game().staffInspect('nobody', runList(WEDNESDAY, { rank: 'main-street', tier: 'bronze' })[1].id)
    expect(game().inspected).toHaveLength(1)
  })

  it('wins a lot on its max bid at the auction while the player is busy', () => {
    const id = hireManager()
    const lot = firstLot()
    game().setMaxBid(lot.id, lotValue(lot, WEDNESDAY) * 2)
    tickTo(AUCTION_START)
    for (let i = 0; i < 2_000 && game().auction!.results.length === 0; i++) {
      game().tickAuction(game().auction!.minute + BEAT_MINUTES)
    }
    const [result] = game().auction!.results
    expect(result).toMatchObject({ lotId: lot.id, buyer: PLAYER_ID, proxy: true })
    expect(game().auctionWins).toEqual([expect.objectContaining({ lotId: lot.id })])
    expect(game().dayStats.staffWork[id].buys).toBe(1)
    expect(game().notice?.text).toMatch(/ won the .* at auction/)
  })

  it('bids nothing without a manager at work', () => {
    const id = hireManager()
    const lot = firstLot()
    game().setMaxBid(lot.id, lotValue(lot, WEDNESDAY) * 2)
    game().fire(id)
    tickTo(AUCTION_START)
    for (let i = 0; i < 2_000 && game().auction!.results.length === 0; i++) {
      game().tickAuction(game().auction!.minute + BEAT_MINUTES)
    }
    expect(game().auction!.results[0].buyer).not.toBe(PLAYER_ID)
    expect(game().auctionWins).toEqual([])
  })
})
