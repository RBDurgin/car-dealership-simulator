import { beforeEach, describe, expect, it } from 'vitest'
import { DAYS_PER_MONTH } from '../sim/calendar'
import { CLOSE_MINUTE } from '../sim/clock'
import { emptyStats, type Sale } from '../sim/deal'
import { emptyCareer, RANKS } from '../sim/progression'
import { createSave, parseSave } from '../sim/save'
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
    dayStats: { ...emptyStats(), sales },
  })
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

describe('career and ranks', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('starts a new game at Corner Lot with nothing on the books', () => {
    expect(game().career).toEqual(emptyCareer())
  })

  it('adds each settled day to the career', () => {
    endDay(sale(30_000, 27_000), sale(40_000, 36_000))
    expect(game().career).toMatchObject({ gross: 7_000, sales: 2, days: 1, monthGross: 7_000 })
    expect(game().dayStats.rankUp).toBeNull()
  })

  it('records a rank-up and announces it the next morning', () => {
    useGame.setState({ career: { ...emptyCareer(), gross: RANKS[1].gross - 1_000 } })
    endDay(sale(30_000, 28_000))
    expect(game().career.rank).toBe('main-street')
    expect(game().dayStats.rankUp).toBe('main-street')
    game().startNextDay()
    expect(game().notice?.text).toContain('Main Street')
    expect(game().dayStats.rankUp).toBeNull()
  })

  it('needs the level’s gross: more on Hard, less on Easy', () => {
    const career = { ...emptyCareer(), gross: RANKS[1].gross - 1_000 }
    game().newGame('hard')
    useGame.setState({ career })
    endDay(sale(30_000, 28_000))
    expect(game().career.rank).toBe('corner-lot')
    useGame.setState(initial, true)
    game().newGame('easy')
    useGame.setState({ career: { ...emptyCareer(), gross: 30_000 } })
    endDay()
    expect(game().career.rank).toBe('main-street')
  })

  it('counts the best month on the month’s last day', () => {
    useGame.setState({
      clock: { day: DAYS_PER_MONTH, minute: 600 },
      career: { ...emptyCareer(), monthGross: 20_000 },
    })
    endDay(sale(30_000, 27_000))
    expect(game().career).toMatchObject({ monthGross: 0, bestMonth: 23_000 })
  })

  it('keeps the career through a save', () => {
    endDay(sale(30_000, 27_000))
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 1))))!
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().career).toMatchObject({ gross: 3_000, sales: 1, days: 1 })
  })
})
