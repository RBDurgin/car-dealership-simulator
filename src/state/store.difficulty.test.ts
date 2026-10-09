import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { emptyStats } from '../sim/deal'
import { TUNING } from '../sim/difficulty'
import { FLOOR_PLAN_DAILY_RATE } from '../sim/floorPlan'
import { FIRST_NAZMA_DAY } from '../sim/nazma'
import { BASE_SLOTS, orderCost } from '../sim/ordering'
import { OWNER_BONUS } from '../sim/owner'
import { monthlyQuota } from '../sim/quota'
import { REPUTATION_POINTS, START_REPUTATION } from '../sim/reputation'
import { createSave } from '../sim/save'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()

/** Closes the doors and walks every customer and employee off the lot. */
function endDay() {
  game().tickClock({ day: game().clock.day, minute: CLOSE_MINUTE })
  for (const c of game().customers) game().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

describe('difficulty levels', () => {
  beforeEach(() => useGame.setState(initial, true))

  it('starts a new game at Medium unless told otherwise, the same as the store starts', () => {
    expect(initial.difficulty).toBe('medium')
    game().newGame()
    expect(game().difficulty).toBe('medium')
    expect(game().cash).toBe(initial.cash)
    expect(game().arrivals).toEqual(initial.arrivals)
    expect(game().candidates).toEqual(initial.candidates)
    expect(game().quota).toBe(initial.quota)
  })

  it('builds the same day 1 however often it’s built', () => {
    game().newGame('hard')
    const first = game().arrivals
    useGame.setState(initial, true)
    game().newGame('hard')
    expect(game().arrivals).toEqual(first)
  })

  it('starts each level with its own cash', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      useGame.setState(initial, true)
      game().newGame(d)
      expect(game()).toMatchObject({ difficulty: d, cash: TUNING[d].startingCash })
    }
    expect(TUNING.easy.startingCash).toBe(40_000)
  })

  it('orders at the level’s invoice', () => {
    game().newGame('hard')
    // A sedan is more than Hard's starting cash.
    expect(game().orderCar('sedan', 'cash')).toBe(false)
    game().orderCar('sedan', 'floor')
    const cost = orderCost('sedan', 1, TUNING.hard.invoice)
    expect(cost).toBeGreaterThan(orderCost('sedan', 1))
    expect(game().orders[0].cost).toBe(cost)
  })

  it('charges the level’s floor plan interest', () => {
    game().newGame('easy')
    game().orderCar('truck', 'floor')
    const cost = game().orders[0].cost
    endDay()
    game().startNextDay()
    endDay()
    expect(game().dayStats.interest).toBe(
      Math.round(cost * FLOOR_PLAN_DAILY_RATE * TUNING.easy.interest),
    )
  })

  it('brings more visitors on Easy than on Hard, and sets the level’s quota', () => {
    const day1 = (d: 'easy' | 'medium' | 'hard') => {
      useGame.setState(initial, true)
      game().newGame(d)
      return game()
    }
    const medium = day1('medium').arrivals.minutes.length
    expect(day1('easy').arrivals.minutes.length).toBeGreaterThan(medium)
    expect(day1('hard').arrivals.minutes.length).toBeLessThan(medium)
    expect(day1('hard').quota).toBe(
      monthlyQuota(0, BASE_SLOTS, START_REPUTATION, TUNING.hard.quota),
    )
  })

  it('makes customers patient and modest on Easy, impatient and greedy on Hard', () => {
    const walkIn = (d: 'easy' | 'medium' | 'hard') => {
      useGame.setState(initial, true)
      game().newGame(d)
      const id = game().walkIn('male-a')!
      return game().customers.find((c) => c.id === id)!
    }
    const medium = walkIn('medium')
    const easy = walkIn('easy')
    const hard = walkIn('hard')
    expect(easy.archetype).toBe(medium.archetype)
    expect(easy.patience).toBeGreaterThan(medium.patience)
    expect(hard.patience).toBeLessThan(medium.patience)
    expect(easy.expect).toBeLessThan(medium.expect)
    expect(hard.expect).toBeGreaterThan(medium.expect)
  })

  it('brings Nazma at the level’s first day', () => {
    const nazmaOn = (d: 'easy' | 'hard', day: number) => {
      useGame.setState(initial, true)
      game().newGame(d)
      game().loadGame({ ...createSave(game(), 0), day: day - 1 })
      return game().nazma
    }
    expect(nazmaOn('easy', FIRST_NAZMA_DAY)).toBeNull()
    expect(nazmaOn('easy', TUNING.easy.firstNazmaDay)).not.toBeNull()
    expect(nazmaOn('hard', TUNING.hard.firstNazmaDay)).not.toBeNull()
  })

  it('pays the level’s owner bonus and scales reputation at closing', () => {
    game().newGame('easy')
    useGame.setState({
      owner: { goal: { kind: 'noImpatient' }, announced: true },
      dayStats: { ...emptyStats(), refused: 5 },
    })
    const cash = game().cash
    endDay()
    expect(game().dayStats.owner?.bonus).toBe(2_000)
    expect(game().dayStats.owner?.bonus).toBeGreaterThan(OWNER_BONUS)
    expect(game().cash).toBe(cash + 2_000)
    expect(game().reputation).toBe(
      START_REPUTATION + Math.round(5 * REPUTATION_POINTS.refused * TUNING.easy.repLoss),
    )
  })

  it('keeps the level through a save', () => {
    game().newGame('easy')
    endDay()
    const save = JSON.parse(JSON.stringify(createSave(game(), 0)))
    expect(save.difficulty).toBe('easy')
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(game().difficulty).toBe('easy')
  })
})
