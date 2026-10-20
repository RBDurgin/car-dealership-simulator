import { beforeEach, describe, expect, it } from 'vitest'
import { runList, wholesaleValue } from '../sim/auction'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { freeSlots } from '../sim/ordering'
import { NO_ROOM } from '../sim/sellers'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Day 3 is the first Wednesday. */
const WEDNESDAY = 3

/** A new game on `day` at Main Street, with cash to spend. */
function openOn(day: number, rank: 'corner-lot' | 'main-street' = 'main-street') {
  useGame.setState(initial, true)
  game().newGame()
  useGame.setState({
    clock: { day, minute: OPEN_MINUTE + 60 },
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
    expect(game().auctionWins[0].price).toBe(
      wholesaleValue(lots[0].car.model, lots[0].car, WEDNESDAY),
    )
  })
})
