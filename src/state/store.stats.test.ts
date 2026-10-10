import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { PLAYER_ID } from '../sim/customers'
import { emptyStats, netIncome, type Sale } from '../sim/deal'
import { createSave, parseSave } from '../sim/save'
import { emptyLifetime, emptyRecords } from '../sim/stats'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

const sale = (price: number, cost: number): Sale => ({
  customerName: 'Alex B.',
  carId: 'gone',
  model: 'van',
  price,
  msrp: price,
  cost,
  minute: 600,
  soldBy: null,
  signedBy: null,
  commission: 0,
  source: 'regular',
})

/** Ends the day with `sales` made and nobody else turning up, settling it. */
function endDay(...sales: Sale[]) {
  useGame.setState({
    arrivals: { minutes: [], sources: [], spawned: 0 },
    dayStats: { ...emptyStats(), sales, visitors: sales.length + 2 },
  })
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

describe('day log, lifetime totals and records', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('starts a new game with an empty log, from day 1', () => {
    expect(game()).toMatchObject({
      log: [],
      lifetime: emptyLifetime(),
      records: emptyRecords(),
      statsFrom: 1,
    })
  })

  it('logs each settled day exactly once', () => {
    endDay(sale(30_000, 27_000))
    expect(game().log).toHaveLength(1)
    expect(game().log[0]).toMatchObject({
      day: 1,
      sales: 1,
      gross: 3_000,
      net: netIncome(game().dayStats),
      visitors: 3,
      cash: game().cash,
      reputation: game().reputation,
    })
    // Anything that would settle again doesn't add a second record.
    game().tickClock({ day: 1, minute: CLOSE_MINUTE + 1 })
    expect(game().log).toHaveLength(1)
    expect(game().lifetime.sales).toBe(1)
    expect(game().lifetime.bySeller[PLAYER_ID]).toEqual({ sales: 1, gross: 3_000 })
  })

  it('keeps the lifetime gross with the career’s', () => {
    endDay(sale(30_000, 27_000), sale(40_000, 36_000))
    game().startNextDay()
    endDay(sale(25_000, 22_000))
    expect(game().lifetime.gross).toBe(game().career.gross)
    expect(game().lifetime.sales).toBe(game().career.sales)
  })

  it('records a broken record on the day that breaks it', () => {
    endDay(sale(30_000, 27_000))
    expect(game().dayStats.newRecords).toEqual([])
    game().startNextDay()
    expect(game().dayStats.newRecords).toEqual([])
    endDay(sale(30_000, 25_000))
    expect(game().dayStats.newRecords).toEqual(expect.arrayContaining(['bestDay', 'biggestDeal']))
    expect(game().records).toMatchObject({
      bestDay: { value: 5_000, day: 2 },
      streak: 2,
    })
  })

  it('takes an ad bought from the summary into the day’s record', () => {
    endDay(sale(30_000, 27_000))
    const before = game().log[0]
    expect(game().launchCampaign('newspaper')).toBe(true)
    const after = game().log[0]
    expect(after.marketing).toBeGreaterThan(before.marketing)
    expect(after.net).toBe(netIncome(game().dayStats))
    expect(game().lifetime.net).toBe(after.net)
  })

  it('keeps the log through a save', () => {
    endDay(sale(30_000, 27_000))
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 1))))!
    const { log, lifetime, records } = game()
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game()).toMatchObject({ log, lifetime, records, statsFrom: 1 })
  })
})
