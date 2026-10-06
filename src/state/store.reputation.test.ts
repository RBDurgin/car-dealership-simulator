import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { emptyStats, type DayStats, type Sale } from '../sim/deal'
import { CHANNELS } from '../sim/marketing'
import { MAX_REFERRALS, REPUTATION_POINTS, START_REPUTATION } from '../sim/reputation'
import { createSave, parseSave } from '../sim/save'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot, which settles the day. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

const sale: Sale = {
  customerName: 'Alex B.',
  carId: 'lot-car-1',
  model: 'van',
  price: 30_000,
  msrp: 30_000,
  cost: 26_000,
  minute: 600,
  soldBy: null,
  signedBy: null,
  commission: 0,
  source: 'regular',
}

/** Ends the day as if it had gone like `stats`, with nobody else turning up. */
function endDayWith(stats: Partial<DayStats>) {
  useGame.setState({ arrivals: { minutes: [], sources: [], spawned: 0 } })
  useGame.setState({ dayStats: { ...emptyStats(), ...stats } })
  endDay()
}

const count = (source: string) => game().arrivals.sources.filter((s) => s === source).length

describe('reputation', () => {
  beforeEach(() => {
    useGame.setState(initial, true)
    game().newGame()
  })

  it('starts in the middle', () => {
    expect(game().reputation).toBe(START_REPUTATION)
  })

  it('moves when the day is settled, and the summary has the change', () => {
    endDayWith({ sales: [sale, sale, sale], impatient: 1 })
    const change = 3 * REPUTATION_POINTS.sale + REPUTATION_POINTS.impatient
    expect(game().dayStats.settled).toBe(true)
    expect(game().reputation).toBe(START_REPUTATION + change)
    expect(game().dayStats.reputation).toBe(change)
    // Starting the next day doesn't settle it twice.
    game().startNextDay()
    expect(game().reputation).toBe(START_REPUTATION + change)
    expect(game().dayStats.reputation).toBe(0)
  })

  it('reports only the change that fits under 100', () => {
    useGame.setState({ reputation: 99 })
    endDayWith({ sales: [sale, sale] })
    expect(game().reputation).toBe(100)
    expect(game().dayStats.reputation).toBe(1)
  })

  it('brings referrals and more visitors with a good name', () => {
    endDay()
    useGame.setState({ reputation: 100 })
    game().startNextDay()
    expect(count('referral')).toBe(MAX_REFERRALS)
    const good = count('regular')
    useGame.setState(initial, true)
    game().newGame()
    endDay()
    useGame.setState({ reputation: START_REPUTATION })
    game().startNextDay()
    expect(count('referral')).toBe(0)
    expect(good).toBeGreaterThan(count('regular'))
  })

  it('makes ads bring more with a good name and fewer with a poor one', () => {
    game().launchCampaign('tv')
    endDay()
    useGame.setState({ reputation: 0 })
    game().startNextDay()
    // Half of the TV visitors (1.5): one, or two on a lucky roll.
    expect(count('tv')).toBeLessThan(CHANNELS.tv.visitors)
  })

  it('is judged by the owner on a reputation goal', () => {
    useGame.setState({ owner: { goal: { kind: 'reputation', points: 4 }, announced: true } })
    endDayWith({ sales: [sale, sale] })
    expect(game().dayStats.owner?.met).toBe(true)
  })

  it('keeps reputation through a save', () => {
    endDayWith({ sales: [sale] })
    const save = parseSave(JSON.parse(JSON.stringify(createSave(game(), 0))))!
    expect(save.reputation).toBe(START_REPUTATION + REPUTATION_POINTS.sale)
    game().startNextDay()
    const straight = game()
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().reputation).toBe(straight.reputation)
    expect(game().arrivals).toEqual(straight.arrivals)
  })
})
