import { beforeEach, describe, expect, it } from 'vitest'
import { lotValue, SHEET_NOISE } from '../sim/auction'
import { AUCTION_END, AUCTION_START, RIVAL_BIDDER } from '../sim/bidding'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { freeSlots } from '../sim/ordering'
import { REPUTATION_POINTS, reputationChange } from '../sim/reputation'
import { emptyRival, type Rival } from '../sim/rival'
import { usedStockCar } from '../sim/usedCars'
import { auctionLotsFor, runListFor } from './selectors'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** His lot open, desperate and strong, so he bids high; no theft due tonight. */
const desperate = (day: number, patch: Partial<Rival> = {}): Rival => ({
  ...emptyRival(),
  status: 'open',
  generation: 1,
  openDay: 1,
  strength: 100,
  undercut: 0.04,
  shares: [0.02],
  lastTheftDay: day,
  ...patch,
})

/** A car he stole from us on `day`, a used sedan in good shape. */
const stolenCar = (day: number) => ({
  id: 'used-5-1',
  model: 'sedan' as const,
  how: 'stolen' as const,
  day,
  car: { year: 2022, miles: 40_000, condition: 0.8, acquiredDay: 2 },
})

/** A new game on `day` at Main Street, with cash, a used car (`used-1`) on the lot and his lot open. */
function openOn(day: number, rival: Rival) {
  useGame.setState(initial, true)
  game().newGame()
  const slot = freeSlots(game().inventory, []).find((s) => s.location === 'lot')!
  const car = usedStockCar(
    'used-1',
    { model: 'sedan', year: 2020, miles: 60_000, condition: 0.6, acquiredDay: 1 },
    slot,
    6_000,
    1,
    1,
  )
  useGame.setState({
    clock: { day, minute: OPEN_MINUTE + 60 },
    cash: 100_000,
    career: { ...game().career, rank: 'main-street' },
    customers: [],
    inventory: [...game().inventory, car],
    rival,
  })
}

function nextDay() {
  useGame.setState({
    clock: { ...game().clock, minute: CLOSE_MINUTE - 1 },
    arrivals: { minutes: [], sources: [], spawned: 0 },
    customers: [],
  })
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
  game().startNextDay()
  // Keep him as set: the morning may have moved his strength and shares.
  useGame.setState({ rival: { ...game().rival, strength: 100, shares: [0.02] } })
}

function runAuction() {
  for (let m = AUCTION_START; m <= AUCTION_END && !game().auction?.over; m += 10) {
    useGame.setState({ arrivals: { minutes: [], sources: [], spawned: 0 } })
    game().tickClock({ day: game().clock.day, minute: m })
  }
  expect(game().auction!.over).toBe(true)
}

describe('Nazma at the auction', () => {
  it('bids under his lot’s name while he’s open, and not before', () => {
    // Day 24 is a Wednesday; the morning before is day 23.
    openOn(23, desperate(23))
    nextDay()
    runAuction()
    const results = game().auction!.results
    expect(results.some((r) => r.buyer === game().rival.name && r.rival)).toBe(true)

    openOn(23, emptyRival())
    nextDay()
    runAuction()
    expect(game().auction!.results.some((r) => r.rival)).toBe(false)
  })

  it('puts a car of ours he buys at the auction on his lot', () => {
    openOn(23, desperate(23))
    expect(game().consign('used-1')).toBe(true)
    nextDay()
    runAuction()
    const lot = auctionLotsFor(game()).find((l) => l.consigned)!
    const result = game().auction!.results.find((r) => r.lotId === lot.id)!
    expect(result).toMatchObject({ buyer: game().rival.name, rival: true })
    expect(game().rival.lotCars).toMatchObject([
      { id: 'used-1', model: 'sedan', how: 'bought', day: 24 },
    ])
    expect(game().dayStats.wholesale.sold).toHaveLength(1)
  })
})

describe('buying back a car he stole', () => {
  // Day 10 is a Wednesday he runs a stolen car.
  beforeEach(() => {
    openOn(9, desperate(9, { lotCars: [stolenCar(5)] }))
    nextDay()
  })

  it('runs the car last, badged as ours, and says so in the morning', () => {
    const lots = auctionLotsFor(game())
    const stolen = lots.find((l) => l.stolen)!
    expect(stolen).toMatchObject({ stolen: 'used-5-1', order: runListFor(game()).length + 1 })
    expect(stolen.car).toMatchObject({ model: 'sedan', year: 2022, acquiredDay: 10 })
    expect(game().notice?.text).toMatch(/stole from you is in today's run, lot \d+: buy it back/)
  })

  it('takes it off his lot, stocks it tomorrow and lifts reputation', () => {
    const stolen = auctionLotsFor(game()).find((l) => l.stolen)!
    expect(game().buyLot(stolen.id, lotValue(stolen, 10))).toBe(true)
    expect(game().rival.lotCars).toEqual([])
    expect(game().dayStats.auction.bought).toMatchObject([{ stolen: true }])
    expect(game().notice?.text).toMatch(/^Bought back the 2022 .* Nazma.s Motors stole/)
    expect(reputationChange(game().dayStats)).toBe(REPUTATION_POINTS.buyBack)
    const win = game().auctionWins[0]
    nextDay()
    expect(game().inventory.some((c) => c.id === win.id && c.status === 'available')).toBe(true)
  })

  it('drops it from his lot when another dealer buys it', () => {
    game().auctionPass()
    runAuction()
    const stolen = auctionLotsFor(game()).find((l) => l.stolen)!
    const result = game().auction!.results.find((r) => r.lotId === stolen.id)!
    expect(result.buyer).not.toBeNull()
    expect(result.buyer).not.toBe(RIVAL_BIDDER)
    expect(game().rival.lotCars).toEqual([])
  })
})

describe('the auction levers', () => {
  it('reads the sheet further off on Hard and closer on Easy', () => {
    const over = (difficulty: 'easy' | 'medium' | 'hard') => {
      useGame.setState(initial, true)
      game().newGame(difficulty)
      useGame.setState({ career: { ...game().career, rank: 'main-street' } })
      const lots = Array.from({ length: 30 }, (_, w) => {
        useGame.setState({ clock: { day: 3 + w * 7, minute: OPEN_MINUTE } })
        return runListFor(game())
      }).flat()
      return Math.max(...lots.map((l) => l.reading - l.car.condition))
    }
    expect(over('easy')).toBeLessThanOrEqual(SHEET_NOISE * 0.7 + 1e-9)
    expect(over('medium')).toBeLessThanOrEqual(SHEET_NOISE + 1e-9)
    expect(over('hard')).toBeGreaterThan(SHEET_NOISE)
  })

  it('has the other dealers bid higher on Hard', () => {
    const firstBidders = (difficulty: 'medium' | 'hard') => {
      useGame.setState(initial, true)
      game().newGame(difficulty)
      useGame.setState({ career: { ...game().career, rank: 'main-street' } })
      useGame.setState({ clock: { day: 9, minute: OPEN_MINUTE + 60 }, customers: [] })
      nextDay()
      useGame.setState({ arrivals: { minutes: [], sources: [], spawned: 0 } })
      game().tickClock({ day: 10, minute: AUCTION_START })
      return game().auction!.bidders
    }
    const medium = firstBidders('medium')
    const hard = firstBidders('hard')
    expect(hard).toHaveLength(medium.length)
    hard.forEach((b, i) => expect(b.max / medium[i].max).toBeCloseTo(1.05, 1))
  })
})
