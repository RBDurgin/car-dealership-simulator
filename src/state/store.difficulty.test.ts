import { beforeEach, describe, expect, it } from 'vitest'
import { CLOSE_MINUTE } from '../sim/clock'
import { TUNING } from '../sim/difficulty'
import { FLOOR_PLAN_DAILY_RATE } from '../sim/floorPlan'
import { orderCost } from '../sim/ordering'
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
